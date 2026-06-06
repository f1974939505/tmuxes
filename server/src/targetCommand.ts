import { unlinkSync } from 'node:fs';
import { runCommand, type CommandResult, type RunOptions } from './exec.js';
import type { Target } from './targets.js';
import { sshControlPath } from './tmux/builder.js';
import { isWindows } from './platform.js';
import { dropWindowsSshSession, runWindowsSshCommand } from './windowsSsh.js';

type BuildArgv = (opts: { multiplex?: boolean }) => { file: string; args: string[] };

const SSH_INTERRUPTION_RE =
  /mux_client_request_session|Control socket connect|Broken pipe|Connection reset|Connection closed|Connection to .* closed|Connection timed out|Operation timed out|No route to host|Network is unreachable|Connection refused|kex_exchange_identification|banner exchange|stdio forwarding failed/i;

const SSH_CLIENT_FAILURE_RE =
  /Permission denied \(|Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED|Could not resolve hostname|Too many authentication failures|Connection timed out|Operation timed out|No route to host|Network is unreachable|Connection refused|Connection reset|Connection closed|Connection to .* closed|Broken pipe|kex_exchange_identification|banner exchange/i;

function firstLine(stderr: string): string {
  return stderr.trim().split('\n')[0] || 'ssh command failed';
}

function isInterruptedSsh(result: CommandResult): boolean {
  return result.code !== 0 && SSH_INTERRUPTION_RE.test(result.stderr);
}

function isSshClientFailure(result: CommandResult): boolean {
  return result.code !== 0 && SSH_CLIENT_FAILURE_RE.test(result.stderr);
}

/** Run a target command. If an SSH control master is stale/interrupted, retry
 * exactly once using a fresh direct SSH connection. Authentication failures are
 * not retried, to avoid repeated failed-login noise. */
export async function runTargetCommand(
  target: Target,
  buildArgv: BuildArgv,
  opts: RunOptions = {},
): Promise<CommandResult> {
  if (target.kind === 'ssh' && isWindows) return runWindowsTargetCommand(target, buildArgv, opts);

  const firstArgv = buildArgv({ multiplex: true });
  const first = await runCommand(firstArgv.file, firstArgv.args, opts);
  if (target.kind !== 'ssh' || !isInterruptedSsh(first)) return first;

  const controlPath = sshControlPath(target);
  if (controlPath) {
    try {
      unlinkSync(controlPath);
    } catch {
      /* stale socket may already be gone */
    }
  }

  const retryArgv = buildArgv({ multiplex: false });
  const retry = await runCommand(retryArgv.file, retryArgv.args, opts);
  if (retry.code === 0 || !isSshClientFailure(retry)) return retry;

  return {
    ...retry,
    stderr: `SSH connection interrupted; one reconnect attempt failed: ${firstLine(retry.stderr)}\n${retry.stderr}`,
  };
}

async function runWindowsTargetCommand(
  target: Target,
  buildArgv: BuildArgv,
  opts: RunOptions,
): Promise<CommandResult> {
  const firstArgv = buildArgv({ multiplex: false });
  const first = await runWindowsSshCommand(target, firstArgv.file, firstArgv.args, opts);
  if (!isInterruptedSsh(first)) return first;

  dropWindowsSshSession(target);
  const retryArgv = buildArgv({ multiplex: false });
  const retry = await runWindowsSshCommand(target, retryArgv.file, retryArgv.args, opts);
  if (retry.code === 0 || !isSshClientFailure(retry)) return retry;

  return {
    ...retry,
    stderr: `SSH connection interrupted; one reconnect attempt failed: ${firstLine(retry.stderr)}\n${retry.stderr}`,
  };
}
