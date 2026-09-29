import { afterEach, expect, it, vi } from 'vitest';
import { createTmuxSocket } from '../src/hooks/useTmuxSocket';
afterEach(() => vi.unstubAllGlobals());
it('preserves non-UTF8 mouse bytes separately from UTF8 keyboard text', () => {
  const sent: Uint8Array[] = [];
  class Socket {
    static OPEN = 1;
    readyState = 1;
    send(data: Uint8Array) { sent.push(data); }
  }
  vi.stubGlobal('WebSocket', Socket);
  const socket = createTmuxSocket('ws://localhost/test', {
    onOutput() {}, onControl() {}, onOpen() {}, onClose() {},
  });
  socket.sendInput('中文');
  socket.sendBinaryInput(String.fromCharCode(27, 91, 77, 96, 200, 240));
  expect(sent[0]).toEqual(new TextEncoder().encode('中文'));
  expect([...sent[1]]).toEqual([27, 91, 77, 96, 200, 240]);
});
