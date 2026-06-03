import { describe, it, expect } from 'vitest';
import {
  SESSION_FORMAT,
  WINDOW_FORMAT,
  parseSessions,
  parseWindows,
  isEmptySessionsError,
} from '../src/tmux/formats.js';

const SEP = '|';

describe('parseSessions', () => {
  it('parses delimited session lines (name field last)', () => {
    const out = [
      ['3', '1', '1700000000', '1700000050', 'work'].join(SEP),
      ['1', '0', '1700000100', '1700000150', 'my proj'].join(SEP), // name with a space survives
    ].join('\n');
    expect(parseSessions(out)).toEqual([
      { name: 'work', windows: 3, attached: true, created: 1700000000, lastActivity: 1700000050 },
      { name: 'my proj', windows: 1, attached: false, created: 1700000100, lastActivity: 1700000150 },
    ]);
  });
  it('keeps a separator that appears inside a name', () => {
    const out = ['2', '0', '1700000200', '1700000250', 'a|b'].join(SEP);
    expect(parseSessions(out)).toEqual([
      { name: 'a|b', windows: 2, attached: false, created: 1700000200, lastActivity: 1700000250 },
    ]);
  });
  it('returns [] for empty output', () => {
    expect(parseSessions('')).toEqual([]);
    expect(parseSessions('\n')).toEqual([]);
  });
  it('places the free-form name token last', () => {
    expect(SESSION_FORMAT.split(SEP)).toEqual([
      '#{session_windows}',
      '#{session_attached}',
      '#{session_created}',
      '#{session_activity}',
      '#{session_name}',
    ]);
  });
});

describe('parseWindows', () => {
  it('parses window lines', () => {
    const out = [
      ['0', '2', '1', 'bash'].join(SEP),
      ['1', '1', '0', 'logs'].join(SEP),
    ].join('\n');
    expect(parseWindows(out)).toEqual([
      { index: 0, name: 'bash', panes: 2, active: true },
      { index: 1, name: 'logs', panes: 1, active: false },
    ]);
    expect(WINDOW_FORMAT.split(SEP)[0]).toBe('#{window_index}');
  });
});

describe('isEmptySessionsError', () => {
  it('treats no-server / no-sessions as empty', () => {
    expect(isEmptySessionsError('no server running on /tmp/tmux-1000/default')).toBe(true);
    expect(isEmptySessionsError('no sessions')).toBe(true);
    expect(isEmptySessionsError('error connecting to /tmp/tmux-1000/default (No such file)')).toBe(
      true,
    );
  });
  it('does not swallow real ssh errors', () => {
    expect(isEmptySessionsError('Permission denied (publickey).')).toBe(false);
    expect(isEmptySessionsError('ssh: connect to host x port 22: Connection timed out')).toBe(false);
  });
});
