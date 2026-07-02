import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  augmentAgentCommand,
  codexPermissionRequestHookCommand,
  detectAgentKind,
} from '../src/agentHooks.js';

afterEach(() => {
  delete process.env.TMUXES_NO_AUTOHOOK;
});

function runCodexPermissionHook(opts: {
  globalConfig?: string;
  projectConfig?: string;
}): string {
  const root = mkdtempSync(join(tmpdir(), 'tmuxes-agent-hook-'));
  const bin = join(root, 'bin');
  const home = join(root, 'home');
  const codexHome = join(home, '.codex');
  const project = join(root, 'work', 'repo');
  const log = join(root, 'tmux.log');

  mkdirSync(bin, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(project, { recursive: true });

  writeFileSync(
    join(bin, 'tmux'),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TMUXES_FAKE_TMUX_LOG"\n',
  );
  chmodSync(join(bin, 'tmux'), 0o755);

  if (opts.globalConfig !== undefined) {
    writeFileSync(join(codexHome, 'config.toml'), opts.globalConfig);
  }
  if (opts.projectConfig !== undefined) {
    mkdirSync(join(project, '.codex'), { recursive: true });
    writeFileSync(join(project, '.codex', 'config.toml'), opts.projectConfig);
  }

  const result = spawnSync(process.env.SHELL || '/bin/sh', [
    '-lc',
    codexPermissionRequestHookCommand(),
  ], {
    cwd: project,
    encoding: 'utf8',
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      HOME: home,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      TMUXES_FAKE_TMUX_LOG: log,
    },
  });

  expect(result.status, result.stderr).toBe(0);
  return existsSync(log) ? readFileSync(log, 'utf8') : '';
}

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
    expect(out.command).toContain('approvals_reviewer');
    expect(out.command).toContain('@tmuxes_agent codex:running::PreToolUse:$(date +%s).$$');
    expect(out.command).toContain(
      '@tmuxes_agent codex:running::PermissionRequest.auto_review:$(date +%s).$$',
    );
    expect(out.command).toContain(
      '@tmuxes_agent codex:waiting:decision:PermissionRequest.user:$(date +%s).$$',
    );
    expect(out.command).toContain('@tmuxes_agent codex:idle:done:Stop:$(date +%s).$$');
  });

  it('keeps Codex permission requests running when approvals are auto-reviewed', () => {
    const command = codexPermissionRequestHookCommand();
    expect(command).not.toContain("'");

    const log = runCodexPermissionHook({
      globalConfig: 'approvals_reviewer = "auto_review"\n',
    });

    expect(log).toContain(
      'set-option -q @tmuxes_agent codex:running::PermissionRequest.auto_review:',
    );
    expect(log).not.toContain('waiting:decision');
  });

  it('marks Codex permission requests as decisions when review is routed to the user', () => {
    const log = runCodexPermissionHook({
      globalConfig: 'approvals_reviewer = "auto_review"\n',
      projectConfig: 'approvals_reviewer = "user"\n',
    });

    expect(log).toContain(
      'set-option -q @tmuxes_agent codex:waiting:decision:PermissionRequest.user:',
    );
    expect(log).not.toContain('PermissionRequest.auto_review');
  });

  it('leaves non-agent or disabled commands untouched', () => {
    expect(augmentAgentCommand('bash')).toEqual({ command: 'bash' });
    process.env.TMUXES_NO_AUTOHOOK = 'true';
    expect(augmentAgentCommand('codex "x"')).toEqual({ command: 'codex "x"' });
  });
});
