import { describe, it, expect } from 'vitest';
import { classifyTail, stripAnsi, lastLines } from '../src/attention.js';

describe('classifyTail', () => {
  it('flags y/n and yes/no prompts as decision', () => {
    expect(classifyTail('Overwrite file? (y/n)')).toBe('decision');
    expect(classifyTail('Continue? [y/N]')).toBe('decision');
    expect(classifyTail('Do you want to proceed?')).toBe('decision');
  });

  it('flags numbered / arrow-selected choices as decision', () => {
    expect(classifyTail('❯ 1. Yes\n  2. No')).toBe('decision');
    expect(classifyTail('Please approve the command above')).toBe('decision');
  });

  it('treats a quiet shell prompt or finished output as done', () => {
    expect(classifyTail('$ ')).toBe('done');
    expect(classifyTail('All tests passed.\n42 passing')).toBe('done');
    expect(classifyTail('')).toBe('done');
  });

  it('classifies through ANSI escapes', () => {
    expect(classifyTail('\x1b[1mDo you want to proceed?\x1b[0m')).toBe('decision');
  });
});

describe('stripAnsi', () => {
  it('removes CSI and OSC sequences', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
    expect(stripAnsi('\x1b]0;title\x07text')).toBe('text');
  });
});

describe('lastLines', () => {
  it('returns the last N non-empty lines', () => {
    expect(lastLines('a\n\nb\nc\n\n', 2)).toBe('b\nc');
  });
});
