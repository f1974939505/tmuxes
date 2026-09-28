import type { SessionInfo } from './tmux/formats.js';

/** Compatibility shim for the sessions route.
 *
 * Agent status comes from native event observations on the target.
 * Never infer failure or completion by scanning terminal output.
 */
export function annotate(_targetId: string, sessions: SessionInfo[]): SessionInfo[] {
  return sessions;
}
