import { beforeEach, expect, it, vi } from 'vitest';
const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../src/targetCommand.js', () => ({ runTargetCommand: run }));
import { createSession } from '../src/tmux/sessions.js';
const target = { id: 'local', kind: 'local' as const, label: 'local' };
const ok = { code: 0, signal: null, stdout: '', stderr: '' };
beforeEach(() => run.mockReset());
it('failed initial command is reported and Enter is not sent after failed typing', async () => {
  run.mockResolvedValueOnce(ok).mockResolvedValueOnce({ ...ok, code: 1, stderr: 'pane disappeared' });
  await expect(createSession(target, { name: 'work', command: 'echo hello' })).rejects.toThrow('pane disappeared');
  expect(run).toHaveBeenCalledTimes(2);
});
