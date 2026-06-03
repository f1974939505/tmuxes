import { describe, it, expect, afterEach } from 'vitest';
import { augmentAgentCommand } from '../src/agentHooks.js';

afterEach(() => {
  delete process.env.TMUXES_NO_AUTOHOOK;
});

describe('augmentAgentCommand', () => {
  it('adds Stop+Notification hooks to a bare `claude`', () => {
    const out = augmentAgentCommand('claude');
    expect(out.startsWith('claude --settings ')).toBe(true);
    expect(out).toContain('"Stop"');
    expect(out).toContain('"Notification"');
    expect(out).toContain('@tmuxes_attn done:$(date +%s)');
    expect(out).toContain('@tmuxes_attn decision:$(date +%s)');
  });

  it('preserves the original args after the injected flag', () => {
    const out = augmentAgentCommand('claude --model opus "do x"');
    expect(out).toMatch(/^claude --settings '.*' --model opus "do x"$/);
  });

  it('resolves a path/suffix to the agent basename', () => {
    expect(augmentAgentCommand('/usr/local/bin/claude')).toContain('--settings');
  });

  it('injects a notify override for codex (done only)', () => {
    const out = augmentAgentCommand('codex "fix the bug"');
    expect(out).toMatch(/^codex -c 'notify=\[.*\]' "fix the bug"$/);
    expect(out).toContain('@tmuxes_attn done:$(date +%s)');
    expect(out).not.toContain('decision');
  });

  it('leaves non-agent commands untouched', () => {
    expect(augmentAgentCommand('bash')).toBe('bash');
    expect(augmentAgentCommand('npm run dev')).toBe('npm run dev');
    expect(augmentAgentCommand('')).toBe('');
    expect(augmentAgentCommand('   ')).toBe('   ');
  });

  it('respects the TMUXES_NO_AUTOHOOK opt-out', () => {
    process.env.TMUXES_NO_AUTOHOOK = '1';
    expect(augmentAgentCommand('claude')).toBe('claude');
    expect(augmentAgentCommand('codex "x"')).toBe('codex "x"');
  });

  it('produces a valid JSON settings blob', () => {
    const out = augmentAgentCommand('claude');
    const json = out.match(/--settings '(.*)'$/)?.[1];
    expect(json).toBeTruthy();
    const parsed = JSON.parse(json!);
    expect(parsed.hooks.Stop[0].hooks[0].command).toContain('done');
    expect(parsed.hooks.Notification[0].hooks[0].command).toContain('decision');
  });
});
