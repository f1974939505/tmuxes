import type { AttentionReason, SessionInfo } from './types';

export function isSessionActive(session: SessionInfo): boolean {
  return session.agentState === 'running';
}

export function agentStatusLabel(session: SessionInfo): string {
  if (!session.agentKind || !session.agentState) return '未接入 agent hook';
  if (session.agentState === 'running') return `${session.agentKind} 正在运行`;
  if (session.agentState === 'waiting') return `${session.agentKind} 需要决策`;
  if (session.attentionReason === 'done') return `${session.agentKind} 已结束运行`;
  if (session.attentionReason === 'error') return `${session.agentKind} 异常停止`;
  return `${session.agentKind} 空闲`;
}

export function attentionLabel(reason: AttentionReason): string {
  if (reason === 'decision') return '需要决策';
  if (reason === 'error') return '异常停止';
  return '结束运行';
}
