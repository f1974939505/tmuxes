import type { CommandResult } from './exec.js';
import { getSessionCwd } from './files.js';
import { runTargetCommand } from './targetCommand.js';
import type { Target } from './targets.js';
import { commandArgv } from './tmux/builder.js';
import { TmuxError } from './tmux/sessions.js';

const STATUS_TIMEOUT_MS = 15_000;
const ACTION_TIMEOUT_MS = 120_000;
const NUL = String.fromCharCode(0);
const COMMIT_LIMIT = 50;

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
}

export interface GitCounts {
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
}

export type GitChangeKind =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typechange'
  | 'untracked'
  | 'conflicted';

export interface GitFileChange {
  path: string;
  originalPath?: string;
  index: string;
  worktree: string;
  kind: GitChangeKind;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
  remote: boolean;
}

export interface GitState {
  available: boolean;
  cwd: string;
  root?: string;
  branch?: string;
  detached?: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  counts: GitCounts;
  files: GitFileChange[];
  branches: GitBranch[];
  remotes: string[];
  commits: GitCommit[];
  remoteCommits: GitCommit[];
  error?: string;
}

export interface GitOperationStep {
  name: 'fetch' | 'pull' | 'push' | 'add' | 'commit';
  output: string;
  skipped?: boolean;
}

export interface GitOperationResult {
  ok: true;
  output?: string;
  steps?: GitOperationStep[];
  state: GitState;
}

export interface GitCommitDetail {
  hash: string;
  output: string;
}

export interface GitDiffResult {
  path: string;
  staged: boolean;
  diff: string;
}

interface BranchLine {
  name: string;
  current: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] || '';
}

function commandSummary(r: CommandResult): string {
  const text = [r.stdout.trim(), r.stderr.trim()].filter(Boolean).join('\n');
  return text.length > 4000 ? `${text.slice(0, 4000)}\n...` : text;
}

function gitError(action: string, r: CommandResult): TmuxError {
  const msg = firstLine(r.stderr) || firstLine(r.stdout) || `${action} failed`;
  if (/not a git repository/i.test(r.stderr)) return new TmuxError(400, 'not a git repository');
  if (/git: 'credential-manager' is not a git command/i.test(r.stderr)) {
    return new TmuxError(
      502,
      `${action} failed: Git credential helper "credential-manager" is configured but not installed on this target`,
    );
  }
  if (/Permission denied|Authentication failed|Could not read from remote repository/i.test(r.stderr)) {
    return new TmuxError(502, `${action} failed: ${msg}`);
  }
  if (/command not found|spawn git ENOENT|No such file or directory/i.test(r.stderr)) {
    return new TmuxError(502, 'git is not available on this target');
  }
  return new TmuxError(502, `${action} failed: ${msg}`);
}

async function runGit(
  target: Target,
  cwd: string,
  args: string[],
  opts: { action?: boolean; disableCredentialHelper?: boolean } = {},
): Promise<CommandResult> {
  const configArgs = opts.disableCredentialHelper ? ['-c', 'credential.helper='] : [];
  return runTargetCommand(
    target,
    (argvOpts) => commandArgv(target, ['git', ...configArgs, '-C', cwd, ...args], argvOpts),
    {
      timeoutMs: opts.action ? ACTION_TIMEOUT_MS : STATUS_TIMEOUT_MS,
    },
  );
}

function parseTrack(track: string): { ahead?: number; behind?: number } {
  const ahead = /\bahead\s+(\d+)/.exec(track)?.[1];
  const behind = /\bbehind\s+(\d+)/.exec(track)?.[1];
  return {
    ahead: ahead === undefined ? undefined : Number(ahead),
    behind: behind === undefined ? undefined : Number(behind),
  };
}

function parseBranchHeader(header: string): Pick<GitState, 'branch' | 'detached' | 'upstream' | 'ahead' | 'behind'> {
  const state: Pick<GitState, 'branch' | 'detached' | 'upstream' | 'ahead' | 'behind'> = {
    ahead: 0,
    behind: 0,
  };
  if (!header.startsWith('## ')) return state;

  const raw = header.slice(3);
  if (raw.startsWith('HEAD ')) {
    state.detached = true;
    state.branch = 'HEAD';
    return state;
  }
  if (raw.startsWith('No commits yet on ')) {
    state.branch = raw.slice('No commits yet on '.length).trim() || undefined;
    return state;
  }

  const [branchPart, rest] = raw.split('...', 2);
  state.branch = branchPart.trim() || undefined;
  if (!rest) return state;

  const bracket = rest.indexOf('[');
  const upstream = (bracket >= 0 ? rest.slice(0, bracket) : rest).trim();
  if (upstream) state.upstream = upstream;
  if (bracket >= 0) {
    const track = parseTrack(rest.slice(bracket));
    state.ahead = track.ahead ?? 0;
    state.behind = track.behind ?? 0;
  }
  return state;
}

function emptyCounts(): GitCounts {
  return { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 };
}

function isConflictedStatus(index: string, worktree: string): boolean {
  return (
    index === 'U' ||
    worktree === 'U' ||
    (index === 'A' && worktree === 'A') ||
    (index === 'D' && worktree === 'D')
  );
}

function changeKind(index: string, worktree: string): GitChangeKind {
  if (index === '?' && worktree === '?') return 'untracked';
  if (isConflictedStatus(index, worktree)) return 'conflicted';
  const code = worktree !== ' ' ? worktree : index;
  if (code === 'A') return 'added';
  if (code === 'D') return 'deleted';
  if (code === 'R') return 'renamed';
  if (code === 'C') return 'copied';
  if (code === 'T') return 'typechange';
  return 'modified';
}

function parseStatusPath(raw: string): { path: string; originalPath?: string } {
  const arrow = raw.indexOf(' -> ');
  if (arrow < 0) return { path: raw };
  return {
    originalPath: raw.slice(0, arrow),
    path: raw.slice(arrow + 4),
  };
}

function parseGitFileChange(line: string): GitFileChange | undefined {
  if (line.length < 4) return undefined;
  const index = line[0] ?? ' ';
  const worktree = line[1] ?? ' ';
  const rawPath = line.slice(3);
  if (!rawPath) return undefined;
  const { path, originalPath } = parseStatusPath(rawPath);
  const untracked = index === '?' && worktree === '?';
  const conflicted = isConflictedStatus(index, worktree);
  return {
    path,
    originalPath,
    index,
    worktree,
    kind: changeKind(index, worktree),
    staged: index !== ' ' && index !== '?',
    unstaged: worktree !== ' ' && worktree !== '?',
    untracked,
    conflicted,
  };
}

export function parseGitStatus(stdout: string): Pick<GitState, 'branch' | 'detached' | 'upstream' | 'ahead' | 'behind' | 'counts' | 'dirty' | 'files'> {
  const counts: GitCounts = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 };
  let header: ReturnType<typeof parseBranchHeader> = { ahead: 0, behind: 0 };
  const files: GitFileChange[] = [];

  for (const line of stdout.split('\n')) {
    if (!line) continue;
    if (line.startsWith('## ')) {
      header = parseBranchHeader(line);
      continue;
    }
    const file = parseGitFileChange(line);
    if (!file) continue;
    files.push(file);
    if (file.untracked) {
      counts.untracked += 1;
      continue;
    }
    if (file.conflicted) {
      counts.conflicted += 1;
      continue;
    }
    if (file.staged) counts.staged += 1;
    if (file.unstaged) counts.unstaged += 1;
  }

  return {
    ...header,
    counts,
    files,
    dirty: counts.staged + counts.unstaged + counts.untracked + counts.conflicted > 0,
  };
}

function parseBranchLine(line: string): BranchLine | undefined {
  const [head, name, upstream, track] = line.split(NUL);
  if (!name || name.endsWith('/HEAD')) return undefined;
  return {
    name,
    current: head === '*',
    upstream: upstream || undefined,
    ...parseTrack(track ?? ''),
  };
}

export function parseGitBranches(stdout: string, remote: boolean): GitBranch[] {
  return stdout
    .split('\n')
    .map(parseBranchLine)
    .filter((b): b is BranchLine => !!b)
    .map((b) => ({ ...b, remote }))
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      if (a.remote !== b.remote) return a.remote ? 1 : -1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
}

export function parseGitRemotes(stdout: string): string[] {
  return [...new Set(stdout.split('\n').map((l) => l.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  );
}

export function parseGitCommits(stdout: string, remote: boolean): GitCommit[] {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, author, date, ...subjectParts] = line.split(NUL);
      const subject = subjectParts.join(NUL);
      if (!hash || !shortHash) return undefined;
      return {
        hash,
        shortHash,
        author: author ?? '',
        date: date ?? '',
        subject: subject ?? '',
        remote,
      };
    })
    .filter((c): c is GitCommit => !!c);
}

function emptyGitState(cwd: string, error?: string): GitState {
  return {
    available: false,
    cwd,
    ahead: 0,
    behind: 0,
    dirty: false,
    counts: emptyCounts(),
    files: [],
    branches: [],
    remotes: [],
    commits: [],
    remoteCommits: [],
    error,
  };
}

async function gitLog(target: Target, cwd: string, range?: string): Promise<GitCommit[]> {
  const args = [
    'log',
    '-n',
    String(COMMIT_LIMIT),
    '--date=short',
    `--pretty=format:%H%x00%h%x00%an%x00%ad%x00%s`,
  ];
  if (range) args.push(range);
  const r = await runGit(target, cwd, args);
  if (r.code !== 0) {
    if (/does not have any commits yet|unknown revision|bad revision/i.test(r.stderr)) return [];
    throw gitError('git log', r);
  }
  return parseGitCommits(r.stdout, !!range);
}

async function buildGitState(target: Target, cwd: string): Promise<GitState> {
  const root = await runGit(target, cwd, ['rev-parse', '--show-toplevel']);
  if (root.code !== 0) {
    return emptyGitState(cwd, firstLine(root.stderr) || 'not a git repository');
  }

  const repoRoot = firstLine(root.stdout);
  const status = await runGit(target, repoRoot, ['status', '--porcelain=v1', '--branch']);
  if (status.code !== 0) throw gitError('git status', status);

  const localBranches = await runGit(target, repoRoot, [
    'branch',
    '--list',
    '--format=%(HEAD)%00%(refname:short)%00%(upstream:short)%00%(upstream:track)',
  ]);
  if (localBranches.code !== 0) throw gitError('git branch', localBranches);

  const remoteBranches = await runGit(target, repoRoot, [
    'branch',
    '--remotes',
    '--format=%(HEAD)%00%(refname:short)%00%(upstream:short)%00%(upstream:track)',
  ]);
  if (remoteBranches.code !== 0) throw gitError('git branch --remotes', remoteBranches);

  const remotes = await runGit(target, repoRoot, ['remote']);
  if (remotes.code !== 0) throw gitError('git remote', remotes);

  const parsed = parseGitStatus(status.stdout);
  const branches = [
    ...parseGitBranches(localBranches.stdout, false),
    ...parseGitBranches(remoteBranches.stdout, true),
  ];
  const commits = await gitLog(target, repoRoot);
  const remoteCommits = parsed.upstream ? await gitLog(target, repoRoot, 'HEAD..@{upstream}') : [];

  return {
    available: true,
    cwd,
    root: repoRoot,
    branch: parsed.branch,
    detached: parsed.detached,
    upstream: parsed.upstream,
    ahead: parsed.ahead,
    behind: parsed.behind,
    dirty: parsed.dirty,
    counts: parsed.counts,
    files: parsed.files,
    branches,
    remotes: parseGitRemotes(remotes.stdout),
    commits,
    remoteCommits,
  };
}

async function requireGitState(target: Target, session: string): Promise<GitState> {
  const cwd = await getSessionCwd(target, session);
  const state = await buildGitState(target, cwd);
  if (!state.available) throw new TmuxError(400, state.error || 'not a git repository');
  return state;
}

function requireUpstream(state: GitState, action: string): void {
  if (state.detached || !state.branch || state.branch === 'HEAD') {
    throw new TmuxError(400, `${action} requires a checked-out branch`);
  }
  if (!state.upstream) throw new TmuxError(400, `current branch has no upstream for ${action}`);
}

async function runGitStep(
  target: Target,
  state: GitState,
  name: GitOperationStep['name'],
  args: string[],
): Promise<GitOperationStep> {
  let r = await runGit(target, state.root ?? state.cwd, args, { action: true });
  let credentialRetry = false;
  if (r.code !== 0 && /git: 'credential-manager' is not a git command/i.test(r.stderr)) {
    credentialRetry = true;
    r = await runGit(target, state.root ?? state.cwd, args, {
      action: true,
      disableCredentialHelper: true,
    });
  }
  if (r.code !== 0) throw gitError(`git ${name}`, r);
  const output = commandSummary(r);
  return {
    name,
    output: credentialRetry
      ? ['credential-manager helper was unavailable; retried with credential helpers disabled.', output]
          .filter(Boolean)
          .join('\n')
      : output,
  };
}

export async function getSessionGitState(target: Target, session: string): Promise<GitState> {
  const cwd = await getSessionCwd(target, session);
  return buildGitState(target, cwd);
}

export async function fetchSessionGit(target: Target, session: string): Promise<GitOperationResult> {
  const state = await requireGitState(target, session);
  const step = await runGitStep(target, state, 'fetch', ['fetch', '--prune']);
  return { ok: true, output: step.output, state: await buildGitState(target, state.cwd) };
}

export async function pullSessionGit(target: Target, session: string): Promise<GitOperationResult> {
  const state = await requireGitState(target, session);
  requireUpstream(state, 'pull');
  const step = await runGitStep(target, state, 'pull', ['pull', '--ff-only']);
  return { ok: true, output: step.output, state: await buildGitState(target, state.cwd) };
}

export async function pushSessionGit(target: Target, session: string): Promise<GitOperationResult> {
  const state = await requireGitState(target, session);
  requireUpstream(state, 'push');
  const step = await runGitStep(target, state, 'push', ['push']);
  return { ok: true, output: step.output, state: await buildGitState(target, state.cwd) };
}

export async function syncSessionGit(target: Target, session: string): Promise<GitOperationResult> {
  const initial = await requireGitState(target, session);
  requireUpstream(initial, 'sync');

  const steps: GitOperationStep[] = [];
  steps.push(await runGitStep(target, initial, 'fetch', ['fetch', '--prune']));

  const afterFetch = await buildGitState(target, initial.cwd);
  requireUpstream(afterFetch, 'sync');
  steps.push(await runGitStep(target, afterFetch, 'pull', ['pull', '--ff-only']));

  const afterPull = await buildGitState(target, initial.cwd);
  if (afterPull.ahead > 0) {
    steps.push(await runGitStep(target, afterPull, 'push', ['push']));
  } else {
    steps.push({ name: 'push', output: '', skipped: true });
  }

  return { ok: true, steps, state: await buildGitState(target, initial.cwd) };
}

export function isSafeBranchName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 256 &&
    !name.includes('\0') &&
    !name.includes('\n') &&
    !name.includes('\r') &&
    !name.startsWith('-')
  );
}

export async function checkoutSessionGit(
  target: Target,
  session: string,
  branch: string,
): Promise<GitOperationResult> {
  if (!isSafeBranchName(branch)) throw new TmuxError(400, 'invalid branch name');
  const state = await requireGitState(target, session);
  const local = state.branches.find((b) => !b.remote && b.name === branch);
  const remote = state.branches.find((b) => b.remote && b.name === branch);
  if (!local && !remote) throw new TmuxError(400, 'unknown branch');

  const args = local ? ['checkout', branch] : ['checkout', '--track', branch];
  const r = await runGit(target, state.root ?? state.cwd, args, { action: true });
  if (r.code !== 0) throw gitError('git checkout', r);

  return { ok: true, output: commandSummary(r), state: await buildGitState(target, state.cwd) };
}

function requireSafeRelativePath(path: unknown): string {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    path.length > 4096 ||
    path.includes('\0') ||
    path.startsWith('/')
  ) {
    throw new TmuxError(400, 'invalid git path');
  }
  return path;
}

function requireHash(hash: unknown): string {
  if (typeof hash !== 'string' || !/^[0-9A-Fa-f]{4,64}$/.test(hash)) {
    throw new TmuxError(400, 'invalid commit hash');
  }
  return hash;
}

export async function getSessionGitDiff(
  target: Target,
  session: string,
  path: string,
  staged: boolean,
): Promise<GitDiffResult> {
  const safePath = requireSafeRelativePath(path);
  const state = await requireGitState(target, session);
  const change = state.files.find((f) => f.path === safePath);
  const args =
    !staged && change?.untracked
      ? ['diff', '--no-index', '--no-color', '--', '/dev/null', safePath]
      : ['diff', '--no-ext-diff', '--no-color', 'HEAD', '--', safePath];
  let r = await runGit(target, state.root ?? state.cwd, args);
  if (r.code !== 0 && /ambiguous argument 'HEAD'|unknown revision/i.test(r.stderr)) {
    const fallbackArgs = staged
      ? ['diff', '--cached', '--no-ext-diff', '--no-color', '--', safePath]
      : ['diff', '--no-ext-diff', '--no-color', '--', safePath];
    r = await runGit(target, state.root ?? state.cwd, fallbackArgs);
  }
  if (r.code !== 0 && !(change?.untracked && r.code === 1)) throw gitError('git diff', r);
  return { path: safePath, staged, diff: r.stdout || 'No diff available.' };
}

export async function getSessionGitCommit(
  target: Target,
  session: string,
  hash: string,
): Promise<GitCommitDetail> {
  const safeHash = requireHash(hash);
  const state = await requireGitState(target, session);
  const r = await runGit(target, state.root ?? state.cwd, [
    'show',
    '--stat',
    '--patch',
    '--find-renames',
    '--no-ext-diff',
    '--no-color',
    '--date=short',
    safeHash,
    '--',
  ]);
  if (r.code !== 0) throw gitError('git show', r);
  return { hash: safeHash, output: r.stdout };
}

function requireCommitMessage(message: unknown): string {
  if (typeof message !== 'string') throw new TmuxError(400, 'commit message must be a string');
  const trimmed = message.trim();
  if (!trimmed) throw new TmuxError(400, 'commit message is required');
  if (trimmed.length > 5000 || trimmed.includes('\0')) {
    throw new TmuxError(400, 'invalid commit message');
  }
  return trimmed;
}

export async function commitSessionGit(
  target: Target,
  session: string,
  message: string,
): Promise<GitOperationResult> {
  const safeMessage = requireCommitMessage(message);
  const state = await requireGitState(target, session);
  if (!state.dirty) throw new TmuxError(400, 'working tree has no changes to commit');
  if (state.counts.conflicted > 0) throw new TmuxError(400, 'resolve conflicts before committing');

  const steps: GitOperationStep[] = [];
  steps.push(await runGitStep(target, state, 'add', ['add', '-A']));
  const afterAdd = await buildGitState(target, state.cwd);
  const commit = await runGit(target, afterAdd.root ?? afterAdd.cwd, ['commit', '-m', safeMessage], {
    action: true,
  });
  if (commit.code !== 0) throw gitError('git commit', commit);
  steps.push({ name: 'commit', output: commandSummary(commit) });
  return { ok: true, steps, state: await buildGitState(target, state.cwd) };
}
