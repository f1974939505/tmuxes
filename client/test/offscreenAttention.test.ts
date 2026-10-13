import { describe, expect, it } from 'vitest';
import { offscreenAttention, summarizeAttention, type AttentionMarker } from '../src/offscreenAttention';
const marker = (top: number, bottom: number, target: string, count = 1, reason: AttentionMarker<string>['reason'] = 'done'): AttentionMarker<string> => ({ top, bottom, target, count, reason, label: target });

describe('unread alerts outside the session viewport', () => {
  it('shows both directions and chooses the nearest reminder without counting visible rows', () => {
    const result = offscreenAttention([marker(-60, -30, 'far'), marker(-5, 15, 'near'),
      marker(30, 60, 'visible'), marker(105, 130, 'below'), marker(150, 180, 'far-below')], { top: 0, bottom: 100 });
    expect(result.above.count).toBe(2); expect(result.above.target).toBe('near');
    expect(result.below.count).toBe(2); expect(result.below.target).toBe('below');
  });
  it('counts collapsed proxies once and preserves error / decision / done priority', () => {
    const result = offscreenAttention([marker(110, 140, 'folded-folder', 4, 'decision'), marker(150, 180, 'error', 1, 'error')], { top: 0, bottom: 100 });
    expect(result.below.count).toBe(5); expect(result.below.reason).toBe('error');
    expect(summarizeAttention(['done', 'decision']).reason).toBe('decision');
    expect(summarizeAttention([])).toEqual({ count: 0, reason: undefined });
  });
  it('removes arrows when alerts become visible or the viewport is hidden', () => {
    expect(offscreenAttention([marker(15, 40, 'visible')], { top: 0, bottom: 100 }).below.count).toBe(0);
    const hidden = offscreenAttention([marker(110, 140, 'alert')], { top: 0, bottom: 0 });
    expect(hidden.above.count + hidden.below.count).toBe(0);
  });
});
