import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { config } from '../config.js';
import { getTarget, isValidTargetId, type Target } from '../targets.js';
import { isValidSessionName, isValidDimension } from '../validate.js';
import { TerminalSession, track } from './terminalSession.js';
import { winShell, type ShellClient } from '../winshell/manager.js';
import type { ClientControl } from './protocol.js';
import { log } from '../logger.js';

const HEARTBEAT_MS = 30_000;

function reject(socket: Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function rawToString(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[]).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return String(data);
}

let nextClientId = 1;

/** Attach a WS to a native shell session (one persistent pty, many clients). */
function attachWinShell(ws: WebSocket, target: Target, session: string, cols: number, rows: number): void {
  const client: ShellClient = {
    id: nextClientId++,
    sendBinary: (buf) => {
      if (ws.readyState === ws.OPEN) ws.send(buf, { binary: true });
    },
    sendControl: (msg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg), { binary: false });
    },
    isOpen: () => ws.readyState === ws.OPEN,
    close: (code, reason) => {
      try {
        ws.close(code, reason);
      } catch {
        /* ignore */
      }
    },
  };

  let shellSession;
  try {
    shellSession = winShell.attachOrCreate(session, cols, rows, client);
  } catch (e) {
    client.sendControl({ type: 'error', message: e instanceof Error ? e.message : 'failed to start shell' });
    client.close(1011, 'shell error');
    return;
  }
  client.sendControl({ type: 'ready', target: target.id, session });

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      shellSession.write(rawToString(data));
      return;
    }
    let msg: ClientControl;
    try {
      msg = JSON.parse(rawToString(data)) as ClientControl;
    } catch {
      return;
    }
    if (msg.type === 'resize' && isValidDimension(msg.cols) && isValidDimension(msg.rows)) {
      shellSession.resize(msg.cols, msg.rows);
    } else if (msg.type === 'ping') {
      client.sendControl({ type: 'pong' });
    }
  });

  let alive = true;
  ws.on('pong', () => {
    alive = true;
  });
  const hb = setInterval(() => {
    if (!alive) {
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
      return;
    }
    alive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }, HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(hb);
    shellSession.detach(client); // pty stays alive — persistence across reconnects
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
}

/** Attach the single /ws interactive-attach endpoint to the HTTP server. */
export function attachWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    } catch {
      reject(socket, 400, 'Bad Request');
      return;
    }

    if (url.pathname !== '/ws') {
      reject(socket, 404, 'Not Found');
      return;
    }

    // The WS upgrade bypasses Express middleware — enforce Origin here.
    if (!config.isAllowedOrigin(req.headers.origin)) {
      log.warn(`rejected WS upgrade from disallowed origin: ${req.headers.origin}`);
      reject(socket, 403, 'Forbidden');
      return;
    }

    const targetId = url.searchParams.get('target') ?? '';
    const session = url.searchParams.get('session') ?? '';
    if (!isValidTargetId(targetId)) return reject(socket, 400, 'Bad Request');
    const target = getTarget(targetId);
    if (!target) return reject(socket, 404, 'Not Found');
    if (!isValidSessionName(session)) return reject(socket, 400, 'Bad Request');

    const colsRaw = Number(url.searchParams.get('cols'));
    const rowsRaw = Number(url.searchParams.get('rows'));
    const cols = isValidDimension(colsRaw) ? colsRaw : 80;
    const rows = isValidDimension(rowsRaw) ? rowsRaw : 24;

    wss.handleUpgrade(req, socket, head, (ws) => {
      log.info(`attach ${target.id}/${session} (${cols}x${rows})`);
      if (target.kind === 'winlocal') {
        attachWinShell(ws, target, session, cols, rows);
        return;
      }
      const ts = new TerminalSession(ws, target, session, cols, rows);
      track(ts);
    });
  });
}
