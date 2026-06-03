import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isInsideRoot, resolveScopedPath } from '../src/files.js';
import type { Target } from '../src/targets.js';

const local: Target = { id: 'local', kind: 'local', label: 'Local' };

async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'tmuxes-files-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('isInsideRoot', () => {
  it('matches root exactly or descendants only', () => {
    expect(isInsideRoot('/home/me/proj', '/home/me/proj')).toBe(true);
    expect(isInsideRoot('/home/me/proj', '/home/me/proj/src/a.ts')).toBe(true);
    expect(isInsideRoot('/home/me/proj', '/home/me/project2/a.ts')).toBe(false);
    expect(isInsideRoot('/', '/etc/passwd')).toBe(true);
  });
});

describe('resolveScopedPath', () => {
  it('allows existing files inside the session root', async () => {
    await withTemp(async (dir) => {
      const root = join(dir, 'root');
      const src = join(root, 'src');
      const file = join(src, 'a.txt');
      await mkdir(src, { recursive: true });
      await writeFile(file, 'ok');

      await expect(resolveScopedPath(local, root, file)).resolves.toBe(await realpath(file));
    });
  });

  it('allows creating a new file inside the session root', async () => {
    await withTemp(async (dir) => {
      const root = join(dir, 'root');
      await mkdir(root);

      await expect(resolveScopedPath(local, root, join(root, 'new.txt'), { forWrite: true })).resolves.toBe(
        join(await realpath(root), 'new.txt'),
      );
    });
  });

  it('rejects existing paths outside the session root', async () => {
    await withTemp(async (dir) => {
      const root = join(dir, 'root');
      const outside = join(dir, 'outside');
      const file = join(outside, 'secret.txt');
      await mkdir(root);
      await mkdir(outside);
      await writeFile(file, 'secret');

      await expect(resolveScopedPath(local, root, file)).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  it('rejects symlink escapes from the session root', async () => {
    await withTemp(async (dir) => {
      const root = join(dir, 'root');
      const outside = join(dir, 'outside');
      await mkdir(root);
      await mkdir(outside);
      await symlink(outside, join(root, 'link'));

      await expect(resolveScopedPath(local, root, join(root, 'link', 'new.txt'), { forWrite: true })).rejects.toMatchObject({
        status: 403,
      });
    });
  });
});
