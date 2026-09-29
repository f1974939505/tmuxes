import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('../src/ptyProcess.js', () => ({ spawnPty: spawn }));
vi.mock('../src/exe.js', () => ({ resolveExecutable: (file: string) => file }));
import { TerminalSession, track, existingTerminal, disposeAll } from '../src/ws/terminalSession.js';

function browser() {
  const ws = new EventEmitter() as any;
  ws.OPEN = 1; ws.readyState = 1; ws.bufferedAmount = 0;
  ws.send = vi.fn(); ws.ping = vi.fn(); ws.terminate = vi.fn();
  ws.close = () => ws.emit('close');
  return ws;
}
afterEach(() => { disposeAll(); spawn.mockReset(); });
describe('terminal reuse without additional SSH logins', () => {
  it('browser close and reopen retain the same PTY and restore the screen', async () => {
    let output: (s: string) => void = () => {};
    const proc = { onData: (cb: typeof output) => { output = cb; }, onExit: vi.fn(), resize: vi.fn(), kill: vi.fn(), write: vi.fn() };
    spawn.mockReturnValue(proc);
    const first = browser();
    const session = new TerminalSession(first, { id: 'ssh-test', host: 'cluster', kind: 'ssh', label: 'cluster' }, 'work', 80, 24);
    track(session);
    await vi.waitFor(() => expect(first.send).toHaveBeenCalled());
    output('retained output');
    first.close();
    expect(proc.kill).not.toHaveBeenCalled();
    const second = browser();
    existingTerminal('ssh-test', 'work')!.attach(second, 80, 24);
    expect(spawn).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(second.send.mock.calls.some((args: any[]) =>
      typeof args[0] === 'string' && JSON.parse(args[0]).type === 'restore' && args[0].includes('retained output'))).toBe(true));
    session.rename('renamed');
    expect(existingTerminal('ssh-test', 'work')).toBeUndefined();
    expect(existingTerminal('ssh-test', 'renamed')).toBe(session);
  });
  it('a slow viewer cannot pause the PTY or block a healthy viewer', async () => {
    let output: (s: string) => void = () => {};
    const proc = { onData: (cb: typeof output) => { output = cb; }, onExit: vi.fn(), resize: vi.fn(), kill: vi.fn(), write: vi.fn(), pause: vi.fn() };
    spawn.mockReturnValue(proc);
    const slow = browser(), healthy = browser();
    const session = new TerminalSession(slow, { id: 'local', kind: 'local', label: 'local' }, 'work', 80, 24);
    track(session); session.attach(healthy, 80, 24);
    await vi.waitFor(() => expect(healthy.send).toHaveBeenCalled());
    slow.bufferedAmount = 5 * 1024 * 1024;
    output('fresh output');
    await vi.waitFor(() => expect(slow.terminate).toHaveBeenCalledOnce());
    expect(proc.pause).not.toHaveBeenCalled();
    expect(proc.kill).not.toHaveBeenCalled();
    expect(proc.resize).not.toHaveBeenCalled();
    healthy.emit('message', Buffer.from('input'), true);
    for (const frame of ['null', 'false', '[]', '"resize"']) {
      expect(() => healthy.emit('message', Buffer.from(frame), false)).not.toThrow();
    }
    expect(proc.write).toHaveBeenCalledWith(Buffer.from('input'));
    const mouse = Buffer.from([27, 91, 77, 96, 200, 240]);
    healthy.emit('message', mouse, true);
    expect(proc.write).toHaveBeenLastCalledWith(mouse);
    expect(healthy.send.mock.calls.some((args: any[]) => Buffer.isBuffer(args[0]) && args[0].toString() === 'fresh output')).toBe(true);
  });

});
