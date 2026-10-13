import { afterEach, expect, it, vi } from 'vitest';
import { createTmuxSocket } from '../src/hooks/useTmuxSocket';
afterEach(() => vi.unstubAllGlobals());
it('retains the newest connecting geometry until the server is ready to accept controls', () => {
  const sent: string[] = [], controls: string[] = [];
  let instance: Socket;
  class Socket {
    static OPEN = 1; readyState = 0;
    onopen?: () => void; onmessage?: (event: { data: string }) => void;
    constructor() { instance = this; }
    send(data: string) { controls.push('send'); sent.push(data); }
    close() {}
  }
  vi.stubGlobal('WebSocket', Socket);
  const socket = createTmuxSocket('ws://localhost/test', {
    onOutput() {}, onControl: msg => controls.push(msg.type), onOpen() {}, onClose() {},
  });
  socket.resize(100, 30); socket.resize(110, 35);
  instance!.readyState = Socket.OPEN; instance!.onopen!();
  socket.resize(120, 40); expect(sent).toEqual([]);
  instance!.onmessage!({ data: JSON.stringify({ type: 'restore', cols: 80, rows: 24, data: '' }) });
  expect(sent).toEqual([]);
  instance!.onmessage!({ data: JSON.stringify({ type: 'ready', target: 'local', session: 'test' }) });
  expect(sent).toEqual([JSON.stringify({ type: 'resize', cols: 120, rows: 40 })]);
  expect(controls).toEqual(['restore', 'ready', 'send']);
  socket.close(); socket.resize(90, 25); expect(sent).toHaveLength(1);
});
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
