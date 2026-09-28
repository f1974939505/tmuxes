import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { CommandResult, RunOptions } from './exec.js';
import { config } from './config.js';
import { sshDestination, type Target } from './targets.js';
import { sshClientArgs } from './tmux/builder.js';

interface RemoteCommand {
  command: string;
  input?: string;
}

interface PendingCommand {
  id: string;
  resolve: (result: CommandResult) => void;
  timer?: NodeJS.Timeout;
}

const SENSITIVE_SSH_OPTIONS = new Set([
  '-B',
  '-b',
  '-c',
  '-D',
  '-E',
  '-e',
  '-F',
  '-I',
  '-i',
  '-J',
  '-L',
  '-l',
  '-m',
  '-O',
  '-o',
  '-p',
  '-Q',
  '-R',
  '-S',
  '-W',
  '-w',
]);

const sessions = new Map<string, SshManagementSession>();
const failures = new Map<string, number>();
const FAILURE_COOLDOWN = 10 * 60_000;

function targetKey(target: Target): string {
  return `${sshDestination(target)}:${target.port ?? 22}`;
}

function splitSshArgs(args: string[]): { connectArgs: string[]; remoteArgs: string[] } {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (SENSITIVE_SSH_OPTIONS.has(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith('-')) continue;
    return { connectArgs: args.slice(0, i + 1), remoteArgs: args.slice(i + 1) };
  }
  return { connectArgs: args, remoteArgs: [] };
}

function commandFromSshArgv(file: string, args: string[], input?: string): RemoteCommand {
  if (file !== 'ssh') return { command: '', input };
  const { remoteArgs } = splitSshArgs(args);
  return { command: remoteArgs.join(' '), input };
}

function connectArgsFor(target: Target): string[] {
  const argv = sshClientArgs(target, {
    batchMode: true,
    connectTimeout: config.ssh.connectTimeoutMgmt,
    multiplex: true,
  });
  const { connectArgs } = splitSshArgs(argv.slice(1));
  return ['-T', ...connectArgs, 'sh'];
}

function encodeInput(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64').replace(/(.{76})/g, '$1\n');
}

function decodePayload(payload: string): string {
  return Buffer.from(payload.replace(/\s+/g, ''), 'base64').toString('utf8');
}

function scriptFor(id: string, command: string, input?: string): string {
  const inputMarker = `__TMUXES_INPUT_${id}__`;
  const begin = `__TMUXES_BEGIN_${id}__`;
  const stderr = `__TMUXES_STDERR_${id}__`;
  const end = `__TMUXES_END_${id}__`;
  const run = input === undefined
    ? `( ${command} )`
    : `base64 -d <<'${inputMarker}' | ( ${command} )\n${encodeInput(input)}\n${inputMarker}`;

  return [
    `__tmuxes_out=$(mktemp "\${TMPDIR:-/tmp}/tmuxes-out.XXXXXX") || exit 125`,
    `__tmuxes_err=$(mktemp "\${TMPDIR:-/tmp}/tmuxes-err.XXXXXX") || { rm -f "$__tmuxes_out"; exit 125; }`,
    `{ ${run}\n} > "$__tmuxes_out" 2> "$__tmuxes_err"`,
    `__tmuxes_code=$?`,
    `printf '\\n${begin}\\n'`,
    `printf '%s\\n' "$__tmuxes_code"`,
    `base64 < "$__tmuxes_out"`,
    `printf '\\n${stderr}\\n'`,
    `base64 < "$__tmuxes_err"`,
    `printf '\\n${end}\\n'`,
    `rm -f "$__tmuxes_out" "$__tmuxes_err"`,
  ].join('\n') + '\n';
}

class SshManagementSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private queue: Promise<void> = Promise.resolve();
  private stdout = '';
  private sshStderr = '';
  closed = false;
  ready = false;
  private pending?: PendingCommand;

  constructor(
    private readonly key: string,
    target: Target,
  ) {
    this.child = spawn('ssh', connectArgsFor(target), { shell: false, windowsHide: true });
    this.child.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk.toString('utf8')));
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.sshStderr += chunk.toString('utf8');
    });
    this.child.on('error', (err) => {
      this.closed = true;
      failures.set(this.key, Date.now());
      this.finishPending(null, null, err.message);
    });
    this.child.on('close', (code, signal) => {
      this.closed = true;
      if (sessions.get(this.key) === this) failures.set(this.key, Date.now());
      this.finishPending(code, signal, this.sshStderr || 'ssh connection closed');
    });
  }

  dispose(): void {
    this.closed = true;
    if (sessions.get(this.key) === this) failures.set(this.key, Date.now());
    try {
      this.child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }

  run(command: string, input: string | undefined, opts: RunOptions): Promise<CommandResult> {
    const next = this.queue
      .catch(() => {
        /* keep later commands moving */
      })
      .then(() => this.runNow(command, input, opts));
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private runNow(command: string, input: string | undefined, opts: RunOptions): Promise<CommandResult> {
    if (this.closed) return Promise.resolve({ code: 255, signal: null, stdout: '', stderr: 'ssh connection closed' });
    if (!command) return Promise.resolve({ code: 255, signal: null, stdout: '', stderr: 'missing remote command' });

    const id = randomUUID().replace(/-/g, '');
    return new Promise((resolve) => {
      const pending: PendingCommand = { id, resolve };
      this.pending = pending;
      if (opts.timeoutMs) {
        pending.timer = setTimeout(() => {
          this.resolvePending({ code: null, signal: 'SIGKILL', stdout: '', stderr: 'ssh command timed out' });
          this.dispose();
        }, opts.timeoutMs);
      }

      this.child.stdin.write(scriptFor(id, command, input), (err) => {
        if (err) this.finishPending(null, null, err.message);
      });
    });
  }

  private onStdout(chunk: string): void {
    this.stdout += chunk;
    const pending = this.pending;
    if (!pending) return;

    const begin = `__TMUXES_BEGIN_${pending.id}__\n`;
    const stderr = `\n__TMUXES_STDERR_${pending.id}__\n`;
    const end = `\n__TMUXES_END_${pending.id}__`;
    const beginIndex = this.stdout.indexOf(begin);
    if (beginIndex < 0) return;
    const stderrIndex = this.stdout.indexOf(stderr, beginIndex + begin.length);
    if (stderrIndex < 0) return;
    const endIndex = this.stdout.indexOf(end, stderrIndex + stderr.length);
    if (endIndex < 0) return;

    const stdoutStart = beginIndex + begin.length;
    const codeLineEnd = this.stdout.indexOf('\n', stdoutStart);
    if (codeLineEnd < 0 || codeLineEnd > stderrIndex) return;

    const code = Number(this.stdout.slice(stdoutStart, codeLineEnd)) || 0;
    const out = decodePayload(this.stdout.slice(codeLineEnd + 1, stderrIndex));
    const err = decodePayload(this.stdout.slice(stderrIndex + stderr.length, endIndex));
    this.stdout = this.stdout.slice(endIndex + end.length);
    this.resolvePending({ code, signal: null, stdout: out, stderr: err });
  }

  private resolvePending(result: CommandResult): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = undefined;
    if (pending.timer) clearTimeout(pending.timer);
    pending.resolve(result);
  }

  private finishPending(code: number | null, signal: NodeJS.Signals | null, stderr: string): void {
    this.resolvePending({ code, signal, stdout: '', stderr });
  }
}

/** Called only by the explicit Connect/Reconnect endpoint. Never from reads. */
export function connectSshTarget(target: Target): Promise<CommandResult> {
  const key = targetKey(target);
  const existing = sessions.get(key);
  if (existing && !existing.closed && existing.ready) return Promise.resolve({ code: 0, signal: null, stdout: '', stderr: '' });
  if (existing && !existing.closed) return Promise.resolve(offline('SSH connection is already being established; no new connection attempted.'));
  const failed = failures.get(key);
  if (failed !== undefined && Date.now() - failed < FAILURE_COOLDOWN) {
    return Promise.resolve(offline(`SSH reconnect is locked for ${Math.ceil((FAILURE_COOLDOWN - Date.now() + failed) / 1000)}s after failure; no connection attempted.`));
  }
  const session = new SshManagementSession(key, target);
  sessions.set(key, session);
  return session.run('true', undefined, { timeoutMs: 10_000 }).then(result => {
    session.ready = result.code === 0 && !session.closed;
    return result;
  });
}

function offline(message = 'SSH offline. Use Connect / Reconnect explicitly; automatic logins are disabled.'): CommandResult {
  return { code: 255, signal: null, stdout: '', stderr: message };
}

export function sshTargetConnected(target: Target): boolean {
  const session = sessions.get(targetKey(target));
  return !!session && !session.closed && session.ready;
}

export function blockSshTarget(target: Target): void {
  failures.set(targetKey(target), Date.now());
  sessions.get(targetKey(target))?.dispose();
}

export function disposeSshTargets(): void {
  for (const session of sessions.values()) session.dispose();
}

export async function runSshManagementCommand(
  target: Target,
  file: string,
  args: string[],
  opts: RunOptions = {},
): Promise<CommandResult> {
  const { command, input } = commandFromSshArgv(file, args, opts.input);
  const session = sessions.get(targetKey(target));
  if (!session || session.closed || !session.ready) return offline();
  return session.run(command, input, opts);
}

