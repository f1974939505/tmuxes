/** Shared WebSocket control-message types. Terminal bytes travel as BINARY
 *  frames; everything below travels as TEXT (JSON) frames. */

export type SshState = 'hostkey' | 'authfail' | 'refused' | 'timeout';

export type ClientControl =
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'ping' };

export type ServerControl =
  | { type: 'restore'; cols: number; rows: number; data: string }
  | { type: 'geometry'; cols: number; rows: number }
  | { type: 'ready'; target: string; session: string }
  | { type: 'ssh'; state: SshState; message: string }
  | { type: 'error'; message: string }
  | { type: 'exit'; code: number | null }
  | { type: 'pong' };
