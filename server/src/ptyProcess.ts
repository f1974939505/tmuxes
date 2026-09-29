import * as pty from 'node-pty';
import { fork, spawn, type ChildProcess, type ForkOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { log } from './logger.js';

export type PtyProcess = Pick<pty.IPty, 'write' | 'resize' | 'kill' | 'onData' | 'onExit'>;
type Request = { id: number; type: string; [key: string]: unknown };
const hosts = new Set<IsolatedPty>();

/** Windows native PTY calls can block indefinitely. Never run them in the HTTP process. */
export class IsolatedPty implements PtyProcess {
  private child: ChildProcess;
  private events = new EventEmitter();
  private serial = 0;
  private pending?: { id: number; timer: NodeJS.Timeout };
  private queue: Request[] = [];
  private queuedBytes = 0;
  private closing = false;
  private ended = false;
  private forcing = false;
  private exitCode?: number;
  private watchdog?: NodeJS.Timeout;
  private resolveStopped!: () => void;
  readonly stopped = new Promise<void>(resolve => { this.resolveStopped = resolve; });

  constructor(file: string, args: string[], options: pty.IPtyForkOptions,
              worker = new URL('./ptyHost.js', import.meta.url)) {
    // tsx development runs have source files only; published builds use plain Node.
    if (!existsSync(worker) && worker.pathname.endsWith('/ptyHost.js')) worker = new URL('./ptyHost.ts', import.meta.url);
    this.child = fork(worker, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
      execArgv: worker.pathname.endsWith('.ts') ? ['--import', 'tsx/esm'] : [] } as ForkOptions & { windowsHide: boolean });
    hosts.add(this);
    this.child.on('message', (raw: unknown) => {
      const msg = raw as { type: string; id: number; data: string; code: number; message: string };
      if (msg.type === 'data' && !this.closing) this.events.emit('data', msg.data);
      if (msg.type === 'error') log.warn(`PTY host ${this.child.pid}: ${msg.message}`);
      if (msg.type === 'ack' && msg.id === this.pending?.id) {
        clearTimeout(this.pending.timer); this.pending = undefined; this.flush();
      }
      if (msg.type === 'exit') this.exitCode = msg.code;
    });
    this.child.on('error', error => { log.warn(`PTY host failed: ${error.message}`); this.finish(1); });
    this.child.on('exit', code => this.finish(this.exitCode ?? code ?? 1));
    this.enqueue('spawn', { file, args, options });
  }

  onData = (listener: (data: string) => void) => {
    this.events.on('data', listener);
    return { dispose: () => { this.events.off('data', listener); } };
  };
  onExit = (listener: (event: { exitCode: number; signal?: number }) => void) => {
    this.events.on('exit', listener);
    return { dispose: () => { this.events.off('exit', listener); } };
  };
  write(data: string | Buffer): void {
    this.enqueue('write', { data: Buffer.isBuffer(data) ? data.toString('base64') : data,
      binary: Buffer.isBuffer(data), bytes: Buffer.byteLength(data) });
  }
  resize(cols: number, rows: number): void {
    // One pending resize at most; input ordering is otherwise preserved.
    this.queue = this.queue.filter(x => x.type !== 'resize');
    this.enqueue('resize', { cols, rows });
  }
  private enqueue(type: string, fields: Record<string, unknown>): void {
    if (this.closing) return;
    if (type === 'write') this.queuedBytes += fields.bytes as number;
    if (this.queuedBytes > 256 * 1024 || this.queue.length > 1024) {
      log.warn(`PTY host ${this.child.pid} input queue overflow; detaching local client`);
      this.kill(); return;
    }
    this.queue.push({ id: ++this.serial, type, ...fields }); this.flush();
  }
  private flush(): void {
    if (this.closing || this.pending || !this.queue.length) return;
    const request = this.queue.shift()!;
    if (request.type === 'write') this.queuedBytes -= request.bytes as number;
    this.pending = { id: request.id, timer: setTimeout(() => {
      log.warn(`PTY host ${this.child.pid} ${request.type} timed out; no automatic reconnect`);
      this.kill();
    }, 10_000) };
    this.child.send?.(request, error => { if (error) this.kill(); });
  }
  kill(): void {
    if (this.closing) return;
    this.closing = true;
    this.queue = []; this.queuedBytes = 0;
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = undefined;
    // Set the independent parent deadline BEFORE asking the native host to close.
    this.watchdog = setTimeout(() => this.force(), 2000);
    if (this.child.connected) this.child.send?.({ type: 'kill' }, () => {});
    else this.force();
  }
  private force(): void {
    if (this.ended || this.forcing) return;
    this.forcing = true;
    log.warn(`Force closing local PTY host ${this.child.pid}`);
    if (process.platform === 'win32' && this.child.pid) {
      const killer = spawn('taskkill', ['/PID', String(this.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => { this.child.kill('SIGKILL'); });
      killer.on('exit', code => { if (code && !this.ended) this.child.kill('SIGKILL'); });
    } else this.child.kill('SIGKILL');
  }
  private finish(code: number): void {
    if (this.ended) return;
    this.ended = this.closing = true;
    if (this.pending) clearTimeout(this.pending.timer);
    if (this.watchdog) clearTimeout(this.watchdog);
    this.queue = []; hosts.delete(this); this.resolveStopped();
    this.events.emit('exit', { exitCode: code });
  }
}

export function spawnPty(file: string, args: string[], options: pty.IPtyForkOptions): PtyProcess {
  return process.platform === 'win32' ? new IsolatedPty(file, args, options) : pty.spawn(file, args, options);
}
export async function stopPtyHosts(): Promise<void> {
  const current = [...hosts];
  for (const host of current) host.kill();
  await Promise.all(current.map(host => host.stopped));
}
