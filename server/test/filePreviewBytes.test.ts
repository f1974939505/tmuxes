import { describe, expect, it, vi } from 'vitest';
const { runTargetCommand } = vi.hoisted(() => ({ runTargetCommand: vi.fn() }));
vi.mock('../src/targetCommand.js', () => ({ runTargetCommand }));
import { FILE_PREVIEW_CAP, readFilePreview } from '../src/files.js';

describe('remote UTF-8 preview limits', () => {
  it('marks multibyte Markdown truncated by bytes so it cannot be saved as a complete file', async () => {
    const bytes = Buffer.from('中文公式 $x^2$\n'.repeat(200000)).subarray(0, FILE_PREVIEW_CAP + 1);
    runTargetCommand.mockResolvedValue({ code: 0, signal: null, stdout: bytes.toString('base64'), stderr: '' });
    const preview = await readFilePreview({ id: 'wsl', kind: 'wsl', label: 'WSL', distro: 'test' }, '/project/paper.md');
    expect(preview.truncated).toBe(true);
    expect(preview.binary).toBe(false);
    expect(preview.content).toBe(bytes.subarray(0, FILE_PREVIEW_CAP).toString('utf8'));
  });
  it('rejects a failed reader even when base64 exits successfully after head', async () => {
    runTargetCommand.mockResolvedValue({ code: 0, signal: null, stdout: '', stderr: 'head: Permission denied' });
    await expect(readFilePreview({ id: 'wsl', kind: 'wsl', label: 'WSL', distro: 'test' }, '/project/paper.md')).rejects.toMatchObject({ status: 403 });
  });
});
