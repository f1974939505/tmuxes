import { spawn } from 'node:child_process';

export interface CommandResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  timeoutMs?: number;
  /** stdout decoding — wsl.exe emits UTF-16LE, everything else is UTF-8. */
  encoding?: BufferEncoding;
  /** Written to the child's stdin (then closed) — used to pipe file contents. */
  input?: string;
}

/**
 * Run a command as an argv array with NO shell. Never rejects — a nonzero exit
 * or spawn error resolves with the captured output so callers can interpret it
 * (e.g. tmux "no server running" is a normal empty case, not a throw).
 */
export function runCommand(file: string, args: string[], opts: RunOptions = {}): Promise<CommandResult> {
  const encoding = opts.encoding ?? 'utf8';
  return new Promise((resolve) => {
    const child = spawn(file, args, { shell: false });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let settled = false;

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL');
        }, opts.timeoutMs)
      : null;

    child.stdout.on('data', (d: Buffer) => outChunks.push(d));
    child.stderr.on('data', (d: Buffer) => errChunks.push(d));

    if (opts.input !== undefined) {
      child.stdin.on('error', () => {
        /* ignore EPIPE if the child exits early */
      });
      child.stdin.end(opts.input);
    }

    const done = (code: number | null, signal: NodeJS.Signals | null, extraErr?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const stderr = Buffer.concat(errChunks).toString(encoding) + (extraErr ?? '');
      resolve({ code, signal, stdout: Buffer.concat(outChunks).toString(encoding), stderr });
    };

    child.on('error', (err) => {
      // e.g. ENOENT when ssh/tmux/wsl.exe is missing — surface as a failed result.
      done(null, null, err.message);
    });
    child.on('close', (code, signal) => done(code, signal));
  });
}
