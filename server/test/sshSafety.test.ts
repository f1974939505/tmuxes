import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Target } from '../src/targets.js';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));

function fakeSsh() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn((script: string) => {
    const id = script.match(/__TMUXES_BEGIN_([a-f0-9]+)__/)! [1];
    queueMicrotask(() => child.stdout.emit('data', Buffer.from(`\n__TMUXES_BEGIN_${id}__\n0\n\n__TMUXES_STDERR_${id}__\n\n__TMUXES_END_${id}__\n`)));
  }) };
  child.kill = vi.fn();
  return child;
}
const target: Target = { id: 'cluster', host: 'cluster', kind: 'ssh', label: 'cluster' };
const argv = ['-o', 'BatchMode=yes', 'cluster', "'tmux'", "'list-sessions'"];

beforeEach(() => { vi.resetModules(); spawn.mockReset(); });

describe('SSH cluster iron rule (mock processes, no network)', () => {
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
  it('failure latches every API offline and repeated manual retries respect cooldown', async () => {
    const child = fakeSsh(); spawn.mockReturnValue(child);
    const ssh = await import('../src/sshManagement.js');
    await ssh.connectSshTarget(target);
    child.stderr.emit('data', Buffer.from('Permission denied (publickey)'));
    child.emit('close', 255, null);
    for (let i = 0; i < 20; i++) {
      expect((await ssh.runSshManagementCommand(target, 'ssh', argv)).code).toBe(255);
      expect((await ssh.connectSshTarget(target)).stderr).toContain('locked');
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
  });
});
