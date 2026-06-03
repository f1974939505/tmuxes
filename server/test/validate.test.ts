import { describe, it, expect } from 'vitest';
import {
  isValidSessionName,
  isValidHost,
  isValidUser,
  isValidPort,
  isValidDimension,
  parseHostSpec,
} from '../src/validate.js';

describe('isValidSessionName', () => {
  it('accepts plain names', () => {
    expect(isValidSessionName('work')).toBe(true);
    expect(isValidSessionName('my-session_2')).toBe(true);
    expect(isValidSessionName('a'.repeat(64))).toBe(true);
  });
  it('rejects tmux delimiters and metachars', () => {
    expect(isValidSessionName('has.dot')).toBe(false); // '.' is a target delimiter
    expect(isValidSessionName('has:colon')).toBe(false); // ':' is a target delimiter
    expect(isValidSessionName('with space')).toBe(false);
    expect(isValidSessionName('rm -rf /')).toBe(false);
    expect(isValidSessionName('$(whoami)')).toBe(false);
    expect(isValidSessionName('')).toBe(false);
    expect(isValidSessionName('a'.repeat(65))).toBe(false);
    expect(isValidSessionName(42 as unknown)).toBe(false);
  });
});

describe('host / user / port', () => {
  it('validates hosts', () => {
    expect(isValidHost('example.com')).toBe(true);
    expect(isValidHost('10.0.0.1')).toBe(true);
    expect(isValidHost('bad host')).toBe(false);
    expect(isValidHost('a;b')).toBe(false);
  });
  it('validates users', () => {
    expect(isValidUser('alice')).toBe(true);
    expect(isValidUser('al ice')).toBe(false);
  });
  it('validates ports', () => {
    expect(isValidPort(22)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(70000)).toBe(false);
    expect(isValidPort(22.5)).toBe(false);
  });
  it('validates dimensions', () => {
    expect(isValidDimension(80)).toBe(true);
    expect(isValidDimension(1000)).toBe(true);
    expect(isValidDimension(0)).toBe(false);
    expect(isValidDimension(1001)).toBe(false);
  });
});

describe('parseHostSpec', () => {
  it('parses user@host:port', () => {
    expect(parseHostSpec('alice@web1:2222')).toEqual({ user: 'alice', host: 'web1', port: 2222 });
  });
  it('parses host only', () => {
    expect(parseHostSpec('db2')).toEqual({ user: undefined, host: 'db2', port: undefined });
  });
  it('parses user@host', () => {
    expect(parseHostSpec('bob@db2')).toEqual({ user: 'bob', host: 'db2', port: undefined });
  });
  it('rejects garbage', () => {
    expect(parseHostSpec('')).toBeNull();
    expect(parseHostSpec('a b@c')).toBeNull();
    expect(parseHostSpec('host:notaport')).toBeNull();
    expect(parseHostSpec('host:99999')).toBeNull();
  });
});
