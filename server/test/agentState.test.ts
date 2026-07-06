import { describe, expect, it } from 'vitest';
import { agentInitialValue, agentValue, parseAgentValue } from '../src/agentState.js';

describe('agent state values', () => {
  it('initializes a launched agent without a notification reason', () => {
    const parsed = parseAgentValue(agentInitialValue('codex'));
    expect(parsed).toMatchObject({
      agentKind: 'codex',
      agentState: 'idle',
      agentEvent: 'launch',
    });
    expect(parsed?.attentionReason).toBeUndefined();
  });

  it('parses abnormal stop notifications', () => {
    expect(parseAgentValue(agentValue('codex', 'idle', 'error', 'CodexStreamDisconnected', '42'))).toMatchObject({
      agentKind: 'codex',
      agentState: 'idle',
      attentionReason: 'error',
      agentEvent: 'CodexStreamDisconnected',
      agentNonce: '42',
    });
  });

  it('parses decision notifications from Claude Code permission hooks', () => {
    expect(parseAgentValue('claude:waiting:decision:PermissionRequest:42')).toMatchObject({
      agentKind: 'claude',
      agentState: 'waiting',
      attentionReason: 'decision',
      agentEvent: 'PermissionRequest',
      agentNonce: '42',
    });
  });
});
