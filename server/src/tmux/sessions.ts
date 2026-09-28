import { commandArgv, managementArgv, newSessionArgv, sshQuote } from './builder.js';
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
import { applyNativeObservers, type NativeObserver } from '../nativeObservers.js';
import { sshTargetConnected } from '../sshManagement.js';
import { existingTerminal } from '../ws/terminalSession.js';

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
  return (await listSessionSnapshot(target)).sessions;
}

type Snapshot = { sessions: SessionInfo[]; observers: NativeObserver[] };
const snapshots = new Map<string, { at: number; value: Promise<Snapshot> }>();
export function invalidateSessionSnapshot(id: string): void { snapshots.delete(id); }

export async function listSessionSnapshot(target: Target): Promise<Snapshot> {
  if (target.kind === 'ssh' && !sshTargetConnected(target)) {
    throw new TmuxError(503, 'SSH offline. Click Connect / Reconnect; no automatic connection attempted.');
  }
  const cached = snapshots.get(target.id);
  if (cached && (cached.at === Infinity || Date.now() - cached.at < 5000)) return cached.value;
  const entry = { at: Infinity, value: readSessionSnapshot(target) };
  snapshots.set(target.id, entry);
  try {
    const result = await entry.value;
    entry.at = Date.now();
    return result;
  } catch (error) {
    if (snapshots.get(target.id) === entry) snapshots.delete(target.id);
    throw error;
  }
}

async function readSessionSnapshot(target: Target): Promise<Snapshot> {
  const fallback = `tmux list-sessions -F ${sshQuote(SESSION_FORMAT)}`;
  const script = `if [ -f "$HOME/.local/share/tmuxes/observer/native.py" ]; then python3 "$HOME/.local/share/tmuxes/observer/native.py" snapshot 2>/dev/null || { printf 'TMUXES_NATIVE_FAILED\\n'; ${fallback}; }; else ${fallback}; fi`;
  // One existing management request; observation happens locally on the target.
  const r = await runTargetCommand(target, (opts) => commandArgv(target, ['sh', '-c', script], opts),
    { timeoutMs: timeoutFor(target) });
  if (r.code === 0) {
    if (r.stdout.startsWith('TMUXES_NATIVE_FAILED\n')) {
      return { sessions: applyNativeObservers(parseSessions(r.stdout.slice('TMUXES_NATIVE_FAILED\n'.length)), []), observers: [] };
    }
    if (r.stdout.startsWith('TMUXES_NATIVE_V1=')) {
      const data = JSON.parse(r.stdout.slice('TMUXES_NATIVE_V1='.length)) as { raw: string; observers: NativeObserver[] };
      return { sessions: applyNativeObservers(parseSessions(data.raw), data.observers), observers: data.observers };
    }
    return { sessions: parseSessions(r.stdout), observers: [] };
  }
  // "no server running" / "no sessions" is the normal empty case.
  if (isEmptySessionsError(r.stderr)) return { sessions: [], observers: [] };
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
  const augmented = await prepareAgentCommand(target, agent === 'codex' ? 'codex --no-daemon' : agent);

  const set = await run(target, [
    'set-option',
    '-t',
    name,
    '-q',
    AGENT_OPTION,
    agentInitialValue(agent),
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
  if (r.code === 0) {
    existingTerminal(target.id, name)?.rename(newName);
    return;
  }
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
