import { afterEach, describe, expect, it } from 'vitest';
import { augmentAgentCommand, detectAgentKind } from '../src/agentHooks.js';

afterEach(() => {
  delete process.env.TMUXES_NO_AUTOHOOK;
});

describe('detectAgentKind', () => {
  it('recognizes Claude Code and Codex commands', () => {
    expect(detectAgentKind('claude')).toBe('claude');
    expect(detectAgentKind('codex')).toBe('codex');
  });

  it('ignores non-agent commands, including the POSIX cc compiler, and the opt-out flag', () => {
    expect(detectAgentKind('bash')).toBeUndefined();
    expect(detectAgentKind('cc')).toBeUndefined();
    process.env.TMUXES_NO_AUTOHOOK = '1';
    expect(detectAgentKind('codex')).toBeUndefined();
  });
});

describe('augmentAgentCommand', () => {
  it('adds running, decision, done, and error hooks to Claude Code', () => {
    const out = augmentAgentCommand('claude --model opus "do x"');
    expect(out.kind).toBe('claude');
    expect(out.command).toMatch(/^claude --settings '.*' --model opus "do x"$/);
    expect(out.command).toContain('"UserPromptSubmit"');
    expect(out.command).toContain('"PreToolUse"');
    expect(out.command).toContain('"PostToolUse"');
    expect(out.command).toContain('"PermissionRequest"');
    expect(out.command).toContain('"Notification"');
    expect(out.command).toContain('"Stop"');
    expect(out.command).toContain('@tmuxes_agent claude:running::UserPromptSubmit:$(date +%s).$$');
    expect(out.command).toContain('@tmuxes_agent claude:waiting:decision:PermissionRequest:$(date +%s).$$');
    expect(out.command).toContain('@tmuxes_agent claude:idle:done:Stop:$(date +%s).$$');
    expect(out.command).toContain('@tmuxes_agent claude:idle:error:StopFailure:$(date +%s).$$');
  });

  it('produces valid JSON for Claude settings', () => {
    const out = augmentAgentCommand('claude');
    const json = out.command.match(/--settings '(.*)'$/)?.[1];
    expect(json).toBeTruthy();
    const parsed = JSON.parse(json!);
    expect(parsed.hooks.PermissionRequest[0].hooks[0].command).toContain('decision');
    expect(parsed.hooks.Stop[0].hooks[0].command).toContain('done');
    expect(parsed.hooks.StopFailure[0].hooks[0].command).toContain('error');
  });

  it('adds lifecycle hook config overrides to Codex', () => {
    const out = augmentAgentCommand('codex "fix the bug"');
    expect(out.kind).toBe('codex');
    expect(out.command).toMatch(/^codex -c 'hooks\.UserPromptSubmit=.*' -c 'hooks\.PreToolUse=.*' /);
    expect(out.command.endsWith(' "fix the bug"')).toBe(true);
    expect(out.command).toContain('hooks.PermissionRequest');
    expect(out.command).toContain('hooks.Stop');
    expect(out.command).toContain('@tmuxes_agent codex:running::PreToolUse:$(date +%s).$$');
    expect(out.command).toContain('@tmuxes_agent codex:waiting:decision:PermissionRequest:$(date +%s).$$');
    expect(out.command).toContain('@tmuxes_agent codex:idle:done:Stop:$(date +%s).$$');
  });

  it('leaves non-agent or disabled commands untouched', () => {
    expect(augmentAgentCommand('bash')).toEqual({ command: 'bash' });
    process.env.TMUXES_NO_AUTOHOOK = 'true';
    expect(augmentAgentCommand('codex "x"')).toEqual({ command: 'codex "x"' });
  });
});
