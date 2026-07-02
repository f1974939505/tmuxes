import express from 'express';
import readline from 'node:readline';
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
import { winShell } from './winshell/manager.js';
import { openBrowser } from './openBrowser.js';

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api', apiRouter);

// Serve the built client. Published npm package bundles it at <pkg>/public;
// in the dev monorepo it lives at server/../../client/dist.
const here = dirname(fileURLToPath(import.meta.url));
const clientDist = [join(here, '..', '..', 'client', 'dist'), join(here, '..', 'public')].find(existsSync);
if (clientDist) {
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
  // Restore the console we put into raw mode (Windows Ctrl+C handling).
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  } catch {
    /* ignore */
  }
  disposeAll();
  winShell.disposeAll();
  server.close(() => process.exit(0));
  // Don't wait forever for lingering sockets.
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// Console window closed (Windows) / terminal hangup (POSIX) → free the port.
process.on('SIGHUP', () => shutdown('SIGHUP'));
// Windows Ctrl+Break.
if (process.platform === 'win32') process.on('SIGBREAK', () => shutdown('SIGBREAK'));

// On Windows, node-pty's ConPTY backend breaks the normal CTRL_C_EVENT → SIGINT
// path for the host process (see microsoft/node-pty#190), so `process.on('SIGINT')`
// can't be relied on. Instead we read the raw Ctrl+C byte (0x03) straight from the
// console, set up at startup (before any pty is spawned). This bypasses the signal
// machinery entirely. Ctrl+Break still works via the SIGBREAK handler above.
if (process.platform === 'win32') {
  const stdin = process.stdin;
  if (stdin.isTTY) {
    try {
      stdin.setRawMode(true); // deliver keys as bytes; Ctrl+C arrives as 0x03
      stdin.resume();
      stdin.on('data', (buf: Buffer) => {
        if (buf.includes(0x03)) shutdown('Ctrl+C');
      });
    } catch {
      // Fall back to the readline SIGINT bridge (needs explicit terminal mode).
      readline
        .createInterface({ input: stdin, terminal: true })
        .on('SIGINT', () => shutdown('SIGINT'));
    }
  } else {
    // stdin isn't a console TTY (e.g. piped) — best-effort bridge.
    try {
      readline
        .createInterface({ input: stdin, terminal: true })
        .on('SIGINT', () => shutdown('SIGINT'));
    } catch {
      /* nothing more we can do */
    }
  }
}

// If the port is already held (e.g. a previous run is still alive), exit with a
// clear message instead of an unhandled-error stack trace.
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    log.error(
      `port ${config.port} is already in use — another tmuxes instance is still running. ` +
        `Close it (or its window), then start again.`,
    );
  } else {
    log.error(`server error: ${err.message}`);
  }
  process.exit(1);
});
