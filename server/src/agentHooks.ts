import {
  agentHookCommand,
  type AgentKind,
  type AgentState,
  type AttentionReason,
} from './agentState.js';

interface AugmentedCommand {
  command: string;
  kind?: AgentKind;
}

function isDisabled(): boolean {
  const v = process.env.TMUXES_NO_AUTOHOOK;
  return v === '1' || v === 'true';
}

function baseName(token: string): string {
  return (token.split(/[\\/]/).pop() || '').toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
}

export function detectAgentKind(command: string): AgentKind | undefined {
  if (isDisabled()) return undefined;
  const trimmed = command.trim();
  if (!trimmed) return undefined;

  const m = /^(\S+)(\s+[\s\S]*)?$/.exec(trimmed);
  if (!m) return undefined;
  switch (baseName(m[1])) {
    case 'claude':
      return 'claude';
    case 'codex':
      return 'codex';
    default:
      return undefined;
  }
}

function hook(
  kind: AgentKind,
  state: AgentState,
  reason: AttentionReason | '',
  event: string,
) {
  return { type: 'command', command: agentHookCommand(kind, state, reason, event) };
}

function claudeSettings(): string {
  return JSON.stringify({
    hooks: {
      UserPromptSubmit: [{ hooks: [hook('claude', 'running', '', 'UserPromptSubmit')] }],
      PreToolUse: [{ matcher: '', hooks: [hook('claude', 'running', '', 'PreToolUse')] }],
      PostToolUse: [{ matcher: '', hooks: [hook('claude', 'running', '', 'PostToolUse')] }],
      PermissionRequest: [
        { matcher: '', hooks: [hook('claude', 'waiting', 'decision', 'PermissionRequest')] },
      ],
      Notification: [
        {
          matcher: 'permission_prompt',
          hooks: [hook('claude', 'waiting', 'decision', 'Notification.permission_prompt')],
        },
        {
          matcher: 'elicitation_dialog',
          hooks: [hook('claude', 'waiting', 'decision', 'Notification.elicitation_dialog')],
        },
      ],
      Stop: [{ hooks: [hook('claude', 'idle', 'done', 'Stop')] }],
      StopFailure: [{ hooks: [hook('claude', 'idle', 'error', 'StopFailure')] }],
      SessionEnd: [{ hooks: [hook('claude', 'idle', 'done', 'SessionEnd')] }],
    },
  });
}

function tomlString(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function codexPermissionRequestHookCommand(): string {
  const autoReviewCommand = agentHookCommand(
    'codex',
    'running',
    '',
    'PermissionRequest.auto_review',
  );
  const userReviewCommand = agentHookCommand(
    'codex',
    'waiting',
    'decision',
    'PermissionRequest.user',
  );

  return [
    'tmuxes_codex_reviewer=;',
    'tmuxes_codex_cfg() {',
    '[ -r "$1" ] || return;',
    'tmuxes_codex_line=$(grep -E "^[[:space:]]*approvals_reviewer[[:space:]]*=" "$1" 2>/dev/null | tail -n 1);',
    'case "$tmuxes_codex_line" in',
    '*\\"*)',
    'tmuxes_codex_val=${tmuxes_codex_line#*\\"};',
    'tmuxes_codex_val=${tmuxes_codex_val%%\\"*};',
    '[ -n "$tmuxes_codex_val" ] && tmuxes_codex_reviewer=$tmuxes_codex_val;',
    ';;',
    'esac;',
    '};',
    'tmuxes_codex_walk() {',
    '[ -n "$1" ] || return;',
    'if [ "$1" != "/" ]; then',
    'tmuxes_codex_parent=${1%/*};',
    '[ -n "$tmuxes_codex_parent" ] || tmuxes_codex_parent=/;',
    'tmuxes_codex_walk "$tmuxes_codex_parent";',
    'fi;',
    'tmuxes_codex_cfg "$1/.codex/config.toml";',
    '};',
    'tmuxes_codex_home=${CODEX_HOME:-${HOME:-}/.codex};',
    'tmuxes_codex_cfg "$tmuxes_codex_home/config.toml";',
    'tmuxes_codex_walk "$PWD";',
    'if [ "$tmuxes_codex_reviewer" = auto_review ]; then',
    `${autoReviewCommand};`,
    'else',
    `${userReviewCommand};`,
    'fi',
  ].join(' ');
}

function codexHookConfig(
  event: string,
  cmd: string,
  opts: { matcher?: string } = {},
): string {
  const matcher = opts.matcher === undefined ? '' : `matcher=${tomlString(opts.matcher)},`;
  return `hooks.${event}=[{${matcher}hooks=[{type="command",command=${tomlString(cmd)}}]}]`;
}

function codexConfigArgs(): string {
  const configs = [
    codexHookConfig('UserPromptSubmit', agentHookCommand('codex', 'running', '', 'UserPromptSubmit')),
    codexHookConfig('PreToolUse', agentHookCommand('codex', 'running', '', 'PreToolUse'), {
      matcher: '',
    }),
    codexHookConfig('PostToolUse', agentHookCommand('codex', 'running', '', 'PostToolUse'), {
      matcher: '',
    }),
    codexHookConfig(
      'PermissionRequest',
      codexPermissionRequestHookCommand(),
      { matcher: '' },
    ),
    codexHookConfig('Stop', agentHookCommand('codex', 'idle', 'done', 'Stop')),
  ];
  return configs.map((c) => `-c '${c}'`).join(' ');
}

export function augmentAgentCommand(command: string): AugmentedCommand {
  const kind = detectAgentKind(command);
  if (!kind) return { command };

  const trimmed = command.trim();
  const m = /^(\S+)(\s+[\s\S]*)?$/.exec(trimmed);
  if (!m) return { command };
  const prog = m[1];
  const rest = m[2] ?? '';

  if (kind === 'claude') {
    return { kind, command: `${prog} --settings '${claudeSettings()}'${rest}` };
  }
  return { kind, command: `${prog} ${codexConfigArgs()}${rest}` };
}
