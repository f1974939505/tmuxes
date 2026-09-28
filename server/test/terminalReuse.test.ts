import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node-pty', () => ({ spawn }));
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
  it('browser close and reopen retain the same PTY and replay output', () => {
    let output: (s: string) => void = () => {};
    const proc = { onData: (cb: typeof output) => { output = cb; }, onExit: vi.fn(), resize: vi.fn(), kill: vi.fn(), write: vi.fn() };
    spawn.mockReturnValue(proc);
    const first = browser();
    const session = new TerminalSession(first, { id: 'ssh-test', host: 'cluster', kind: 'ssh', label: 'cluster' }, 'work', 80, 24);
    track(session);
    output('retained output');
    first.close();
    expect(proc.kill).not.toHaveBeenCalled();
    const second = browser();
    existingTerminal('ssh-test', 'work')!.attach(second, 80, 24);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(second.send.mock.calls.some((args: any[]) => Buffer.isBuffer(args[0]) && args[0].toString() === 'retained output')).toBe(true);
    session.rename('renamed');
    expect(existingTerminal('ssh-test', 'work')).toBeUndefined();
    expect(existingTerminal('ssh-test', 'renamed')).toBe(session);
  });
});
