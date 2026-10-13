import type { AttentionReason } from './types';

export function summarizeAttention(reasons: AttentionReason[]): { count: number; reason?: AttentionReason } {
  return { count: reasons.length, reason: reasons.includes('error') ? 'error' : reasons.includes('decision') ? 'decision' : reasons.length ? 'done' : undefined };
}

export interface AttentionMarker<T> {
  top: number; bottom: number; count: number; reason: AttentionReason; label: string; target: T;
}
export function offscreenAttention<T>(markers: AttentionMarker<T>[], viewport: { top: number; bottom: number }) {
  const summarize = (items: AttentionMarker<T>[], above: boolean) => {
    const ordered = [...items].sort((a, b) => above ? b.bottom - a.bottom : a.top - b.top);
    return { count: ordered.reduce((sum, item) => sum + item.count, 0),
      reason: summarizeAttention(ordered.map(item => item.reason)).reason,
      target: ordered[0]?.target, labels: ordered.slice(0, 3).map(item => item.label).join(' · ') };
  };
  const visible = viewport.bottom > viewport.top;
  return {
    above: summarize(visible ? markers.filter(item => item.top < viewport.top - 1) : [], true),
    below: summarize(visible ? markers.filter(item => item.bottom > viewport.bottom + 1) : [], false),
  };
}
