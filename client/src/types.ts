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
  /** epoch seconds of last output activity */
  lastActivity?: number;
  /** seconds since the server last observed activity change */
  idleSeconds?: number;
  /** the server has seen this session produce output during this watch */
  observedActive?: boolean;
}

/** Why a session is asking for attention. */
export type AttentionReason = 'decision' | 'done';

export interface AttentionPeek {
  reason: AttentionReason;
  tail: string;
}

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
