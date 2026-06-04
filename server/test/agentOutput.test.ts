import { describe, expect, it } from 'vitest';
import { classifyAgentTerminalError } from '../src/agentOutput.js';

describe('classifyAgentTerminalError', () => {
  it('detects Codex stream disconnects that do not emit a stop hook', () => {
    const text =
      'stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)';
    expect(classifyAgentTerminalError(text, 'codex')).toBe('CodexStreamDisconnected');
  });

  it('handles wrapped or styled terminal output', () => {
    const text =
      '\u001b[31mstream disconnected before completion:\u001b[0m\nerror sending request for url (https://chatgpt.com/backend-api/codex/responses)';
    expect(classifyAgentTerminalError(text, 'codex')).toBe('CodexStreamDisconnected');
  });

  it('does not apply Codex-specific URL matching to Claude', () => {
    const text =
      'stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)';
    expect(classifyAgentTerminalError(text, 'claude')).toBe('StreamDisconnected');
  });

  it('ignores ordinary terminal output', () => {
    expect(classifyAgentTerminalError('building project\nall tests passed', 'codex')).toBeUndefined();
  });
});
