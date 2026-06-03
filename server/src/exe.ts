import { existsSync } from 'node:fs';
import { isAbsolute, join, delimiter } from 'node:path';
import { isWindows } from './platform.js';

/**
 * Resolve a command name to a full path for node-pty on Windows.
 *
 * Unlike child_process.spawn, node-pty's ConPTY path does NOT search PATH or
 * append a PATHEXT extension, so `pty.spawn('ssh', …)` fails with
 * "File not found". We resolve the executable ourselves (PATH + common system
 * locations). On POSIX, execvp already searches PATH, so the name is returned
 * unchanged.
 */
export function resolveExecutable(file: string): string {
  if (!isWindows) return file;
  if (isAbsolute(file) && existsSync(file)) return file;

  const hasExt = /\.[A-Za-z0-9]+$/.test(file);
  const exts = hasExt ? [''] : (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';');
  const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  const dirs = [
    ...(process.env.PATH || '').split(delimiter),
    join(sysRoot, 'System32'),
    join(sysRoot, 'System32', 'OpenSSH'), // ssh.exe ships here, not always on PATH
  ];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, file + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return file; // fall back; node-pty surfaces a clear error if truly missing
}
