import { describe, expect, it } from 'vitest';
import { mergeMessages } from '../src/messages';
import type { AgentMessage } from '../src/types';
const msg = (i: number, markdown = String(i)): AgentMessage => ({ id: String(i), role: 'assistant', markdown, before: `b${i}`, after: `a${i}` });
describe('bounded reading window', () => {
  it('deduplicates updates and preserves pagination edges after eviction', () => {
    const page = Array.from({ length: 500 }, (_, i) => msg(i));
    const newer = mergeMessages(page, [msg(499), msg(500)], false);
    expect(newer.messages.length).toBe(500);
    expect(newer.messages[0].before).toBe('b1');
    const older = mergeMessages(page, [msg(-1)], true);
    expect(older.messages.at(-1)?.after).toBe('a498');
  });
  it('limits retained text, including long messages', () => {
    const result = mergeMessages([], Array.from({ length: 50 }, (_, i) => msg(i, 'x'.repeat(256 * 1024))), false);
    expect(result.messages.reduce((total, item) => total + item.markdown.length, 0)).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(result.trimmed).toBe(true);
  });
});
