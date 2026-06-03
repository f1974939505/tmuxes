import type { ServerControl } from '../types';

export interface TmuxSocket {
  /** Send raw keystrokes (as a binary frame, per the server protocol). */
  sendInput(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

export interface TmuxSocketCallbacks {
  onOutput: (bytes: Uint8Array) => void;
  onControl: (msg: ServerControl) => void;
  onOpen: () => void;
  onClose: (ev: CloseEvent) => void;
}

const encoder = new TextEncoder();

/** Open a WebSocket to the interactive-attach endpoint and wire the frame
 *  convention: binary frames = terminal bytes, text frames = JSON control. */
export function createTmuxSocket(url: string, cb: TmuxSocketCallbacks): TmuxSocket {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => cb.onOpen();
  ws.onclose = (ev) => cb.onClose(ev);
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      try {
        cb.onControl(JSON.parse(ev.data) as ServerControl);
      } catch {
        /* ignore malformed control frame */
      }
    } else {
      cb.onOutput(new Uint8Array(ev.data as ArrayBuffer));
    }
  };

  const sendJson = (obj: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  return {
    sendInput(data) {
      // Binary frame so the server routes it straight to the PTY.
      if (ws.readyState === WebSocket.OPEN) ws.send(encoder.encode(data));
    },
    resize(cols, rows) {
      sendJson({ type: 'resize', cols, rows });
    },
    close() {
      // Drop handlers so a deliberate close doesn't surface as "disconnected".
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'client navigated');
        }
      } catch {
        /* ignore */
      }
    },
  };
}
