@echo off
REM One-click launcher for Windows. Double-click in Explorer, or run in
REM Windows Terminal. Builds if needed, starts the server, opens the browser.
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [tmuxes] Node.js / npm not found. Install Node 18+ from https://nodejs.org and retry.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [tmuxes] Installing dependencies...
  call npm install
  if errorlevel 1 ( echo [tmuxes] npm install failed. & pause & exit /b 1 )
)

echo [tmuxes] Building...
call npm run build
if errorlevel 1 ( echo [tmuxes] build failed. & pause & exit /b 1 )

echo [tmuxes] Starting on http://127.0.0.1:7420 (a browser window will open)...
REM Run node DIRECTLY (not via npm) so the server is the console's own child:
REM closing this window (or Ctrl+C) reaches it, it shuts down, and the port is
REM released. Going through `npm start` can orphan the node process, leaving
REM 7420 held until the next reboot.
set TMUXES_OPEN=1
node "%~dp0server\dist\index.js"
