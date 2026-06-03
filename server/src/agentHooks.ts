/** Auto-inject notification hooks into known agent launch commands.
 *
 *  When tmuxes launches a recognized agent (Claude Code, Codex) as a session's
 *  initial command, we splice in that agent's hook config so it sets a tmux
 *  SESSION user option `@tmuxes_attn` to "<reason>:<nonce>" on its events:
 *    done     — the agent finished a turn
 *    decision — the agent needs the user's input/permission
 *
 *  tmuxes reads `@tmuxes_attn` over its existing management poll. Because the
 *  agent runs inside the tmux pane, $TMUX is inherited and the option lands on
 *  the agent's own session — so this works over SSH/WSL with no reverse network.
 *
 *  The nonce ($(date +%s), portable across GNU/BSD date) just makes each event a
 *  distinct value; the client edge-detects on change. Opt out with
 *  TMUXES_NO_AUTOHOOK=1. */

type Reason = 'done' | 'decision';

/** Shell snippet (run by the agent's hook) that records an attention event. */
function attnCmd(reason: Reason): string {
  return `tmux set-option @tmuxes_attn ${reason}:$(date +%s)`;
}

/** Claude Code: file-less inline settings → Stop=done, Notification=decision.
 *  JSON.stringify emits only double quotes (our strings have no apostrophes), so
 *  the whole thing is safe to wrap in single quotes on the command line. */
function claudeSettings(): string {
  return JSON.stringify({
    hooks: {
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: attnCmd('done') }] }],
      Notification: [{ matcher: '', hooks: [{ type: 'command', command: attnCmd('decision') }] }],
    },
  });
}

/** Codex: notify fires only on agent-turn-complete → "done" (no decision event). */
function codexNotify(): string {
  return JSON.stringify(['sh', '-c', attnCmd('done')]);
}

function isDisabled(): boolean {
  const v = process.env.TMUXES_NO_AUTOHOOK;
  return v === '1' || v === 'true';
}

/** lowercase basename without a .exe/.cmd/.bat suffix */
function baseName(token: string): string {
  return (token.split(/[\\/]/).pop() || '').toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
}

/** Splice notification hooks into a recognized agent command; pass others
 *  through unchanged. `command` is the literal line tmuxes types into the pane. */
export function augmentAgentCommand(command: string): string {
  if (isDisabled()) return command;
  const trimmed = command.trim();
  if (!trimmed) return command;

  const m = /^(\S+)(\s+[\s\S]*)?$/.exec(trimmed);
  if (!m) return command;
  const prog = m[1];
  const rest = m[2] ?? ''; // includes its leading whitespace

  switch (baseName(prog)) {
    case 'claude':
      return `${prog} --settings '${claudeSettings()}'${rest}`;
    case 'codex':
      return `${prog} -c 'notify=${codexNotify()}'${rest}`;
    default:
      return command;
  }
}
