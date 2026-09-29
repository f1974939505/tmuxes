import { expect, it, vi } from 'vitest';
vi.mock('../src/platform.js', () => ({ isWindows: false }));
import { sshControlPath } from '../src/tmux/builder.js';

it('management and terminal aliases share the destination control socket', () => {
  const target = { id: 'first', host: 'cluster', user: 'user', kind: 'ssh' as const, label: 'cluster' };
  expect(sshControlPath(target)).toBe(sshControlPath({ ...target, id: 'second' }));
  expect(sshControlPath(target)).not.toBe(sshControlPath({ ...target, port: 2222 }));
});
