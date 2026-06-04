import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../config.js';
import { sshDestination, type Target } from '../targets.js';
import { isWindows } from '../platform.js';

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

function sshControlDir(): string | null {
  // OpenSSH connection sharing avoids repeated TCP/auth handshakes for sidebar
  // polling and file operations. Windows OpenSSH does not reliably support Unix
  // control sockets, so leave that platform on plain ssh.
  if (isWindows) return null;

  const uid = process.getuid?.() ?? 'user';
  const dir = join(tmpdir(), `tmuxes-ssh-${uid}`);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    return null;
  }
  return dir;
}

export function sshControlPath(t: Target): string | null {
  const dir = sshControlDir();
  if (!dir) return null;
  const key = `${sshDestination(t)}:${t.port ?? 22}:${t.id}`;
  return join(dir, createHash('sha1').update(key).digest('hex'));
}

function sshMultiplexArgs(t: Target): string[] {
  const path = sshControlPath(t);
  if (!path) return [];

  return [
    '-o',
    'ControlMaster=auto',
    '-o',
    `ControlPath=${path}`,
    '-o',
    `ControlPersist=${config.ssh.controlPersist}`,
  ];
}

export function sshClientArgs(
  t: Target,
  opts: { tty?: boolean; batchMode?: boolean; connectTimeout: number; multiplex?: boolean },
): string[] {
  const portArgs = t.port ? ['-p', String(t.port)] : [];
  return [
    'ssh',
    ...(opts.tty ? ['-tt'] : []),
    ...(opts.batchMode ? ['-o', 'BatchMode=yes'] : []),
    '-o',
    `ConnectTimeout=${opts.connectTimeout}`,
    ...(opts.multiplex === false ? ['-o', 'ControlMaster=no'] : sshMultiplexArgs(t)),
    ...portArgs,
    sshDestination(t),
  ];
}

/**
 * Remote tmux argv via the system ssh binary.
 * - tty:false (management) → BatchMode + short ConnectTimeout so it fails fast
 *   and never hangs on a prompt. Remote args are sshQuote'd.
 * - tty:true (interactive attach) → -tt forces a remote PTY (and SIGWINCH
 *   propagation). BatchMode is left default so host-key/agent prompts surface
 *   in the terminal. tmuxes does not force ServerAliveInterval; users can set
 *   keepalives in ~/.ssh/config if their site allows them. Remote args are NOT
 *   quoted here: this argv is handed to a PTY where the remote command words go
 *   to ssh as separate argv elements and our inputs are already allowlist-
 *   validated.
 */
export function remoteTmux(
  t: Target,
  sub: string[],
  opts: { tty: boolean; multiplex?: boolean },
): string[] {
  if (opts.tty) {
    return [
      ...sshClientArgs(t, {
        tty: true,
        connectTimeout: config.ssh.connectTimeoutTty,
        multiplex: opts.multiplex,
      }),
      'tmux',
      ...sub,
    ];
  }

  return [
    ...sshClientArgs(t, {
      batchMode: true,
      connectTimeout: config.ssh.connectTimeoutMgmt,
      multiplex: opts.multiplex,
    }),
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
export function commandArgv(
  t: Target,
  argv: string[],
  opts: { multiplex?: boolean } = {},
): { file: string; args: string[] } {
  let full: string[];
  if (t.kind === 'local') {
    full = argv;
  } else if (t.kind === 'wsl') {
    full = ['wsl.exe', '-d', t.distro ?? '', '--exec', ...argv];
  } else {
    full = [
      ...sshClientArgs(t, {
        batchMode: true,
        connectTimeout: config.ssh.connectTimeoutMgmt,
        multiplex: opts.multiplex,
      }),
      ...argv.map(sshQuote),
    ];
  }
  return { file: full[0], args: full.slice(1) };
}

/** Build a management argv (no PTY) for a local / ssh / wsl target. */
export function managementArgv(
  t: Target,
  sub: string[],
  opts: { multiplex?: boolean } = {},
): { file: string; args: string[] } {
  return commandArgv(t, ['tmux', ...sub], opts);
}

/**
 * Build the create-a-new-session argv, always starting in the user's HOME:
 * - local → tmux `-c <homedir>` (explicit, regardless of the server's cwd),
 * - wsl   → `wsl --cd ~` runs the command from the distro's home; tmux inherits,
 * - ssh   → the remote command already runs from the remote `$HOME`; tmux inherits.
 * `sub` is the new-session subcommand (named or auto-named `-P` form).
 */
export function newSessionArgv(
  t: Target,
  sub: string[],
  opts: { multiplex?: boolean } = {},
): { file: string; args: string[] } {
  if (t.kind === 'local') {
    return { file: 'tmux', args: [...sub, '-c', homedir()] };
  }
  if (t.kind === 'wsl') {
    return { file: 'wsl.exe', args: ['-d', t.distro ?? '', '--cd', '~', '--exec', 'tmux', ...sub] };
  }
  return commandArgv(t, ['tmux', ...sub], opts);
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
