/** Shared types — mirror of the server's REST + WS shapes. */

export interface Target {
  id: string;
  kind: 'local' | 'ssh' | 'wsl' | 'winlocal';
  label: string;
  host?: string;
  user?: string;
  port?: number;
  distro?: string;
  /** Launchable shells (winlocal target only). */
  shells?: { id: string; label: string }[];
}

export interface SessionInfo {
  name: string;
  windows: number;
  attached: boolean;
  /** unix epoch seconds */
  created: number;
  /** epoch seconds from tmux / native shell */
  lastActivity?: number;
  /** recognized agent whose hooks are driving status */
  agentKind?: AgentKind;
  /** current lifecycle state from agent hooks */
  agentState?: AgentState;
  /** why this session is asking for attention */
  attentionReason?: AttentionReason;
  /** hook event that last updated the state */
  agentEvent?: string;
  /** monotonic-ish event token for client edge detection */
  agentNonce?: string;
}

export type AgentKind = 'claude' | 'codex';
export type AgentState = 'running' | 'waiting' | 'idle';
export type AttentionReason = 'decision' | 'done' | 'error';
export type LaunchAgent = 'claude' | 'codex';

export interface WindowInfo {
  index: number;
  name: string;
  panes: number;
  active: boolean;
}

export interface FileEntry {
  name: string;
  type: 'dir' | 'file';
}

export interface FilePreview {
  path: string;
  content: string;
  truncated: boolean;
  binary: boolean;
}

export interface SessionDirectory {
  cwd: string;
  path: string;
  entries: FileEntry[];
}

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

/** A file opened in the right-hand viewer. */
export interface OpenFile {
  targetId: string;
  session: string;
  path: string;
  name: string;
}

/** Read-only text shown in the same viewer region as file previews. */
export interface OpenTextPreview {
  title: string;
  subtitle?: string;
  content: string;
  mode?: 'text' | 'diff';
}

export interface Selection {
  targetId: string;
  session: string;
}

export type SshState = 'hostkey' | 'authfail' | 'refused' | 'timeout';

export type ServerControl =
  | { type: 'ready'; target: string; session: string }
  | { type: 'ssh'; state: SshState; message: string }
  | { type: 'error'; message: string }
  | { type: 'exit'; code: number | null }
  | { type: 'pong' };

/** UI-facing connection status for the terminal panel. */
export type ConnStatus =
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'ssh'; message: string }
  | { kind: 'disconnected'; message: string }
  | { kind: 'error'; message: string };
