import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Target } from '../src/targets.js';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));

function fakeSsh() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.write = vi.fn((script: string) => {
    const id = script.match(/__TMUXES_BEGIN_([a-f0-9]+)__/)! [1];
    queueMicrotask(() => child.stdout.emit('data', Buffer.from(`\n__TMUXES_BEGIN_${id}__\n0\n\n__TMUXES_STDERR_${id}__\n\n__TMUXES_END_${id}__\n`)));
  });
  child.kill = vi.fn();
  return child;
}
const target: Target = { id: 'cluster', host: 'cluster', kind: 'ssh', label: 'cluster' };
const argv = ['-o', 'BatchMode=yes', 'cluster', "'tmux'", "'list-sessions'"];

beforeEach(() => { vi.resetModules(); spawn.mockReset(); });

describe('SSH cluster iron rule (mock processes, no network)', () => {
  it('media previews and message pages cannot open an offline destination', async () => {
    const media = await import('../src/fileContent.js');
    const reader = await import('../src/agentMessages.js');
    await Promise.all(Array.from({ length: 12 }, async () => {
      await expect(media.fileIdentity(target, '/project/a.png')).rejects.toMatchObject({ status: 503 });
      await expect(media.serveFileContent(target, '/project/a.bin', { headers: {} } as any, {} as any, true)).rejects.toMatchObject({ status: 503 });
      await expect(reader.readAgentMessages(target, 'session', undefined, 'newer')).rejects.toMatchObject({ status: 503 });
    }));
    expect(spawn).not.toHaveBeenCalled();
  });
  it('binary chunks and reading across browsers reuse exactly one explicit connection', async () => {
    const child = fakeSsh();
    child.stdin.write.mockImplementation((script: string) => {
      const id = script.match(/__TMUXES_BEGIN_([a-f0-9]+)__/)! [1];
      const output = script.includes('stat -c') ? '4|2026-10-13 00:00:00.000000|1' : script.includes('dd if=') ? Buffer.from([0, 255, 128, 12]).toString('base64') : script.includes('messages') ? JSON.stringify({ availability: 'ready', source: 'bound', messages: [] }) : '';
      queueMicrotask(() => child.stdout.emit('data', Buffer.from(`\n__TMUXES_BEGIN_${id}__\n0\n${Buffer.from(output).toString('base64')}\n__TMUXES_STDERR_${id}__\n\n__TMUXES_END_${id}__\n`)));
    });
    spawn.mockReturnValue(child);
    const ssh = await import('../src/sshManagement.js');
    const media = await import('../src/fileContent.js');
    const reader = await import('../src/agentMessages.js');
    await ssh.connectSshTarget(target);
    const meta = await media.fileIdentity(target, '/project/a.png');
    const bytes = await media.readFileBlock(target, '/project/a.png', 0, 4, meta.identity);
    expect(bytes).toEqual(Buffer.from([0, 255, 128, 12]));
    await Promise.all(Array.from({ length: 20 }, (_, i) => reader.readAgentMessages({ ...target, id: `browser-${i}` }, 'session', undefined, 'newer')));
    await Promise.all(Array.from({ length: 4 }, (_, i) => {
      const res = { destroyed: false, set: vi.fn(), status: vi.fn(), write: vi.fn(() => true), end: vi.fn() };
      return media.serveFileContent({ ...target, id: `download-browser-${i}` }, '/project/a.bin', { headers: {}, method: 'GET' } as any, res as any, true)
        .then(() => expect(res.write).toHaveBeenCalledWith(Buffer.from([0, 255, 128, 12])));
    }));
    expect(spawn).toHaveBeenCalledTimes(1);
    for (const [script] of child.stdin.write.mock.calls.slice(1)) {
      expect(script).not.toContain('mktemp');
      expect(script).toContain('__tmuxes_memory');
    }
    child.emit('close', 255, null);
    await expect(reader.readAgentMessages(target, 'session', 'cursor', 'older')).rejects.toMatchObject({ status: 503 });
    await expect(media.serveFileContent(target, '/project/a.bin', { headers: {} } as any, {} as any, true)).rejects.toMatchObject({ status: 503 });
    expect(spawn).toHaveBeenCalledTimes(1);
  });
  it('stream errors latch offline even without a write callback', async () => {
    const child = fakeSsh(); spawn.mockReturnValue(child);
    const ssh = await import('../src/sshManagement.js');
    await ssh.connectSshTarget(target);
    expect(() => child.stdin.emit('error', new Error('EPIPE'))).not.toThrow();
    expect(ssh.sshTargetConnected(target)).toBe(false);
    expect((await ssh.runSshManagementCommand(target, 'ssh', argv)).code).toBe(255);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
  it('commands cannot consume the shared management protocol as stdin', async () => {
    const child = fakeSsh(); spawn.mockReturnValue(child);
    const ssh = await import('../src/sshManagement.js');
    await ssh.connectSshTarget(target);
    await ssh.runSshManagementCommand(target, 'ssh', ['cluster', 'cat']);
    expect(child.stdin.write.mock.calls.at(-1)[0]).toContain('( cat ) < /dev/null');
    ssh.disposeSshTargets();
  });
  it('ordinary reads never initiate SSH, even from many callers', async () => {
    const ssh = await import('../src/sshManagement.js');
    await Promise.all(Array.from({ length: 30 }, () => ssh.runSshManagementCommand(target, 'ssh', argv)));
    expect(spawn).not.toHaveBeenCalled();
  });
  it('one explicit connection serves concurrent reads and duplicate target IDs', async () => {
    spawn.mockImplementation(fakeSsh);
    const ssh = await import('../src/sshManagement.js');
    const connecting = ssh.connectSshTarget(target);
    expect(ssh.sshTargetConnected(target)).toBe(false);
    expect((await ssh.runSshManagementCommand(target, 'ssh', argv)).code).toBe(255);
    expect((await connecting).code).toBe(0);
    await Promise.all(Array.from({ length: 20 }, () => ssh.runSshManagementCommand({ ...target, id: 'alias-ui' }, 'ssh', argv)));
    expect(spawn).toHaveBeenCalledTimes(1);
    ssh.disposeSshTargets();
  });
  it('failure latches every read offline; immediate concurrent manual retries share one connection', async () => {
    const child = fakeSsh(); spawn.mockReturnValue(child);
    const ssh = await import('../src/sshManagement.js');
    await ssh.connectSshTarget(target);
    child.stderr.emit('data', Buffer.from('Permission denied (publickey)'));
    child.emit('close', 255, null);
    for (let i = 0; i < 20; i++) {
      expect((await ssh.runSshManagementCommand(target, 'ssh', argv)).code).toBe(255);
    }
    expect(spawn).toHaveBeenCalledTimes(1);
  });
  it('terminal failure blocks management reads too', async () => {
    spawn.mockImplementation(fakeSsh);
    const ssh = await import('../src/sshManagement.js');
    await ssh.connectSshTarget(target);
    ssh.blockSshTarget(target);
    expect(ssh.sshTargetConnected(target)).toBe(false);
    await ssh.runSshManagementCommand(target, 'ssh', argv);
    expect(spawn).toHaveBeenCalledTimes(1);
    const replacement = fakeSsh(); spawn.mockReturnValue(replacement);
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) =>
      ssh.connectSshTarget({ ...target, id: `browser-${i}` })));
    expect(results.every(result => result.code === 0)).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(ssh.sshTargetConnected(target)).toBe(true);
    ssh.disposeSshTargets();
  });
  it('shutdown resolves pending reads without waiting for a child close event', async () => {
    const child = fakeSsh(); spawn.mockReturnValue(child);
    const ssh = await import('../src/sshManagement.js');
    await ssh.connectSshTarget(target);
    child.stdin.write.mockImplementation(() => true);
    const pending = ssh.runSshManagementCommand(target, 'ssh', argv);
    await Promise.resolve();
    ssh.disposeSshTargets();
    expect((await pending).code).toBe(255);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
  it('a failed channel write latches offline without another login', async () => {
    const child = fakeSsh(); spawn.mockReturnValue(child);
    const ssh = await import('../src/sshManagement.js');
    await ssh.connectSshTarget(target);
    child.stdin.write.mockImplementation((_script: string, callback: (error: Error) => void) => callback(new Error('broken pipe')));
    await ssh.runSshManagementCommand(target, 'ssh', argv);
    expect(ssh.sshTargetConnected(target)).toBe(false);
    expect((await ssh.runSshManagementCommand(target, 'ssh', argv)).code).toBe(255);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
  it('time passing after failure never schedules another login', async () => {
    vi.useFakeTimers();
    try {
      const child = fakeSsh(); spawn.mockReturnValue(child);
      const ssh = await import('../src/sshManagement.js');
      await ssh.connectSshTarget(target);
      child.emit('close', 255, null);
      await vi.advanceTimersByTimeAsync(60 * 60_000);
      expect(ssh.sshTargetConnected(target)).toBe(false);
      expect(spawn).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('late failures from an old terminal cannot block a successful manual retry', async () => {
    const old = fakeSsh(); spawn.mockReturnValue(old);
    const ssh = await import('../src/sshManagement.js');
    await ssh.connectSshTarget(target);
    const generation = ssh.sshConnectionGeneration(target);
    old.emit('close', 255, null);
    spawn.mockImplementation(fakeSsh);
    await ssh.connectSshTarget(target);
    ssh.blockSshTarget(target, generation);
    old.emit('error', new Error('late failure'));
    expect(ssh.sshTargetConnected(target)).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(2);
    ssh.disposeSshTargets();
  });
});
