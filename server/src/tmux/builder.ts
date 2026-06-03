import { homedir } from 'node:os';
import { config } from '../config.js';
import { sshDestination, type Target } from '../targets.js';

/**
 * Single-quote a string for a POSIX shell. Needed ONLY for the remote ssh path:
 * ssh concatenates the remote command words with spaces and re-parses them
 * through the remote login shell, so each tmux arg must survive that re-parse.
 * Local commands use pure argv (no shell) and need no quoting.
 */
export function sshQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** Local tmux management/attach argv — passed straight to spawn (shell:false). */
export function localTmux(sub: string[]): string[] {
  return ['tmux', ...sub];
}

/**
 * Remote tmux argv via the system ssh binary.
 * - tty:false (management) → BatchMode + short ConnectTimeout so it fails fast
 *   and never hangs on a prompt. Remote args are sshQuote'd.
 * - tty:true (interactive attach) → -tt forces a remote PTY (and SIGWINCH
 *   propagation). BatchMode is left default so host-key/agent prompts surface
 *   in the terminal. Remote args are NOT quoted here: this argv is handed to a
 *   PTY where the remote command words go to ssh as separate argv elements and
 *   our inputs are already allowlist-validated.
 */
export function remoteTmux(
  t: Target,
  sub: string[],
  opts: { tty: boolean },
): string[] {
  const dest = sshDestination(t);
  const portArgs = t.port ? ['-p', String(t.port)] : [];

  if (opts.tty) {
    return [
      'ssh',
      '-tt',
      '-o',
      `ConnectTimeout=${config.ssh.connectTimeoutTty}`,
      '-o',
      `ServerAliveInterval=${config.ssh.serverAliveInterval}`,
      ...portArgs,
      dest,
      'tmux',
      ...sub,
    ];
  }

  return [
    'ssh',
    '-o',
    'BatchMode=yes',
    '-o',
    `ConnectTimeout=${config.ssh.connectTimeoutMgmt}`,
    ...portArgs,
    dest,
    'tmux',
    ...sub.map(sshQuote),
  ];
}

/**
 * tmux inside a WSL distro (Windows host). We use `--exec` (NOT `--`): `--`
 * runs the command through the distro's login shell, which would re-parse tmux
 * format strings (`#{...}` is a comment, `|` a pipe) and mangle them; `--exec`
 * execs the binary directly with no shell, so argv maps straight through with
 * no quoting — like the local path. The interactive case sets TERM via `env`
 * because WSL does not inherit the Windows TERM.
 */
export function wslTmux(distro: string, sub: string[], opts: { tty: boolean }): string[] {
  const prefix = opts.tty ? ['env', 'TERM=xterm-256color', 'tmux'] : ['tmux'];
  return ['wsl.exe', '-d', distro, '--exec', ...prefix, ...sub];
}

/**
 * Build a non-PTY argv to run an ARBITRARY command on a target (tmux, ls, cat,
 * display-message, …). Same transport rules as management tmux: local runs the
 * argv directly, wsl uses `--exec` (no shell), ssh uses BatchMode + sshQuote.
 */
export function commandArgv(t: Target, argv: string[]): { file: string; args: string[] } {
  let full: string[];
  if (t.kind === 'local') {
    full = argv;
  } else if (t.kind === 'wsl') {
    full = ['wsl.exe', '-d', t.distro ?? '', '--exec', ...argv];
  } else {
    const portArgs = t.port ? ['-p', String(t.port)] : [];
    full = [
      'ssh',
      '-o',
      'BatchMode=yes',
      '-o',
      `ConnectTimeout=${config.ssh.connectTimeoutMgmt}`,
      ...portArgs,
      sshDestination(t),
      ...argv.map(sshQuote),
    ];
  }
  return { file: full[0], args: full.slice(1) };
}

/** Build a management argv (no PTY) for a local / ssh / wsl target. */
export function managementArgv(t: Target, sub: string[]): { file: string; args: string[] } {
  return commandArgv(t, ['tmux', ...sub]);
}

/**
 * Build the create-a-new-session argv, always starting in the user's HOME:
 * - local → tmux `-c <homedir>` (explicit, regardless of the server's cwd),
 * - wsl   → `wsl --cd ~` runs the command from the distro's home; tmux inherits,
 * - ssh   → the remote command already runs from the remote `$HOME`; tmux inherits.
 * `sub` is the new-session subcommand (named or auto-named `-P` form).
 */
export function newSessionArgv(t: Target, sub: string[]): { file: string; args: string[] } {
  if (t.kind === 'local') {
    return { file: 'tmux', args: [...sub, '-c', homedir()] };
  }
  if (t.kind === 'wsl') {
    return { file: 'wsl.exe', args: ['-d', t.distro ?? '', '--cd', '~', '--exec', 'tmux', ...sub] };
  }
  return commandArgv(t, ['tmux', ...sub]);
}

/** Build an interactive attach argv (run inside a PTY) for a local / ssh / wsl target. */
export function attachArgv(t: Target, session: string): { file: string; args: string[] } {
  const sub = ['new-session', '-A', '-s', session]; // NO -d: the PTY supplies the terminal
  let argv: string[];
  if (t.kind === 'local') argv = localTmux(sub);
  else if (t.kind === 'wsl') argv = wslTmux(t.distro ?? '', sub, { tty: true });
  else argv = remoteTmux(t, sub, { tty: true });
  return { file: argv[0], args: argv.slice(1) };
}
