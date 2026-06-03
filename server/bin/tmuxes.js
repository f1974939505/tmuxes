#!/usr/bin/env node
// tmuxes — web UI to manage tmux sessions (local / SSH / WSL).
// Parses a couple of flags, sets the env the server reads, then launches it.

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`tmuxes — one browser tab to run and supervise tmux sessions (local · SSH · WSL)

Usage:
  tmuxes [options]

Options:
  --port <n>     Port to listen on   (default 7420, env TMUXES_PORT)
  --no-open      Do not open the browser
  -h, --help     Show this help

Binds to 127.0.0.1 only (no-auth local UI). Then open http://127.0.0.1:7420
(opens automatically unless --no-open). Requires tmux on the host you connect to.`);
  process.exit(0);
}

function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const port = flag('--port');
if (port) process.env.TMUXES_PORT = port;

// Open the browser by default (the "one-click run" experience), unless the
// user opted out or already set TMUXES_OPEN.
if (!args.includes('--no-open') && process.env.TMUXES_OPEN === undefined) {
  process.env.TMUXES_OPEN = '1';
}

await import('../dist/index.js');
