import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import {
  sshQuote,
  localTmux,
  remoteTmux,
  wslTmux,
  managementArgv,
  attachArgv,
  newSessionArgv,
} from '../src/tmux/builder.js';
import type { Target } from '../src/targets.js';

const local: Target = { id: 'local', kind: 'local', label: 'Local' };
const sshFull: Target = { id: 'env-x', kind: 'ssh', label: 'alice@web1:2222', host: 'web1', user: 'alice', port: 2222 };
const sshAlias: Target = { id: 'cfg-devbox', kind: 'ssh', label: 'devbox', host: 'devbox' };
const wsl: Target = { id: 'wsl-Ubuntu', kind: 'wsl', label: 'Ubuntu', distro: 'Ubuntu' };

describe('sshQuote', () => {
  it('single-quotes and escapes embedded quotes', () => {
    expect(sshQuote('plain')).toBe(`'plain'`);
    expect(sshQuote(`it's`)).toBe(`'it'\\''s'`);
  });
});

describe('localTmux', () => {
  it('prefixes tmux with zero quoting', () => {
    expect(localTmux(['list-sessions', '-F', 'x'])).toEqual(['tmux', 'list-sessions', '-F', 'x']);
  });
});

describe('remoteTmux management (tty:false)', () => {
  it('uses BatchMode, ConnectTimeout, connection sharing, port, and quotes remote args', () => {
    const argv = remoteTmux(sshFull, ['list-sessions', '-F', 'a b'], { tty: false });
    expect(argv.slice(0, 5)).toEqual(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8']);
    expect(argv).toContain('ControlMaster=auto');
    expect(argv).toContain('ControlPersist=yes');
    expect(argv.some((arg) => arg.startsWith('ControlPath='))).toBe(true);
    expect(argv).toContain('-p');
    expect(argv).toContain('2222');
    expect(argv).toContain('alice@web1');
    expect(argv.slice(-4)).toEqual(['tmux', `'list-sessions'`, `'-F'`, `'a b'`]);
  });
  it('uses the bare alias when no user/port', () => {
    const argv = remoteTmux(sshAlias, ['kill-session', '-t', 'work'], { tty: false });
    expect(argv).toContain('devbox');
    expect(argv).not.toContain('-p');
    expect(argv[argv.length - 1]).toBe(`'work'`);
  });
  it('can disable connection sharing for a one-shot reconnect attempt', () => {
    const argv = remoteTmux(sshAlias, ['list-sessions'], { tty: false, multiplex: false });
    expect(argv).toContain('ControlMaster=no');
    expect(argv).not.toContain('ControlMaster=auto');
    expect(argv).not.toContain('ControlPersist=yes');
    expect(argv.some((arg) => arg.startsWith('ControlPath='))).toBe(false);
  });
});

describe('remoteTmux interactive (tty:true)', () => {
  it('forces a PTY with -tt, shares the ssh connection, and does not quote args', () => {
    const argv = remoteTmux(sshFull, ['new-session', '-A', '-s', 'work'], { tty: true });
    expect(argv).toContain('-tt');
    expect(argv).toContain('ControlMaster=auto');
    expect(argv).toContain('ControlPersist=yes');
    expect(argv.some((arg) => arg.startsWith('ServerAliveInterval='))).toBe(false);
    expect(argv.slice(-4)).toEqual(['new-session', '-A', '-s', 'work']);
  });
});

describe('wslTmux', () => {
  it('management runs tmux directly in the distro via wsl.exe -- (no shell)', () => {
    expect(wslTmux('Ubuntu', ['list-sessions', '-F', 'x'], { tty: false })).toEqual([
      'wsl.exe',
      '-d',
      'Ubuntu',
      '--exec',
      'tmux',
      'list-sessions',
      '-F',
      'x',
    ]);
  });
  it('interactive sets TERM via env since WSL does not inherit it', () => {
    expect(wslTmux('Ubuntu', ['new-session', '-A', '-s', 'work'], { tty: true })).toEqual([
      'wsl.exe',
      '-d',
      'Ubuntu',
      '--exec',
      'env',
      'TERM=xterm-256color',
      'tmux',
      'new-session',
      '-A',
      '-s',
      'work',
    ]);
  });
});

describe('managementArgv / attachArgv', () => {
  it('splits file and args for local', () => {
    expect(managementArgv(local, ['list-sessions'])).toEqual({ file: 'tmux', args: ['list-sessions'] });
  });
  it('local attach uses new-session -A without -d', () => {
    const { file, args } = attachArgv(local, 'work');
    expect(file).toBe('tmux');
    expect(args).toEqual(['new-session', '-A', '-s', 'work']);
    expect(args).not.toContain('-d');
  });
  it('ssh attach goes through ssh -tt', () => {
    const { file, args } = attachArgv(sshAlias, 'work');
    expect(file).toBe('ssh');
    expect(args).toContain('-tt');
    expect(args.slice(-4)).toEqual(['new-session', '-A', '-s', 'work']);
  });
  it('wsl management goes through wsl.exe', () => {
    expect(managementArgv(wsl, ['list-sessions'])).toEqual({
      file: 'wsl.exe',
      args: ['-d', 'Ubuntu', '--exec', 'tmux', 'list-sessions'],
    });
  });
  it('wsl attach goes through wsl.exe with env TERM', () => {
    const { file, args } = attachArgv(wsl, 'work');
    expect(file).toBe('wsl.exe');
    expect(args.slice(0, 5)).toEqual(['-d', 'Ubuntu', '--exec', 'env', 'TERM=xterm-256color']);
    expect(args.slice(-4)).toEqual(['new-session', '-A', '-s', 'work']);
  });
});

describe('newSessionArgv (always starts in HOME)', () => {
  const sub = ['new-session', '-d', '-s', 'work'];
  it('local appends tmux -c <homedir>', () => {
    expect(newSessionArgv(local, sub)).toEqual({
      file: 'tmux',
      args: ['new-session', '-d', '-s', 'work', '-c', homedir()],
    });
  });
  it('wsl uses wsl --cd ~ (distro home), no tmux -c', () => {
    expect(newSessionArgv(wsl, sub)).toEqual({
      file: 'wsl.exe',
      args: ['-d', 'Ubuntu', '--cd', '~', '--exec', 'tmux', 'new-session', '-d', '-s', 'work'],
    });
  });
  it('ssh relies on the remote $HOME default (no --cd / -c)', () => {
    const { file, args } = newSessionArgv(sshAlias, sub);
    expect(file).toBe('ssh');
    expect(args).not.toContain('--cd');
    expect(args).not.toContain('-c');
    expect(args.slice(-4)).toEqual([`'new-session'`, `'-d'`, `'-s'`, `'work'`]);
  });
});
