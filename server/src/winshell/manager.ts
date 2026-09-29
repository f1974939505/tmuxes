import { spawnPty, type PtyProcess } from '../ptyProcess.js';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isWindows } from '../platform.js';
import { log } from '../logger.js';
import { TerminalScreen } from '../terminalScreen.js';
import type { ServerControl } from '../ws/protocol.js';
import type { SessionInfo, WindowInfo } from '../tmux/formats.js';

/** A definition of a launchable shell. */
export interface ShellDef {
  id: string;
  label: string;
  file: string;
  args: string[];
}

/** What the manager needs from an attached WebSocket — kept abstract so the
 *  session logic is testable without a real socket. */
export interface ShellClient {
  id: number;
  sendBinary(buf: Buffer): void;
  sendControl(msg: ServerControl): void;
  isOpen(): boolean;
  close(code: number, reason: string): void;
}

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

/** One persistent native shell (its own pty), shared by 0..N attached clients.
 *  Survives client disconnects (the pty lives until killed or it exits), which
 *  is what gives "refresh / reconnect / multi-tab" persistence. */
export class WinShellSession {
  readonly created = nowEpoch();
  private clients = new Set<ShellClient>();
  private pendingClients = new Set<ShellClient>();
  private readonly screen: TerminalScreen;
  private disposed = false;
  /** epoch seconds of last pty output — drives idle/attention detection */
  private lastActivity = nowEpoch();

  constructor(
    public name: string,
    readonly shell: ShellDef,
    private readonly ptyProc: PtyProcess,
    private readonly onClosed: (name: string) => void,
    cols = 80, rows = 24,
  ) {
    this.screen = new TerminalScreen(cols, rows);
    this.ptyProc.onData((d) => this.onData(d));
    this.ptyProc.onExit(({ exitCode }) => this.onExit(exitCode));
  }

  get attached(): boolean {
    return this.clients.size > 0;
  }

  private onData(data: string): void {
    this.lastActivity = nowEpoch();
    const buf = Buffer.from(data, 'utf8');
    if (!this.screen.write(data, () => {
      for (const c of this.clients) if (c.isOpen()) c.sendBinary(buf);
    })) this.dispose();
  }

  private onExit(code: number | null): void {
    if (this.disposed) return;
    this.disposed = true;
    this.screen.dispose();
    for (const c of [...this.clients, ...this.pendingClients]) {
      c.sendControl({ type: 'exit', code });
      c.close(1000, 'shell exited');
    }
    this.clients.clear();
    this.pendingClients.clear();
    this.onClosed(this.name);
  }

  /** Restore terminal state before streaming live output and sending ready. */
  attach(client: ShellClient, ready?: () => void): void {
    this.pendingClients.add(client);
    this.screen.snapshot(screen => {
      if (this.disposed) return;
      if (!this.pendingClients.delete(client) || !client.isOpen()) return;
      if (!screen) { this.detach(client); client.close(1011, 'Terminal snapshot unavailable'); return; }
      client.sendControl({ type: 'restore', ...screen });
      this.clients.add(client);
      ready?.();
    });
  }

  detach(client: ShellClient): void {
    this.pendingClients.delete(client);
    this.clients.delete(client); // pty stays alive — persistence across reconnects
  }

  write(data: string | Buffer): void {
    if (!this.disposed) this.ptyProc.write(data);
  }

  resize(cols: number, rows: number): void {
    this.screen.resize(cols, rows, () => {
      for (const c of this.clients) if (c.isOpen()) c.sendControl({ type: 'geometry', cols, rows });
      try { this.ptyProc.resize(cols, rows); } catch { /* pty exited */ }
    });
  }

  info(): SessionInfo {
    return {
      name: this.name,
      windows: 1,
      attached: this.attached,
      created: this.created,
      lastActivity: this.lastActivity,
    };
  }

  dispose(): void {
    if (this.disposed) {
      this.onClosed(this.name);
      return;
    }
    this.disposed = true;
    this.screen.dispose();
    try {
      this.ptyProc.kill();
    } catch {
      /* already gone */
    }
    for (const c of [...this.clients, ...this.pendingClients]) c.close(1000, 'killed');
    this.clients.clear();
    this.pendingClients.clear();
    this.onClosed(this.name);
  }
}

const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Owns all native shell sessions for the local Windows machine. */
export class WinShellManager {
  private sessions = new Map<string, WinShellSession>();
  private shells: ShellDef[];

  constructor(shells?: ShellDef[]) {
    this.shells = shells ?? detectShells();
  }

  listShells(): { id: string; label: string }[] {
    return this.shells.map((s) => ({ id: s.id, label: s.label }));
  }

  private resolveShell(shellId?: string): ShellDef {
    if (shellId) {
      const found = this.shells.find((s) => s.id === shellId);
      if (found) return found;
    }
    if (this.shells.length === 0) throw new Error('no shell available');
    return this.shells[0];
  }

  list(): SessionInfo[] {
    return [...this.sessions.values()]
      .map((s) => s.info())
      .sort((a, b) => a.created - b.created);
  }

  windows(name: string): WindowInfo[] {
    const s = this.sessions.get(name);
    if (!s) return [];
    return [{ index: 0, name: s.shell.label, panes: 1, active: true }];
  }

  has(name: string): boolean {
    return this.sessions.has(name);
  }

  private autoName(shell: ShellDef): string {
    for (let i = 1; i < 10000; i++) {
      const candidate = `${shell.id}-${i}`;
      if (!this.sessions.has(candidate)) return candidate;
    }
    return `${shell.id}-${nowEpoch()}`;
  }

  /** Create a new shell session. Returns the (possibly auto-assigned) name. */
  create(opts: { name?: string; shellId?: string; command?: string; cols?: number; rows?: number }): {
    name: string;
  } {
    const shell = this.resolveShell(opts.shellId);
    const name = opts.name ?? this.autoName(shell);
    if (!NAME_RE.test(name)) throw new ManagerError(400, 'invalid session name');
    if (this.sessions.has(name)) throw new ManagerError(409, `session "${name}" already exists`);

    const cols = opts.cols ?? 80;
    const rows = opts.rows ?? 24;
    let proc: PtyProcess;
    try {
      proc = spawnPty(shell.file, shell.args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: homedir(),
        env: { ...process.env, TERM: 'xterm-256color' },
      });
    } catch (e) {
      throw new ManagerError(502, `failed to start ${shell.label}: ${(e as Error).message}`);
    }

    const session = new WinShellSession(name, shell, proc, (n) => this.sessions.delete(n), cols, rows);
    this.sessions.set(name, session);
    if (opts.command && opts.command.length > 0) session.write(`${opts.command}\r`);
    log.info(`winshell created ${name} (${shell.label})`);
    return { name };
  }

  rename(oldName: string, newName: string): void {
    if (!NAME_RE.test(newName)) throw new ManagerError(400, 'invalid new session name');
    const s = this.sessions.get(oldName);
    if (!s) throw new ManagerError(404, `session "${oldName}" not found`);
    if (this.sessions.has(newName)) throw new ManagerError(409, `session "${newName}" already exists`);
    // Re-key the same live instance (its pty handlers read `this.name`).
    this.sessions.delete(oldName);
    s.name = newName;
    this.sessions.set(newName, s);
  }

  kill(name: string): void {
    const s = this.sessions.get(name);
    if (!s) throw new ManagerError(404, `session "${name}" not found`);
    s.dispose();
  }

  /** Attach a client to an existing session, creating it (default shell) if missing. */
  attachOrCreate(name: string, cols: number, rows: number, client: ShellClient, ready?: () => void): WinShellSession {
    let s = this.sessions.get(name);
    if (!s) {
      this.create({ name, cols, rows });
      s = this.sessions.get(name)!;
    } else {
      s.resize(cols, rows);
    }
    s.attach(client, ready);
    return s;
  }

  disposeAll(): void {
    for (const s of [...this.sessions.values()]) s.dispose();
  }
}

/** Manager error carrying an HTTP status for the router. */
export class ManagerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ManagerError';
  }
}

/** Detect launchable shells for this machine. Windows: PowerShell 7 (if on
 *  PATH) → Windows PowerShell → cmd → Git Bash. Otherwise (test/fake): the
 *  user's shell, so the whole path can be exercised on Linux. */
export function detectShells(): ShellDef[] {
  if (!isWindows) {
    const file = process.env.SHELL || '/bin/bash';
    return [{ id: 'shell', label: file.split('/').pop() || 'shell', file, args: ['-i'] }];
  }

  const shells: ShellDef[] = [];
  const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';

  const pwsh = findOnPath('pwsh.exe');
  if (pwsh) shells.push({ id: 'pwsh', label: 'PowerShell 7', file: pwsh, args: ['-NoLogo'] });

  const winPs = join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  if (existsSync(winPs)) shells.push({ id: 'powershell', label: 'Windows PowerShell', file: winPs, args: ['-NoLogo'] });

  const cmd = join(sysRoot, 'System32', 'cmd.exe');
  if (existsSync(cmd)) shells.push({ id: 'cmd', label: 'Command Prompt', file: cmd, args: [] });

  const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
  if (existsSync(gitBash)) shells.push({ id: 'gitbash', label: 'Git Bash', file: gitBash, args: ['-i', '-l'] });

  // Last-resort fallback so the target is never shell-less.
  if (shells.length === 0) shells.push({ id: 'cmd', label: 'Command Prompt', file: 'cmd.exe', args: [] });
  return shells;
}

function findOnPath(exe: string): string | null {
  const dirs = (process.env.PATH || '').split(isWindows ? ';' : ':');
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = join(dir, exe);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Singleton used by the REST and WS layers. */
export const winShell = new WinShellManager();
