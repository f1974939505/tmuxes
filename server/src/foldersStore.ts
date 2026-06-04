import { promises as fsp } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { config } from './config.js';
import { sshClientArgs, sshQuote } from './tmux/builder.js';
import type { Target } from './targets.js';
import { TmuxError } from './tmux/sessions.js';
import { runTargetCommand } from './targetCommand.js';

/**
 * Sidebar folder organization, stored ON THE TARGET so it follows the cluster:
 * every client connecting to the same target reads/writes the same file, so the
 * folder tree syncs across browsers and machines (like the tmux sessions do).
 *
 * Path: $HOME/.config/tmuxes/folders.json on the target.
 * - local / winlocal → the server's own filesystem (fs).
 * - ssh             → the remote $HOME (ssh runs commands from $HOME).
 * - wsl             → the distro's $HOME (`wsl --cd ~`).
 */

const REL = '.config/tmuxes/folders.json';
const REMOTE_TIMEOUT_MS = 15_000;
const MAX_BYTES = 500_000;

export interface FolderPayload {
  folders: unknown[];
  assign: Record<string, unknown>;
}

const EMPTY: FolderPayload = { folders: [], assign: {} };

function localPath(): string {
  return join(homedir(), '.config', 'tmuxes', 'folders.json');
}

function remoteArgv(
  t: Target,
  script: string,
  opts: { multiplex?: boolean } = {},
): { file: string; args: string[] } {
  if (t.kind === 'wsl') {
    // --cd ~ → run from the distro home; sh -c handles the redirections.
    return { file: 'wsl.exe', args: ['-d', t.distro ?? '', '--cd', '~', '--exec', 'sh', '-c', script] };
  }
  // ssh: wrap in `sh -c '<script>'` so it works regardless of the remote login
  // shell, and runs from the default cwd ($HOME).
  return {
    file: 'ssh',
    args: [
      ...sshClientArgs(t, {
        batchMode: true,
        connectTimeout: config.ssh.connectTimeoutMgmt,
        multiplex: opts.multiplex,
      }).slice(1),
      'sh',
      '-c',
      sshQuote(script),
    ],
  };
}

function runRemote(t: Target, script: string, input?: string) {
  return runTargetCommand(t, (opts) => remoteArgv(t, script, opts), {
    timeoutMs: REMOTE_TIMEOUT_MS,
    input,
  });
}

async function readRaw(t: Target): Promise<string> {
  if (t.kind === 'local' || t.kind === 'winlocal') {
    try {
      return await fsp.readFile(localPath(), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return '';
      throw new TmuxError(502, 'cannot read folders');
    }
  }
  // `2>/dev/null` so a missing file produces empty stdout + no stderr; a real
  // transport failure (ssh down) prints to stderr → surfaced as 502.
  const r = await runRemote(t, `cat ${REL} 2>/dev/null`);
  if (r.code === 0) return r.stdout;
  if (r.stderr.trim()) throw new TmuxError(502, r.stderr.trim().split('\n')[0]);
  return ''; // missing file
}

async function writeRaw(t: Target, raw: string): Promise<void> {
  if (t.kind === 'local' || t.kind === 'winlocal') {
    await fsp.mkdir(dirname(localPath()), { recursive: true });
    await fsp.writeFile(localPath(), raw, 'utf8');
    return;
  }
  const r = await runRemote(t, `mkdir -p .config/tmuxes && cat > ${REL}`, raw);
  if (r.code !== 0) throw new TmuxError(502, r.stderr.trim().split('\n')[0] || 'cannot write folders');
}

export async function readFolders(t: Target): Promise<FolderPayload> {
  const raw = await readRaw(t);
  if (!raw.trim()) return EMPTY;
  try {
    const o = JSON.parse(raw) as Partial<FolderPayload>;
    if (o && Array.isArray(o.folders) && o.assign && typeof o.assign === 'object') {
      return { folders: o.folders, assign: o.assign as Record<string, unknown> };
    }
  } catch {
    /* corrupt file → treat as empty */
  }
  return EMPTY;
}

export async function writeFolders(t: Target, payload: FolderPayload): Promise<void> {
  const raw = JSON.stringify({ folders: payload.folders, assign: payload.assign });
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) throw new TmuxError(413, 'folders payload too large');
  await writeRaw(t, raw);
}
