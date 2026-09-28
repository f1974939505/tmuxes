import type { SessionInfo } from './types';

export function isSessionActive(session: SessionInfo): boolean {
  return session.agentState === 'running' || session.agentState === 'background' || session.agentState === 'settling';
}
