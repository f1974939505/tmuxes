import { afterEach, describe, expect, it } from 'vitest';
import { augmentAgentCommand, detectAgentKind, runtimeBundle } from '../src/agentHooks.js';

afterEach(() => { delete process.env.TMUXES_NO_AUTOHOOK; });
const runtime = { python: '/usr/bin/python3', path: "/home/user's files/agent/main.py" };

describe('agent launch', () => {
  it.each(['claude', 'codex', 'opencode', 'hermes'])('recognizes %s and preserves user arguments', (kind) => {
    expect(detectAgentKind(kind)).toBe(kind);
    const out = augmentAgentCommand(`${kind} --model test "do x"`, runtime);
    expect(out.kind).toBe(kind);
    expect(out.command).toContain("'/home/user'\\''s files/agent/main.py'");
    expect(out.command.endsWith(`${kind} ${kind} --model test "do x"`)).toBe(true);
    expect(out.command).not.toContain('-c ');
    expect(out.command).not.toContain('--no-daemon');
    expect(out.command).not.toContain('bypass');
  });
  it('leaves unrelated commands and opt-out launches unchanged', () => {
    expect(detectAgentKind('cc')).toBeUndefined();
    expect(augmentAgentCommand('bash', runtime)).toEqual({ command: 'bash' });
    process.env.TMUXES_NO_AUTOHOOK = '1';
    expect(augmentAgentCommand('codex', runtime)).toEqual({ command: 'codex' });
  });
  it('ships the complete stdlib-only runtime with stable content addressing', () => {
    const bundle = runtimeBundle();
    expect(bundle.hash).toMatch(/^[0-9a-f]{20}$/);
    expect(runtimeBundle()).toEqual(bundle);
    for (const name of ['main.py', 'state.py', 'claude.py', 'codex.py', 'hook.py', 'websocket.py', 'opencode.mjs', 'hermes_plugin.py']) {
      expect(bundle.files[name]).toBeTruthy();
    }
  });
});
