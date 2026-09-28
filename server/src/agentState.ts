export type AgentKind = 'claude' | 'codex' | 'opencode' | 'hermes';
export type AgentState = 'running' | 'waiting' | 'idle' | 'background' | 'settling' | 'unknown';
export type AttentionReason = 'decision' | 'done' | 'error';

export interface AgentSnapshot {
  agentKind: AgentKind;
  agentState: AgentState;
  attentionReason?: AttentionReason;
  agentEvent?: string;
  agentNonce?: string;
}

export const AGENT_OPTION = '@tmuxes_agent';

function isAgentKind(v: string): v is AgentKind {
  return v === 'claude' || v === 'codex' || v === 'opencode' || v === 'hermes';
}

function isAgentState(v: string): v is AgentState {
  return ['running', 'waiting', 'idle', 'background', 'settling', 'unknown'].includes(v);
}

function isAttentionReason(v: string): v is AttentionReason {
  return v === 'decision' || v === 'done' || v === 'error';
}

function cleanToken(v: string): string {
  return v.replace(/[^A-Za-z0-9_.-]/g, '_');
}

export function agentValue(
  kind: AgentKind,
  state: AgentState,
  reason: AttentionReason | '',
  event: string,
  nonce: string,
): string {
  return [
    kind,
    state,
    reason,
    cleanToken(event),
    nonce.replace(/:/g, '_'),
  ].join(':');
}

export function agentInitialValue(kind: AgentKind): string {
  return agentValue(kind, 'unknown', '', 'launch', String(Date.now()));
}

export function parseAgentValue(raw: string | undefined): AgentSnapshot | undefined {
  if (!raw) return undefined;
  const [kind, state, reason, event, ...nonceParts] = raw.split(':');
  if (!isAgentKind(kind) || !isAgentState(state)) return undefined;
  const snap: AgentSnapshot = { agentKind: kind, agentState: state };
  if (isAttentionReason(reason)) snap.attentionReason = reason;
  if (event) snap.agentEvent = event;
  const nonce = nonceParts.join(':');
  if (nonce) snap.agentNonce = nonce;
  return snap;
}
