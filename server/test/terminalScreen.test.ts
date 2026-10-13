import { afterEach, expect, it } from 'vitest';
import headless from '@xterm/headless';
import unicode11 from '@xterm/addon-unicode11';
import { TerminalScreen, type ScreenSnapshot } from '../src/terminalScreen.js';
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(fn => fn()));
function screen() { const s = new TerminalScreen(80, 24); cleanup.push(() => s.dispose()); return s; }
function write(s: TerminalScreen, text: string) { return new Promise<void>(r => { expect(s.write(text, r)).toBe(true); }); }
function snapshot(s: TerminalScreen) { return new Promise<ScreenSnapshot | null>(r => s.snapshot(r)); }
async function restore(s: ScreenSnapshot) {
  const t = new headless.Terminal({ cols: s.cols, rows: s.rows, allowProposedApi: true });
  t.loadAddon(new unicode11.Unicode11Addon()); t.unicode.activeVersion = '11';
  cleanup.push(() => t.dispose());
  await new Promise<void>(r => t.write(s.data, r));
  return t;
}
it('restores Chinese, modern emoji and combining accents with matching cursor cells', async () => {
  const s = screen(); await write(s, 'abc中🧪e\u0301!');
  const t = await restore((await snapshot(s))!);
  const line = t.buffer.active.getLine(0)!;
  expect(line.getCell(3)?.getWidth()).toBe(2);
  expect(line.getCell(5)?.getChars()).toBe('🧪'); expect(line.getCell(5)?.getWidth()).toBe(2);
  expect(line.getCell(7)?.getChars()).toBe('e\u0301'); expect(line.getCell(8)?.getChars()).toBe('!');
  expect(t.buffer.active.cursorX).toBe(9);
});
it('preserves fullscreen, SGR mouse and scroll margins after over 1 MiB of updates', async () => {
  const s = screen();
  await write(s, '\x1b[?1049h\x1b[?1000h\x1b[?1006h\x1b[?2004h\x1b[?25l');
  await write(s, '\x1b[Hstatus update'.repeat(75000));
  await write(s, '\x1b[2J\x1b[2;23r\x1b[5;10H中文 done');
  const state = (await snapshot(s))!;
  const t = await restore(state);
  expect(t.buffer.active.type).toBe('alternate');
  expect(t.modes.mouseTrackingMode).toBe('vt200');
  expect(t.modes.bracketedPasteMode).toBe(true);
  expect(t.buffer.active.getLine(4)?.translateToString(true)).toBe('         中文 done');
  expect(t.buffer.active.cursorY).toBe(4);
  expect(state.data).toContain('\x1b[?1006h');
  expect(state.data).toContain('\x1b[2;23r');
  expect(state.data).toContain('\x1b[?25l');
  expect(state.data).not.toContain('status update');
});
it('waits for split escape sequences before snapshot and restores live cursor updates', async () => {
  const s = screen();
  await write(s, 'hello\x1b[');
  let resolved = false;
  const pending = snapshot(s).then(x => { resolved = true; return x; });
  await new Promise(r => setTimeout(r, 20));
  expect(resolved).toBe(false);
  await write(s, '2;3Hnext');
  const t = await restore((await pending)!);
  await new Promise<void>(r => t.write('!', r));
  expect(t.buffer.active.getLine(1)?.translateToString(true)).toBe('  next!');
});
it('serializes after queued output and geometry changes, without replaying device queries', async () => {
  const s = screen();
  s.write('before\x1b[6n', () => {});
  s.resize(100, 30, () => {});
  const state = (await snapshot(s))!;
  expect([state.cols, state.rows]).toEqual([100, 30]);
  expect(state.data).toContain('before');
  expect(state.data).not.toContain('\x1b[6n');
});
