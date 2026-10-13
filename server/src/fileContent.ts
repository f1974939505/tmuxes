import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Target } from './targets.js';
import { commandArgv } from './tmux/builder.js';
import { runTargetCommand } from './targetCommand.js';
import { TmuxError } from './tmux/sessions.js';
import { readFilePreview } from './files.js';

export const FILE_BLOCK = 512 * 1024;
const reads = new Map<string, Promise<Buffer>>();
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };

export function mediaType(path: string): string | undefined {
  return MIME[path.split('.').pop()?.toLowerCase() ?? ''];
}

export function byteRange(header: string | undefined, size: number): { start: number; end: number; partial: boolean } {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const m = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!m || (!m[1] && !m[2]) || !size) throw new TmuxError(416, 'invalid byte range');
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] ? (m[2] ? Math.min(size - 1, Number(m[2])) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size || (!m[1] && Number(m[2]) === 0)) {
    throw new TmuxError(416, 'range is outside the file');
  }
  return { start, end, partial: true };
}

async function remote(target: Target, script: string, args: string[]) {
  const r = await runTargetCommand(target, opts => commandArgv(target, ['sh', '-c', script, 'tmuxes-file', ...args], opts), { timeoutMs: 15_000, memoryOnly: true });
  if (r.code !== 0) throw new TmuxError(r.code === 255 ? 503 : r.code === 66 ? 404 : 502, 'Cannot read file; check the target connection and file permissions.');
  return r.stdout;
}

export async function fileIdentity(target: Target, path: string) {
  if (target.kind === 'local') {
    let st;
    try { st = await fs.stat(path); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') throw new TmuxError(404, 'File temporarily unavailable.');
      if (code === 'EACCES') throw new TmuxError(403, 'Permission denied.');
      throw error;
    }
    if (!st.isFile()) throw new TmuxError(400, 'path is not a regular file');
    return { size: st.size, identity: `${st.dev}|${st.ino}|${st.size}|${st.mtimeMs}|${st.ctimeMs}` };
  }
  const identity = (await remote(target,
    'test -f "$1" || exit 66; stat -c "%s|%y|%i" -- "$1" 2>/dev/null || stat -f "%z|%m|%i" "$1"', [path])).trim();
  const size = Number(identity.split('|')[0]);
  if (identity.split('|').length !== 3 || !Number.isSafeInteger(size) || size < 0) throw new TmuxError(502, 'invalid file size');
  return { size, identity };
}

export function fileEtag(identity: string): string {
  return '"' + createHash('sha256').update(identity).digest('hex') + '"';
}

export async function requireFileVersion(target: Target, path: string, version: string | undefined): Promise<void> {
  if (version && version !== fileEtag((await fileIdentity(target, path)).identity)) {
    throw new TmuxError(412, 'File changed externally; reload or explicitly confirm overwriting it.');
  }
}

/** Conditional text reads and metadata-only checks share existing transport. */
export async function serveFilePreview(target: Target, path: string, req: Request, res: Response): Promise<void> {
  const meta = await fileIdentity(target, path);
  const etag = fileEtag(meta.identity);
  res.set({ 'Cache-Control': 'private, no-store', ETag: etag });
  if (req.headers['if-none-match'] === etag) { res.status(304).end(); return; }
  if (req.method === 'HEAD') { res.status(200).end(); return; }
  const preview = await readFilePreview(target, path);
  if ((await fileIdentity(target, path)).identity !== meta.identity) throw new TmuxError(409, 'File is changing; try again shortly.');
  res.json(preview);
}

/** Coalesce concurrent browsers, with no disk cache or additional transport. */
export function readFileBlock(target: Target, path: string, start: number, count: number, identity: string): Promise<Buffer> {
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(count) || count < 0 || count > FILE_BLOCK) {
    return Promise.reject(new TmuxError(400, 'invalid file block'));
  }
  const key = JSON.stringify([target.id, path, start, count, identity]);
  const current = reads.get(key);
  if (current) return current;
  const work = (async () => {
    if ((await fileIdentity(target, path)).identity !== identity) throw new TmuxError(409, 'File changed; reopen the preview.');
    let result: Buffer;
    if (target.kind === 'local') {
      const handle = await fs.open(path, 'r');
      try {
        result = Buffer.alloc(count);
        let total = 0;
        while (total < count) {
          const r = await handle.read(result, total, count - total, start + total);
          if (!r.bytesRead) break;
          total += r.bytesRead;
        }
        result = result.subarray(0, total);
      } finally { await handle.close(); }
    } else {
      // Binary bytes are explicitly base64 encoded BEFORE the existing text
      // management transport decodes stdout. Never start ssh/scp/sftp here.
      const skip = Math.floor(start / 65536), offset = start % 65536;
      const blocks = Math.ceil((offset + count) / 65536);
      const encoded = await remote(target,
        'dd if="$1" bs=65536 skip="$2" count="$3" 2>/dev/null | tail -c +"$4" | head -c "$5" | base64',
        [path, String(skip), String(blocks), String(offset + 1), String(count)]);
      result = Buffer.from(encoded.replace(/\s/g, ''), 'base64');
    }
    if (result.length !== count || (await fileIdentity(target, path)).identity !== identity) {
      throw new TmuxError(409, 'File changed; reopen the preview.');
    }
    return result;
  })();
  reads.set(key, work);
  void work.finally(() => { if (reads.get(key) === work) reads.delete(key); }).catch(() => {});
  return work;
}

export async function serveFileContent(target: Target, path: string, req: Request, res: Response, download = false): Promise<void> {
  const mime = download ? 'application/octet-stream' : mediaType(path);
  if (!mime) throw new TmuxError(415, 'Unsupported media preview.');
  const meta = await fileIdentity(target, path);
  const cap = (mime === 'application/pdf' ? 256 : 32) * 1024 * 1024;
  if (!download && meta.size > cap) throw new TmuxError(413, `Preview limit: ${cap / 1024 / 1024} MiB.`);
  if (download) {
    const name = (path.split(/[\\/]/).pop() || 'download').replace(/[\x00-\x1f\x7f]/g, '_');
    const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
    const encoded = encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    res.set('Content-Disposition', `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`);
  }
  const etag = fileEtag(meta.identity);
  res.set({ 'Accept-Ranges': 'bytes', 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store', ETag: etag });
  if (req.headers['if-none-match'] === etag) { res.status(304).end(); return; }
  if (req.headers['if-range'] && req.headers['if-range'] !== etag) throw new TmuxError(409, 'File changed; reopen the preview.');
  let range;
  try { range = byteRange(req.headers.range, meta.size); }
  catch (e) { res.set('Content-Range', `bytes */${meta.size}`); throw e; }
  res.status(range.partial ? 206 : 200);
  res.set('Content-Length', String(Math.max(0, range.end - range.start + 1)));
  if (range.partial) res.set('Content-Range', `bytes ${range.start}-${range.end}/${meta.size}`);
  if (req.method === 'HEAD') { res.end(); return; }
  for (let start = range.start; start <= range.end; start += FILE_BLOCK) {
    if (res.destroyed) return; // Closing a preview never kills the shared SSH channel.
    const block = await readFileBlock(target, path, start, Math.min(FILE_BLOCK, range.end - start + 1), meta.identity);
    if (res.destroyed) return;
    if (!res.write(block)) await new Promise<void>(resolve => {
      const done = () => { res.off('drain', done); res.off('close', done); resolve(); };
      res.once('drain', done); res.once('close', done);
    });
  }
  res.end();
}
