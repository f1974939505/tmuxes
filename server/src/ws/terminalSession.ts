import { spawnPty, type PtyProcess } from '../ptyProcess.js';
import { homedir } from 'node:os';
import type { WebSocket } from 'ws';
import type { Target } from '../targets.js';
import { attachArgv } from '../tmux/builder.js';
import { resolveExecutable } from '../exe.js';
import { classifySsh } from './sshState.js';
import type { ClientControl, ServerControl } from './protocol.js';
import { log } from '../logger.js';
import { blockSshTarget } from '../sshManagement.js';

const HEARTBEAT_MS = 30_000;
const HIGH_WATER = 1 << 20; // bounded replay; slow viewers never pause the PTY
const KILL_GRACE_MS = 2_000;

/** One persistent PTY per target/session, shared across browser connections. */
export class TerminalSession {
  private readonly ptyProc: PtyProcess;
  private disposed = false;
  private clients = new Map<WebSocket, boolean>();
  private replay: Buffer[] = [];
  private replayBytes = 0;
  private cols: number;
  private rows: number;
  key: string;
  private heartbeat?: NodeJS.Timeout;
  private killTimer?: NodeJS.Timeout;
  /** Scan ssh output for failure/prompt states until the link looks healthy. */
  private sshScanBudget: number;

  constructor(
    ws: WebSocket,
    private readonly target: Target,
    private session: string,
    cols: number,
    rows: number,
  ) {
    this.key = `${target.id}/${session}`;
    this.cols = cols; this.rows = rows;
    this.sshScanBudget = target.kind === 'ssh' ? 8192 : 0;

    const { file, args } = attachArgv(target, session);
    // node-pty on Windows needs a full exe path (no PATH/.exe resolution).
    this.ptyProc = spawnPty(resolveExecutable(file), args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: homedir(),
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    this.ptyProc.onData((data) => this.onPtyData(data));
    this.ptyProc.onExit(({ exitCode }) => this.onPtyExit(exitCode));

    this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_MS);
    this.attach(ws, cols, rows);
  }

  /** Browser remounts and tab switches reuse the PTY instead of reopening SSH. */
  attach(ws: WebSocket, cols: number, rows: number): void {
    if (this.disposed) { ws.close(); return; }
    this.clients.set(ws, true);
    ws.on('message', (data, isBinary) => this.onClientMessage(data, isBinary));
    ws.on('close', () => this.clients.delete(ws));
    ws.on('error', () => this.clients.delete(ws));
    ws.on('pong', () => this.clients.set(ws, true));
    if (this.replay.length) ws.send(Buffer.concat(this.replay), { binary: true });
    this.resize(cols, rows);
    ws.send(JSON.stringify({ type: 'ready', target: this.target.id, session: this.session }));
  }

  rename(session: string): void {
    this.session = session;
    this.key = `${this.target.id}/${session}`;
  }

  private onPtyData(data: string): void {
    if (this.sshScanBudget > 0) {
      this.sshScanBudget -= data.length;
      const ssh = classifySsh(data);
      if (ssh) this.sendControl({ type: 'ssh', state: ssh.state, message: ssh.message });
    }
    this.sendBinary(Buffer.from(data, 'utf8'));
  }

  private onPtyExit(exitCode: number | null): void {
    if (!this.disposed && this.target.kind === 'ssh' && exitCode !== 0) blockSshTarget(this.target);
    this.sendControl({ type: 'exit', code: exitCode });
    this.closeWs(1000, 'pty exited');
    this.dispose();
  }

  private onClientMessage(data: unknown, isBinary: boolean): void {
    if (this.disposed) return;
    if (isBinary) {
      // Raw keystrokes → straight into the PTY.
      this.ptyProc.write(toBufferString(data));
      return;
    }
    let msg: ClientControl;
    try {
      msg = JSON.parse(toBufferString(data)) as ClientControl;
    } catch {
      return; // ignore malformed control frames
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    if (msg.type === 'resize') {
      const cols = clampDim(msg.cols);
      const rows = clampDim(msg.rows);
      if (cols && rows) {
        try {
          this.resize(cols, rows);
        } catch {
          /* pty may have exited */
        }
      }
    } else if (msg.type === 'ping') {
      this.sendControl({ type: 'pong' });
    }
  }

  private resize(cols: number, rows: number): void {
    if (this.cols === cols && this.rows === rows) return;
    this.cols = cols; this.rows = rows;
    this.ptyProc.resize(cols, rows);
  }

  private sendBinary(buf: Buffer): void {
    if (this.disposed) return;
    // Keep whole recent chunks, without copying 1 MiB for every small PTY write.
    const tail = buf.length > HIGH_WATER ? Buffer.from(buf.subarray(-HIGH_WATER)) : buf;
    this.replay.push(tail); this.replayBytes += tail.length;
    while ((this.replayBytes > HIGH_WATER || this.replay.length > 2048) && this.replay.length > 1) {
      this.replayBytes -= this.replay.shift()!.length;
    }
    for (const ws of this.clients.keys()) {
      if (ws.readyState !== ws.OPEN) { this.clients.delete(ws); continue; }
      if (ws.bufferedAmount + buf.length > 4 * HIGH_WATER) {
        log.warn(`Slow terminal viewer detached from ${this.key}; PTY kept alive`);
        this.clients.delete(ws);
        ws.terminate();
        continue;
      }
      ws.send(buf, { binary: true }, error => { if (error) this.clients.delete(ws); });
    }
  }

  private sendControl(msg: ServerControl): void {
    if (this.disposed) return;
    for (const ws of this.clients.keys()) if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg), { binary: false });
  }

  private tick(): void {
    for (const [ws, alive] of this.clients) {
      if (!alive) {
        this.clients.delete(ws);
        ws.terminate();
        continue;
      }
      this.clients.set(ws, false);
      try { ws.ping(); } catch { this.clients.delete(ws); }
    }
  }

  private closeWs(code: number, reason: string): void {
    try {
      for (const ws of this.clients.keys()) if (ws.readyState === ws.OPEN) ws.close(code, reason);
      this.clients.clear();
    } catch {
      /* ignore */
    }
  }

  /** Idempotent teardown — called from PTY exit and server shutdown. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.heartbeat) clearInterval(this.heartbeat);

    try {
      this.ptyProc.kill(); // SIGHUP → tmux client detaches; session keeps running
    } catch {
      /* already gone */
    }
    // Force-kill if it lingers.
    this.killTimer = setTimeout(() => {
      try {
        if (process.platform !== 'win32') this.ptyProc.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }, KILL_GRACE_MS);
    this.killTimer.unref?.();

    this.closeWs(1000, 'disposed');
    registry.delete(this);
  }
}

function toBufferString(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return String(data);
}

function clampDim(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 1000) return null;
  return n;
}

/** All live sessions, so the process can tear them down on shutdown. */
export const registry = new Set<TerminalSession>();

export function track(s: TerminalSession): void {
  registry.add(s);
}

export function existingTerminal(targetId: string, session: string): TerminalSession | undefined {
  return [...registry].find(item => item.key === `${targetId}/${session}`);
}

export function disposeAll(): void {
  for (const s of [...registry]) s.dispose();
}
