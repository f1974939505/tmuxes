import * as pty from 'node-pty';
import { homedir } from 'node:os';
import type { WebSocket } from 'ws';
import type { Target } from '../targets.js';
import { attachArgv } from '../tmux/builder.js';
import { resolveExecutable } from '../exe.js';
import { classifySsh } from './sshState.js';
import type { ClientControl, ServerControl } from './protocol.js';
import { log } from '../logger.js';

const HEARTBEAT_MS = 30_000;
const HIGH_WATER = 1 << 20; // 1 MiB buffered → pause the PTY
const LOW_WATER = 1 << 18; // 256 KiB → resume
const KILL_GRACE_MS = 2_000;

/** Owns exactly one PTY for one WebSocket. dispose() is idempotent. */
export class TerminalSession {
  private readonly ptyProc: pty.IPty;
  private disposed = false;
  private alive = true;
  private paused = false;
  private heartbeat?: NodeJS.Timeout;
  private drainTimer?: NodeJS.Timeout;
  private killTimer?: NodeJS.Timeout;
  /** Scan ssh output for failure/prompt states until the link looks healthy. */
  private sshScanBudget: number;

  constructor(
    private readonly ws: WebSocket,
    private readonly target: Target,
    private readonly session: string,
    cols: number,
    rows: number,
  ) {
    this.sshScanBudget = target.kind === 'ssh' ? 8192 : 0;

    const { file, args } = attachArgv(target, session);
    // node-pty on Windows needs a full exe path (no PATH/.exe resolution).
    this.ptyProc = pty.spawn(resolveExecutable(file), args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: homedir(),
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    this.ptyProc.onData((data) => this.onPtyData(data));
    this.ptyProc.onExit(({ exitCode }) => this.onPtyExit(exitCode));

    this.ws.on('message', (data, isBinary) => this.onClientMessage(data, isBinary));
    this.ws.on('close', () => this.dispose());
    this.ws.on('error', () => this.dispose());
    this.ws.on('pong', () => {
      this.alive = true;
    });

    this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_MS);

    this.sendControl({ type: 'ready', target: target.id, session });
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
    if (msg.type === 'resize') {
      const cols = clampDim(msg.cols);
      const rows = clampDim(msg.rows);
      if (cols && rows) {
        try {
          this.ptyProc.resize(cols, rows);
        } catch {
          /* pty may have exited */
        }
      }
    } else if (msg.type === 'ping') {
      this.sendControl({ type: 'pong' });
    }
  }

  private sendBinary(buf: Buffer): void {
    if (this.disposed || this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(buf, { binary: true });
    if (!this.paused && this.ws.bufferedAmount > HIGH_WATER) {
      this.paused = true;
      this.ptyProc.pause();
      this.drainTimer = setInterval(() => this.checkDrain(), 50);
    }
  }

  private checkDrain(): void {
    if (this.disposed) return;
    if (this.ws.bufferedAmount < LOW_WATER) {
      this.paused = false;
      if (this.drainTimer) clearInterval(this.drainTimer);
      this.drainTimer = undefined;
      this.ptyProc.resume();
    }
  }

  private sendControl(msg: ServerControl): void {
    if (this.disposed || this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(msg), { binary: false });
  }

  private tick(): void {
    if (!this.alive) {
      log.warn(`heartbeat lost for ${this.target.id}/${this.session}, terminating`);
      try {
        this.ws.terminate();
      } catch {
        /* ignore */
      }
      this.dispose();
      return;
    }
    this.alive = false;
    try {
      this.ws.ping();
    } catch {
      /* ignore */
    }
  }

  private closeWs(code: number, reason: string): void {
    try {
      if (this.ws.readyState === this.ws.OPEN) this.ws.close(code, reason);
    } catch {
      /* ignore */
    }
  }

  /** Idempotent teardown — called from pty exit, ws close, and shutdown. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.drainTimer) clearInterval(this.drainTimer);

    try {
      this.ptyProc.kill(); // SIGHUP → tmux client detaches; session keeps running
    } catch {
      /* already gone */
    }
    // Force-kill if it lingers.
    this.killTimer = setTimeout(() => {
      try {
        this.ptyProc.kill('SIGKILL');
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

export function disposeAll(): void {
  for (const s of [...registry]) s.dispose();
}
