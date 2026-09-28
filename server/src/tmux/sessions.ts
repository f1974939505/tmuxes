import { managementArgv, newSessionArgv } from './builder.js';
import type { Target } from '../targets.js';
import { runTargetCommand } from '../targetCommand.js';
import {
  AGENT_OPTION,
  agentInitialValue,
} from '../agentState.js';
import { prepareAgentCommand } from '../agentHooks.js';
import {
  SESSION_FORMAT,
  WINDOW_FORMAT,
  parseSessions,
  parseWindows,
  isEmptySessionsError,
  type SessionInfo,
  type WindowInfo,
} from './formats.js';
import { isValidSessionName } from '../validate.js';

export type LaunchAgent = 'claude' | 'codex' | 'opencode' | 'hermes';

/** A management error carrying the HTTP status the router should return. */
export class TmuxError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'TmuxError';
  }
}

// Hard ceiling so a wedged ssh can never hang a request (ssh also has ConnectTimeout).
const REMOTE_TIMEOUT_MS = 15_000;

function timeoutFor(target: Target): number | undefined {
  // Bound ssh (network) and wsl (possible cold start) so a request can't hang.
  return target.kind === 'local' ? undefined : REMOTE_TIMEOUT_MS;
}

async function run(target: Target, sub: string[]) {
  return runTargetCommand(target, (opts) => managementArgv(target, sub, opts), {
    timeoutMs: timeoutFor(target),
  });
}

function firstStderrLine(stderr: string): string {
  return stderr.trim().split('\n')[0] || 'command failed';
}

export async function listSessions(target: Target): Promise<SessionInfo[]> {
  const r = await run(target, ['list-sessions', '-F', SESSION_FORMAT]);
  if (r.code === 0) return parseSessions(r.stdout);
  // "no server running" / "no sessions" is the normal empty case.
  if (isEmptySessionsError(r.stderr)) return [];
  throw new TmuxError(502, firstStderrLine(r.stderr));
}

export async function createSession(
  target: Target,
  opts: { name?: string; command?: string },
): Promise<{ name: string }> {
  let name = opts.name;

  // New sessions always start in the user's home directory (newSessionArgv).
  if (name) {
    if (!isValidSessionName(name)) throw new TmuxError(400, 'invalid session name');
    const sessionName = name;
    const r = await runTargetCommand(
      target,
      (opts) => newSessionArgv(target, ['new-session', '-d', '-s', sessionName], opts),
      { timeoutMs: timeoutFor(target) },
    );
    if (r.code !== 0) {
      if (/duplicate session/i.test(r.stderr)) {
        throw new TmuxError(409, `session "${name}" already exists`);
      }
      throw new TmuxError(502, firstStderrLine(r.stderr));
    }
  } else {
    // Let tmux assign a numeric name and report it back.
    const r = await runTargetCommand(
      target,
      (opts) => newSessionArgv(target, ['new-session', '-d', '-P', '-F', '#{session_name}'], opts),
      { timeoutMs: timeoutFor(target) },
    );
    if (r.code !== 0) throw new TmuxError(502, firstStderrLine(r.stderr));
    name = r.stdout.trim();
  }

  if (opts.command && opts.command.length > 0) {
    const augmented = await prepareAgentCommand(target, opts.command);
    if (augmented.kind) {
      await run(target, [
        'set-option',
        '-t',
        name,
        '-q',
        AGENT_OPTION,
        agentInitialValue(augmented.kind),
      ]);
    }
    // Type the command literally, then press Enter. Two send-keys calls so the
    // command text can never be misparsed as a key name.
    await run(target, ['send-keys', '-t', name, '-l', augmented.command]);
    await run(target, ['send-keys', '-t', name, 'Enter']);
  }

  return { name };
}

export async function launchAgentInSession(
  target: Target,
  name: string,
  agent: LaunchAgent,
): Promise<void> {
  const augmented = await prepareAgentCommand(target, agent);
  if (!augmented.kind) throw new TmuxError(400, 'unsupported agent');

  const set = await run(target, [
    'set-option',
    '-t',
    name,
    '-q',
    AGENT_OPTION,
    agentInitialValue(augmented.kind),
  ]);
  if (set.code !== 0) {
    if (/can't find session|session not found|no server running/i.test(set.stderr)) {
      throw new TmuxError(404, `session "${name}" not found`);
    }
    throw new TmuxError(502, firstStderrLine(set.stderr));
  }

  const send = await run(target, ['send-keys', '-t', name, '-l', augmented.command]);
  if (send.code !== 0) throw new TmuxError(502, firstStderrLine(send.stderr));
  const enter = await run(target, ['send-keys', '-t', name, 'Enter']);
  if (enter.code !== 0) throw new TmuxError(502, firstStderrLine(enter.stderr));
}

export async function renameSession(
  target: Target,
  name: string,
  newName: string,
): Promise<void> {
  if (!isValidSessionName(newName)) throw new TmuxError(400, 'invalid new session name');
  const r = await run(target, ['rename-session', '-t', name, newName]);
  if (r.code === 0) return;
  if (/can't find session|session not found/i.test(r.stderr)) {
    throw new TmuxError(404, `session "${name}" not found`);
  }
  if (/duplicate session/i.test(r.stderr)) {
    throw new TmuxError(409, `session "${newName}" already exists`);
  }
  throw new TmuxError(502, firstStderrLine(r.stderr));
}

export async function killSession(target: Target, name: string): Promise<void> {
  const r = await run(target, ['kill-session', '-t', name]);
  if (r.code === 0) return;
  if (/can't find session|session not found|no server running/i.test(r.stderr)) {
    throw new TmuxError(404, `session "${name}" not found`);
  }
  throw new TmuxError(502, firstStderrLine(r.stderr));
}

export async function listWindows(target: Target, name: string): Promise<WindowInfo[]> {
  const r = await run(target, ['list-windows', '-t', name, '-F', WINDOW_FORMAT]);
  if (r.code === 0) return parseWindows(r.stdout);
  if (/can't find session|session not found|no server running/i.test(r.stderr)) {
    throw new TmuxError(404, `session "${name}" not found`);
  }
  throw new TmuxError(502, firstStderrLine(r.stderr));
}
