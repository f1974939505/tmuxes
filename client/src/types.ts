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
export type AttentionReason = 'decision' | 'done';
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

/** A file opened in the right-hand viewer. */
export interface OpenFile {
  targetId: string;
  session: string;
  path: string;
  name: string;
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
