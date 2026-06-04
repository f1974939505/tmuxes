import { promises as fsp } from 'node:fs';
import { basename as posixBasename, dirname as posixDirname } from 'node:path/posix';
import { commandArgv } from './tmux/builder.js';
import { TmuxError } from './tmux/sessions.js';
import type { Target } from './targets.js';
import { runTargetCommand } from './targetCommand.js';

const REMOTE_TIMEOUT_MS = 15_000;
/** Max bytes returned for a file preview. */
export const FILE_PREVIEW_CAP = 2_000_000;
/** A NUL anywhere in a preview means the file is binary. */
const NUL = String.fromCharCode(0);

export interface FileEntry {
  name: string;
  type: 'dir' | 'file';
}

export interface FilePreview {
  path: string;
  content: string;
  truncated: boolean;
  binary: boolean;
}

function timeout(t: Target): number | undefined {
  return t.kind === 'local' ? undefined : REMOTE_TIMEOUT_MS;
}

function normalizeRoot(path: string): string {
  if (path === '/') return path;
  return path.replace(/\/+$/, '');
}

export function isInsideRoot(root: string, candidate: string): boolean {
  const normalizedRoot = normalizeRoot(root);
  return normalizedRoot === '/' || candidate === normalizedRoot || candidate.startsWith(`${normalizedRoot}/`);
}

async function remoteRealpath(t: Target, path: string): Promise<string> {
  const r = await run(t, ['realpath', path]);
  if (r.code !== 0) {
    if (/No such file|not found/i.test(r.stderr)) throw new TmuxError(404, 'path not found');
    if (/Permission denied/i.test(r.stderr)) throw new TmuxError(403, 'permission denied');
    throw new TmuxError(502, r.stderr.trim().split('\n')[0] || 'cannot resolve path');
  }
  const resolved = r.stdout.trim().split('\n')[0];
  if (!resolved) throw new TmuxError(502, 'empty resolved path');
  return resolved;
}

async function realpath(t: Target, path: string): Promise<string> {
  if (t.kind === 'local') {
    try {
      return await fsp.realpath(path);
    } catch (e) {
      throw fsError(e, path);
    }
  }
  return remoteRealpath(t, path);
}

async function tryRealpath(t: Target, path: string): Promise<string | null> {
  try {
    return await realpath(t, path);
  } catch (e) {
    if (e instanceof TmuxError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Resolve a requested target path and verify it stays inside the session's cwd.
 * This keeps the file browser/editor scoped to the agent workspace instead of
 * exposing arbitrary host files through the no-auth local server.
 */
export async function resolveScopedPath(
  t: Target,
  rootPath: string,
  requestedPath: string,
  opts: { forWrite?: boolean } = {},
): Promise<string> {
  if (!requestedPath.startsWith('/')) throw new TmuxError(400, 'path must be absolute');

  const root = await realpath(t, rootPath);
  let candidate: string | null = null;

  if (opts.forWrite) {
    candidate = await tryRealpath(t, requestedPath);
    if (!candidate) {
      const name = posixBasename(requestedPath);
      if (!name || name === '.' || name === '..') throw new TmuxError(400, 'invalid path');
      const parent = await realpath(t, posixDirname(requestedPath));
      candidate = parent === '/' ? `/${name}` : `${parent}/${name}`;
    }
  } else {
    candidate = await realpath(t, requestedPath);
  }

  if (!isInsideRoot(root, candidate)) {
    throw new TmuxError(403, 'path is outside the session working directory');
  }
  return candidate;
}

async function run(t: Target, argv: string[]) {
  return runTargetCommand(t, (opts) => commandArgv(t, argv, opts), { timeoutMs: timeout(t) });
}

/** The working directory of a session's active pane (tmux #{pane_current_path}). */
export async function getSessionCwd(t: Target, session: string): Promise<string> {
  const r = await run(t, ['tmux', 'display-message', '-p', '-t', session, '#{pane_current_path}']);
  if (r.code !== 0) {
    if (/can't find|no server running|session not found/i.test(r.stderr)) {
      throw new TmuxError(404, `session "${session}" not found`);
    }
    throw new TmuxError(502, r.stderr.trim().split('\n')[0] || 'cannot read session cwd');
  }
  const cwd = r.stdout.trim();
  if (!cwd) throw new TmuxError(502, 'empty session cwd');
  return cwd;
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/** List a directory ON THE TARGET. Local uses fs; wsl/ssh shell out to `ls`. */
export async function listDirectory(t: Target, path: string): Promise<FileEntry[]> {
  if (t.kind === 'local') {
    let dirents;
    try {
      dirents = await fsp.readdir(path, { withFileTypes: true });
    } catch (e) {
      throw fsError(e, path);
    }
    const entries: FileEntry[] = [];
    for (const d of dirents) {
      if (d.name.startsWith('.') && (d.name === '.' || d.name === '..')) continue;
      let isDir = d.isDirectory();
      if (d.isSymbolicLink()) {
        // Resolve symlinks so linked dirs are navigable.
        try {
          const st = await fsp.stat(path.replace(/\/$/, '') + '/' + d.name);
          isDir = st.isDirectory();
        } catch {
          isDir = false;
        }
      }
      entries.push({ name: d.name, type: isDir ? 'dir' : 'file' });
    }
    return sortEntries(entries);
  }

  // wsl/ssh: `ls -Ap1 -- <path>` → one per line, dirs end with "/".
  const r = await run(t, ['ls', '-Ap1', '--', path]);
  if (r.code !== 0) {
    if (/No such file|not found/i.test(r.stderr)) throw new TmuxError(404, 'directory not found');
    if (/Permission denied/i.test(r.stderr)) throw new TmuxError(403, 'permission denied');
    throw new TmuxError(502, r.stderr.trim().split('\n')[0] || 'cannot list directory');
  }
  const entries: FileEntry[] = r.stdout
    .split('\n')
    .filter((l) => l.length > 0)
    .map((line) => {
      const isDir = line.endsWith('/');
      const name = isDir ? line.slice(0, -1) : line;
      return { name, type: isDir ? ('dir' as const) : ('file' as const) };
    })
    .filter((e) => e.name && e.name !== '.' && e.name !== '..');
  return sortEntries(entries);
}

/** Read a (capped) file preview ON THE TARGET. */
export async function readFilePreview(t: Target, path: string): Promise<FilePreview> {
  if (t.kind === 'local') {
    let fh;
    try {
      fh = await fsp.open(path, 'r');
    } catch (e) {
      throw fsError(e, path);
    }
    try {
      const st = await fh.stat();
      if (st.isDirectory()) throw new TmuxError(400, 'path is a directory');
      const cap = FILE_PREVIEW_CAP;
      const buf = Buffer.alloc(Math.min(cap, Number(st.size)));
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      const slice = buf.subarray(0, bytesRead);
      return {
        path,
        content: slice.toString('utf8'),
        truncated: st.size > cap,
        binary: slice.includes(0),
      };
    } finally {
      await fh.close();
    }
  }

  // wsl/ssh: read up to cap+1 bytes; if we got cap+1 the file is larger.
  const r = await run(t, ['head', '-c', String(FILE_PREVIEW_CAP + 1), '--', path]);
  if (r.code !== 0) {
    if (/No such file|not found/i.test(r.stderr)) throw new TmuxError(404, 'file not found');
    if (/Is a directory/i.test(r.stderr)) throw new TmuxError(400, 'path is a directory');
    if (/Permission denied/i.test(r.stderr)) throw new TmuxError(403, 'permission denied');
    throw new TmuxError(502, r.stderr.trim().split('\n')[0] || 'cannot read file');
  }
  const truncated = r.stdout.length > FILE_PREVIEW_CAP;
  const content = truncated ? r.stdout.slice(0, FILE_PREVIEW_CAP) : r.stdout;
  return { path, content, truncated, binary: content.includes(NUL) };
}

/** Overwrite a file ON THE TARGET with `content` (UTF-8). Local uses fs;
 *  wsl/ssh pipe the bytes into `tee -- <path>` over stdin (tee truncates). */
export async function writeFile(t: Target, path: string, content: string): Promise<void> {
  if (t.kind === 'local') {
    try {
      await fsp.writeFile(path, content, 'utf8');
    } catch (e) {
      throw fsError(e, path);
    }
    return;
  }

  // `tee` opens the file with O_TRUNC|O_CREAT, so shorter content can't leave a
  // stale tail. Its stdout echo of the content is ignored.
  const r = await runTargetCommand(t, (opts) => commandArgv(t, ['tee', '--', path], opts), {
    timeoutMs: REMOTE_TIMEOUT_MS,
    input: content,
  });
  if (r.code !== 0) {
    if (/No such file|not found/i.test(r.stderr)) throw new TmuxError(404, 'directory not found');
    if (/Is a directory/i.test(r.stderr)) throw new TmuxError(400, 'path is a directory');
    if (/Permission denied/i.test(r.stderr)) throw new TmuxError(403, 'permission denied');
    throw new TmuxError(502, r.stderr.trim().split('\n')[0] || 'cannot write file');
  }
}

function fsError(e: unknown, path: string): TmuxError {
  const code = (e as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return new TmuxError(404, `not found: ${path}`);
  if (code === 'EACCES') return new TmuxError(403, `permission denied: ${path}`);
  if (code === 'ENOTDIR') return new TmuxError(400, `not a directory: ${path}`);
  if (code === 'EISDIR') return new TmuxError(400, `path is a directory: ${path}`);
  return new TmuxError(502, e instanceof Error ? e.message : 'filesystem error');
}
