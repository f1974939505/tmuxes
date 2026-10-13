import { mkdtemp, writeFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import express from 'express';
import { byteRange, fileIdentity, readFileBlock, serveFileContent } from '../src/fileContent.js';
import type { Target } from '../src/targets.js';

const target: Target = { kind: 'local', id: 'local', label: 'Local' };
describe('binary file previews', () => {
  it('downloads arbitrary files unchanged across blocks with a Unicode filename, HEAD and ranges', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tmuxes-download-'));
    const path = join(dir, '数据 (v1).bin');
    const bytes = Buffer.alloc(512 * 1024 + 77);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    await writeFile(path, bytes);
    const app = express();
    app.get('/download', (req, res, next) => { void serveFileContent(target, path, req, res, true).catch(next); });
    app.use((e: any, _req: any, res: any, _next: any) => { if (res.headersSent) res.destroy(); else res.status(e.status ?? 500).json({ error: e.message }); });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as any).port}/download`;
    try {
      const full = await fetch(url);
      expect(full.status).toBe(200);
      expect(full.headers.get('content-type')).toBe('application/octet-stream');
      expect(full.headers.get('content-disposition')).toBe('attachment; filename="__ (v1).bin"; filename*=UTF-8\'\'%E6%95%B0%E6%8D%AE%20%28v1%29.bin');
      expect(Buffer.from(await full.arrayBuffer())).toEqual(bytes);
      const head = await fetch(url, { method: 'HEAD' });
      expect(head.headers.get('content-length')).toBe(String(bytes.length));
      expect(await head.text()).toBe('');
      const partial = await fetch(url, { headers: { Range: 'bytes=524280-' } });
      expect(partial.status).toBe(206);
      expect(Buffer.from(await partial.arrayBuffer())).toEqual(bytes.subarray(524280));
      // Download limits are independent of preview limits, and no file is
      // accumulated in server memory for a HEAD request.
      const handle = await open(path, 'r+'); await handle.truncate(257 * 1024 * 1024); await handle.close();
      const largeHead = await fetch(url, { method: 'HEAD' });
      expect(largeHead.status).toBe(200);
      expect(largeHead.headers.get('content-length')).toBe(String(257 * 1024 * 1024));
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true }); }
  });
  it('serves original bytes, HEAD and single ranges with correct HTTP headers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tmuxes-media-'));
    const path = join(dir, 'image.png');
    const bytes = Buffer.from([137, 80, 78, 71, 0, 255, 254, 128, 10]);
    await writeFile(path, bytes);
    const app = express();
    app.get('/content', (req, res, next) => { void serveFileContent(target, path, req, res).catch(next); });
    app.use((e: any, _req: any, res: any, _next: any) => { if (res.headersSent) res.destroy(); else res.status(e.status ?? 500).json({ error: e.message }); });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as any).port}/content`;
    try {
      const full = await fetch(url);
      expect(Buffer.from(await full.arrayBuffer())).toEqual(bytes);
      expect(full.headers.get('content-type')).toBe('image/png');
      const head = await fetch(url, { method: 'HEAD' });
      expect(head.headers.get('content-length')).toBe('9');
      expect(await head.text()).toBe('');
      const range = await fetch(url, { headers: { Range: 'bytes=3-6' } });
      expect(range.status).toBe(206);
      expect(range.headers.get('content-range')).toBe('bytes 3-6/9');
      expect(Buffer.from(await range.arrayBuffer())).toEqual(bytes.subarray(3, 7));
      expect((await fetch(url, { headers: { Range: 'bytes=50-60' } })).status).toBe(416);
      expect((await fetch(url, { headers: { 'If-Range': 'different', Range: 'bytes=0-1' } })).status).toBe(409);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true }); }
  });
  it('checks changed file identity and coalesces concurrent blocks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tmuxes-media-'));
    try {
      const path = join(dir, 'image.jpg'); await writeFile(path, Buffer.from([0, 255, 128, 70]));
      const meta = await fileIdentity(target, path);
      const first = readFileBlock(target, path, 0, 4, meta.identity);
      expect(readFileBlock(target, path, 0, 4, meta.identity)).toBe(first);
      expect(await first).toEqual(Buffer.from([0, 255, 128, 70]));
      await writeFile(path, 'changed');
      await expect(readFileBlock(target, path, 0, 4, meta.identity)).rejects.toMatchObject({ status: 409 });
      const handle = await open(path, 'r+'); await handle.truncate(33 * 1024 * 1024); await handle.close();
      const res = { set: () => {} } as any;
      await expect(serveFileContent(target, path, { headers: {} } as any, res)).rejects.toMatchObject({ status: 413 });
    } finally { await rm(dir, { recursive: true }); }
  });
  it('accepts suffix/open ranges and rejects malformed or multiple ranges', () => {
    expect(byteRange('bytes=-3', 10)).toEqual({ start: 7, end: 9, partial: true });
    expect(byteRange('bytes=2-', 10)).toEqual({ start: 2, end: 9, partial: true });
    for (const h of ['bytes=0-1,3-4', 'bytes=-0', 'bytes=5-2', 'bytes=9007199254740993-', 'bytes=-']) expect(() => byteRange(h, 10)).toThrow();
  });
});
