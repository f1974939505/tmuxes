import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { format } from 'node:util';

export const logPath = join(process.env.TMUXES_LOG_DIR ||
  (process.platform === 'win32' ? join(process.env.LOCALAPPDATA || homedir(), 'tmuxes', 'logs')
    : join(homedir(), '.local', 'state', 'tmuxes', 'logs')), `server-${process.pid}.log`);
let writing = Promise.resolve();
let queued = 0;
let directoryReady = false;
/** Bounded asynchronous diagnostic log. Never records terminal bytes or credentials. */
function write(level: string, message: string, rest: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${level}${format(message, ...rest)}\n`;
  if (level === 'ERROR ') console.error(line.trimEnd());
  else if (level === 'WARN ') console.warn(line.trimEnd());
  else console.log(line.trimEnd());
  if (queued >= 128) return;
  queued++;
  writing = writing.then(async () => {
    if (!directoryReady) { await mkdir(join(logPath, '..'), { recursive: true }); directoryReady = true; }
    const size = await stat(logPath).then(s => s.size, () => 0);
    if (size >= 1024 * 1024) await rename(logPath, `${logPath}.1`).catch(() => {});
    await appendFile(logPath, line.slice(0, 16 * 1024), { encoding: 'utf8', mode: 0o600 });
  }).catch(() => { /* diagnostic I/O must not stop terminals */ }).finally(() => { queued--; });
}
export function flushLogs(): Promise<void> { return writing; }
export const log = {
  info: (message: string, ...rest: unknown[]): void => write('', message, rest),
  warn: (message: string, ...rest: unknown[]): void => write('WARN ', message, rest),
  error: (message: string, ...rest: unknown[]): void => write('ERROR ', message, rest),
};
