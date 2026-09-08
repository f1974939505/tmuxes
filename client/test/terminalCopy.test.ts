import { describe, expect, it } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { isCopyShortcut, terminalSnapshot } from '../src/terminalCopy';

describe('terminal copy keys', () => {
  const key = { key: 'c', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
  it('preserves Ctrl+C interrupts only when there is no selection', () => {
    expect(isCopyShortcut(key, false)).toBe(false);
    expect(isCopyShortcut(key, true)).toBe(true);
  });
  it('reserves explicit copy keys without leaking them to the terminal/browser', () => {
    expect(isCopyShortcut({ ...key, key: 'C', shiftKey: true }, false)).toBe(true);
    expect(isCopyShortcut({ ...key, ctrlKey: false, metaKey: true }, true)).toBe(true);
    expect(isCopyShortcut({ ...key, altKey: true }, true)).toBe(false);
    expect(isCopyShortcut({ ...key, key: 'v' }, true)).toBe(false);
  });
});

describe('terminal snapshot', () => {
  it('joins soft wraps, preserves boundary spaces and Unicode, and retains hard line breaks', () => {
    const rows = [
      ['hello ', false], ['中文🙂  ', true], ['  next  ', false], ['', false], ['end', false], ['', false],
    ] as const;
    const term = { buffer: { active: {
      length: rows.length,
      getLine: (i: number) => rows[i] ? {
        isWrapped: rows[i][1],
        translateToString: (trim: boolean) => trim ? rows[i][0].trimEnd() : rows[i][0],
      } : undefined,
    } } } as unknown as Pick<Terminal, 'buffer'>;
    expect(terminalSnapshot(term)).toBe('hello 中文🙂\n  next\n\nend');
  });
});
