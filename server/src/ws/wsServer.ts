import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { config } from '../config.js';
import { getTarget, isValidTargetId } from '../targets.js';
import { isValidSessionName, isValidDimension } from '../validate.js';
import { TerminalSession, track } from './terminalSession.js';
import { log } from '../logger.js';

function reject(socket: Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
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
      const ts = new TerminalSession(ws, target, session, cols, rows);
      track(ts);
    });
  });
}
