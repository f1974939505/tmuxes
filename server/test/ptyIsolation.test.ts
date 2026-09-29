import { afterEach, describe, expect, it } from 'vitest';
import { IsolatedPty, stopPtyHosts } from '../src/ptyProcess.js';
const fixture = new URL('./fixtures/pty-stall.mjs', import.meta.url);
function output(pty: IsolatedPty, message: string | Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { listener.dispose(); reject(new Error('output timed out')); }, 4000);
    const listener = pty.onData(data => { clearTimeout(timer); listener.dispose(); resolve(data); });
    pty.write(message);
  });
}
afterEach(async () => { await stopPtyHosts(); });
describe('PTY host isolation (real child processes, no SSH)', () => {
  it('a synchronously blocked resize cannot stop a second terminal or shutdown', async () => {
    const broken = new IsolatedPty('unused', [], { env: { STALL: '1' } }, fixture);
    const healthy = new IsolatedPty('unused', [], {}, fixture);
    expect(await output(broken, 'ready')).toBe('ready');
    broken.resize(100, 30);
    expect(await output(healthy, 'still interactive')).toBe('still interactive');
    expect(await output(healthy, Buffer.from([27, 91, 77, 96, 200, 240]))).toBe('1b5b4d60c8f0');
    const begin = Date.now();
    broken.kill();
    await broken.stopped;
    expect(Date.now() - begin).toBeLessThan(6500);
    expect(await output(healthy, 'survived')).toBe('survived');
  }, 12000);
  it('input flooding has a bounded queue and detaches only that host', async () => {
    const pty = new IsolatedPty('unused', [], {}, fixture);
    pty.write('x'.repeat(256 * 1024 + 1));
    await pty.stopped;
  }, 8000);
  it('times out a wedged native operation without retrying or blocking the parent', async () => {
    const pty = new IsolatedPty('unused', [], { env: { STALL: '1' } }, fixture);
    await output(pty, 'ready');
    const start = Date.now();
    pty.resize(100, 30);
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 100);
    try {
      await pty.stopped;
      expect(ticks).toBeGreaterThan(50);
      expect(Date.now() - start).toBeLessThan(16000);
    } finally { clearInterval(timer); }
  }, 18000);

});
