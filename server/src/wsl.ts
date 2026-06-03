import { runCommand } from './exec.js';
import { log } from './logger.js';

/** Distros that exist for the container runtime, never for interactive use. */
const SYSTEM_DISTROS = /^docker-desktop(-data)?$/i;

const NUL = 0;
const BOM = 0xfeff;

/**
 * Enumerate installed WSL distros (Windows only). `wsl.exe -l -q` prints names
 * one per line in UTF-16LE (with a BOM), so we decode accordingly.
 */
export async function listWslDistros(): Promise<string[]> {
  const r = await runCommand('wsl.exe', ['-l', '-q'], { encoding: 'utf16le', timeoutMs: 8000 });
  if (r.code !== 0) {
    if (r.stdout.trim() || r.stderr.trim()) {
      log.warn(`wsl.exe -l -q failed: ${(r.stderr || r.stdout).trim().split('\n')[0]}`);
    }
    return [];
  }
  return parseWslList(r.stdout);
}

/** Parse `wsl.exe -l -q` decoded output into clean distro names. */
export function parseWslList(stdout: string): string[] {
  // Drop NULs / BOM via code point so the source stays pure ASCII.
  const cleaned = Array.from(stdout)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c !== NUL && c !== BOM;
    })
    .join('');
  return cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((name) => name.length > 0 && !SYSTEM_DISTROS.test(name));
}
