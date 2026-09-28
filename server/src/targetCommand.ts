import { runCommand, type CommandResult, type RunOptions } from './exec.js';
import type { Target } from './targets.js';
import { runSshManagementCommand } from './sshManagement.js';

type BuildArgv = (opts: { multiplex?: boolean }) => { file: string; args: string[] };

/** Management reads never establish or retry SSH connections on any platform. */
export async function runTargetCommand(target: Target, buildArgv: BuildArgv, opts: RunOptions = {}): Promise<CommandResult> {
  const argv = buildArgv({ multiplex: true });
  if (target.kind === 'ssh') return runSshManagementCommand(target, argv.file, argv.args, opts);
  return runCommand(argv.file, argv.args, opts);
}
