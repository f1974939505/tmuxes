import { describe, expect, it } from 'vitest';
import { isSessionActive } from '../src/activity';
import type { AgentState, SessionInfo } from '../src/types';

describe('agent work indicators', () => {
  it.each(['running', 'background', 'settling'] as AgentState[])('keeps %s active', (agentState) => {
    expect(isSessionActive({ agentState } as SessionInfo)).toBe(true);
  });
  it.each(['unknown', 'waiting', 'idle'] as AgentState[])('does not imply active for %s', (agentState) => {
    expect(isSessionActive({ agentState } as SessionInfo)).toBe(false);
  });
});
