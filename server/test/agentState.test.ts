import { describe, expect, it } from 'vitest';
import { agentInitialValue, parseAgentValue } from '../src/agentState.js';

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
});
