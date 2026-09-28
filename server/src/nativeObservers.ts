import type { SessionInfo } from './tmux/formats.js';
import type { AgentKind, AgentState, AttentionReason } from './agentState.js';

export interface NativeObserver {
  key: string;
  kind: AgentKind;
  id: string;
  state: AgentState;
  reason: AttentionReason | '';
  session: string | null;
  since: number;
  updated: number;
  capability: string;
}

export function applyNativeObservers(sessions: SessionInfo[], observers: NativeObserver[]): SessionInfo[] {
  return sessions.map(({ agentKind: _kind, agentState: _state, attentionReason: _reason,
    agentEvent: _event, agentNonce: _nonce, ...session }) => {
    // Multiple native processes can share a tmux session. A completion in one
    // must never hide another process's running/background/unknown state.
    const records = observers.filter((x) => x.session === session.name);
    if (!records.length) return session;
    const rank = (x: NativeObserver) => x.reason === 'decision' ? 0 : x.reason === 'error' ? 1
      : x.state === 'running' ? 2 : x.state === 'background' ? 3 : x.state === 'unknown' ? 4
        : x.state === 'settling' ? 5 : 6;
    const chosen = [...records].sort((a, b) => rank(a) - rank(b) || b.since - a.since)[0];
    return { ...session, agentKind: chosen.kind, agentState: chosen.state,
      ...(chosen.reason ? { attentionReason: chosen.reason } : {}),
      agentEvent: 'NativeObserver', agentNonce: `${chosen.key}.${chosen.updated}.${chosen.state}.${chosen.reason}` };
  });
}
