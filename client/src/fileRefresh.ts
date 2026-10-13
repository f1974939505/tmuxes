/** One bounded request at a time. Hidden viewers do no work; connection errors pause
 * until a user refresh or an explicitly connected target wakes the loop. */
export function startFileRefresh<T>(options: {
  visible: () => boolean;
  read: (signal: AbortSignal) => Promise<T>;
  result: (value: T) => void;
  error: (error: unknown) => boolean; // true pauses, false allows a transient retry
}, interval = 3000) {
  let disposed = false, busy = false, paused = false, queued = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: AbortController | undefined;
  const run = async (manual = false) => {
    if (disposed) return;
    if (manual) paused = false;
    if (paused || !options.visible()) return;
    if (busy) { queued ||= manual; return; }
    clearTimeout(timer);
    busy = true;
    const request = abort = new AbortController();
    try {
      const value = await options.read(request.signal);
      if (!disposed && !request.signal.aborted) options.result(value);
    } catch (error) {
      if (!disposed && !request.signal.aborted) paused = options.error(error);
    } finally {
      busy = false;
      if (!disposed) {
        if (queued) { queued = false; void run(true); }
        else if (!paused) timer = setTimeout(() => void run(), interval);
      }
    }
  };
  void run();
  return {
    wake: () => { void run(); },
    refresh: () => { void run(true); },
    dispose: () => { disposed = true; clearTimeout(timer); abort?.abort(); },
  };
}
