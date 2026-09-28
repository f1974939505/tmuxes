import { describe, expect, it } from 'vitest';
import { applyNativeObservers, type NativeObserver } from '../src/nativeObservers.js';

const sessions = [{ name: 'a', windows: 2, attached: true, created: 1, lastActivity: 2 }];
const observer = (state: NativeObserver['state'], reason: NativeObserver['reason'] = ''): NativeObserver => ({
  key: state, kind: 'codex', id: state, state, reason, session: 'a', since: 1, updated: 2, capability: 'events',
});
describe('native status aggregation', () => {
  it('does not let completion hide another pane or background process', () => {
    for (const state of ['running', 'background', 'unknown'] as const) {
      const result = applyNativeObservers(sessions, [observer('idle', 'done'), observer(state)]);
      expect(result[0].agentState).toBe(state);
      expect(result[0].attentionReason).toBeUndefined();
    }
  });
  it('only assigns observations with an explicit matching session binding', () => {
    expect(applyNativeObservers(sessions, [{ ...observer('waiting', 'decision'), session: null }])).toEqual(sessions);
  });
  it('keeps human decisions visible while other work is running', () => {
    const result = applyNativeObservers(sessions, [observer('running'), observer('waiting', 'decision')]);
    expect(result[0].attentionReason).toBe('decision');
  });
});
