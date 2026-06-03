#!/usr/bin/env bash
# One-click launcher for macOS / Linux. Builds if needed, starts the server,
# and opens the browser. (macOS users: the double-clickable copy is start.command.)
set -e
cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  echo "[tmuxes] Node.js / npm not found. Install Node 18+ (e.g. 'brew install node') and retry."
  exit 1
fi
if ! command -v tmux >/dev/null 2>&1; then
  echo "[tmuxes] tmux not found. Install it (macOS: 'brew install tmux', Debian/Ubuntu: 'sudo apt install tmux')."
  exit 1
fi

[ -d node_modules ] || { echo "[tmuxes] Installing dependencies..."; npm install; }
echo "[tmuxes] Building..."
npm run build
echo "[tmuxes] Starting on http://127.0.0.1:7420 (a browser window will open)..."
TMUXES_OPEN=1 npm start
