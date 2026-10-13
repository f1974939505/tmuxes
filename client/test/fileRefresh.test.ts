import { afterEach, expect, it, vi } from 'vitest';
import { startFileRefresh } from '../src/fileRefresh';
afterEach(() => vi.useRealTimers());

it('coalesces manual refreshes during a slow read, and cancels stale callbacks on close', async () => {
  vi.useFakeTimers();
  let finish: (value: number) => void = () => {};
  const result = vi.fn(), signals: AbortSignal[] = [];
  const read = vi.fn((signal: AbortSignal) => { signals.push(signal); return new Promise<number>(resolve => { finish = resolve; }); });
  const loop = startFileRefresh({ visible: () => true, read, result, error: () => true });
  for (let i = 0; i < 20; i++) loop.refresh();
  await vi.advanceTimersByTimeAsync(20_000); expect(read).toHaveBeenCalledTimes(1);
  finish(1); await Promise.resolve(); await Promise.resolve();
  expect(read).toHaveBeenCalledTimes(2); expect(result).toHaveBeenCalledWith(1);
  loop.dispose(); expect(signals[1].aborted).toBe(true);
  finish(2); await vi.advanceTimersByTimeAsync(60_000);
  expect(result).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(2);
});

it('pauses hidden documents and failures, resumes only on visibility or explicit refresh', async () => {
  vi.useFakeTimers(); let visible = false;
  const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(2);
  const loop = startFileRefresh({ visible: () => visible, read, result: () => {}, error: () => true });
  await vi.advanceTimersByTimeAsync(60_000); expect(read).not.toHaveBeenCalled();
  visible = true; loop.wake(); await Promise.resolve(); await Promise.resolve();
  await vi.advanceTimersByTimeAsync(60_000); loop.wake(); expect(read).toHaveBeenCalledTimes(1);
  loop.refresh(); await Promise.resolve(); await Promise.resolve(); expect(read).toHaveBeenCalledTimes(2);
  visible = false; await vi.advanceTimersByTimeAsync(10_000); expect(read).toHaveBeenCalledTimes(2);
  visible = true; loop.wake(); await Promise.resolve(); expect(read).toHaveBeenCalledTimes(3);
  loop.dispose();
});

it('retries a changing file after the normal interval without spinning', async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockRejectedValueOnce({ status: 409 }).mockResolvedValue(1);
  const result = vi.fn();
  const loop = startFileRefresh({ visible: () => true, read, result, error: () => false });
  await vi.advanceTimersByTimeAsync(2999); expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(read).toHaveBeenCalledTimes(2); expect(result).toHaveBeenCalledWith(1);
  loop.dispose();
});
