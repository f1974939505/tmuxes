import { describe, expect, it } from 'vitest';
import { annotate } from '../src/monitor.js';
import type { SessionInfo } from '../src/tmux/formats.js';

function session(name: string): SessionInfo {
  return {
    name,
    windows: 1,
    attached: false,
    created: 1_700_000_000,
    lastActivity: 10,
    agentKind: 'codex',
    agentState: 'idle',
    attentionReason: 'done',
    agentEvent: 'Stop',
    agentNonce: '123',
  };
}

describe('annotate', () => {
  it('passes through hook-derived agent state without terminal heuristics', () => {
    const sessions = [session('work')];
    expect(annotate('local', sessions)).toBe(sessions);
  });
});
