import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { log } from './logger.js';
import { apiRouter } from './rest/router.js';
import { attachWebSocket } from './ws/wsServer.js';
import { disposeAll } from './ws/terminalSession.js';
import { refreshTargets } from './targets.js';
import { openBrowser } from './openBrowser.js';

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api', apiRouter);

// In production, serve the built client (server/dist → ../../client/dist).
const clientDist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback for non-API GET routes (avoids path-to-regexp '*' quirks in Express 5).
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(join(clientDist, 'index.html'));
  });
  log.info(`serving client from ${clientDist}`);
}

const server = createServer(app);
attachWebSocket(server);

server.listen(config.port, config.host, () => {
  const url = `http://${config.host}:${config.port}`;
  log.info(`tmuxes listening on ${url}`);
  // Warm the target cache (discovers WSL distros on Windows) ahead of any WS.
  void refreshTargets().catch((e) => log.warn(`initial target discovery failed: ${e}`));
  // One-click launchers set TMUXES_OPEN=1 to pop the browser open.
  if (process.env.TMUXES_OPEN) openBrowser(url);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`received ${signal}, shutting down`);
  disposeAll();
  server.close(() => process.exit(0));
  // Don't wait forever for lingering sockets.
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
