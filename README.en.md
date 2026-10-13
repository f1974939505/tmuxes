<div align="center">

# 🖥️ tmuxes

[简体中文](./README.md) ｜ **English**

### One browser tab to run, watch, and wrangle a whole swarm of CLI coding agents.

**Claude Code · Codex · OpenCode · Hermes** — each in its own tmux session,
live across **Local · SSH · WSL**, with Files / Git panels, image and PDF previews, and an Agent reading view with Markdown formulas.

🔔 **Get notified when an agent finishes, fails, or needs a human decision** — structured events from Claude Code, Codex, OpenCode, and Hermes. Background tasks, subagents, monitors, and scheduled wakeups do not directly count as completion. Incomplete evidence is shown as “unknown”.

<p>
<a href="https://www.npmjs.com/package/tmuxes"><img alt="npm version" src="https://img.shields.io/npm/v/tmuxes?style=flat-square&logo=npm&color=CB3837"></a>
<img alt="platform" src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows%2011-2b2b2b?style=flat-square">
<img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white">
<img alt="Node.js" src="https://img.shields.io/badge/Node.js-22%20%7C%2024-339933?style=flat-square&logo=nodedotjs&logoColor=white">
<img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white">
<img alt="tmux" src="https://img.shields.io/badge/tmux-3.x-1BB91F?style=flat-square&logo=tmux&logoColor=white">
<img alt="xterm.js" src="https://img.shields.io/badge/xterm.js-6-1f6feb?style=flat-square">
</p>

<sub>🔒 localhost-only · ⚡ one-click launch · 🔔 optional native hooks / plugins · 📖 Markdown &amp; math · 🪟 reaches into WSL on Windows</sub>

</div>

---

> **Why?** Modern coding agents are long-running terminal processes. Run a few at once and you're juggling
> panes, SSH windows, and "wait, which box was that on?". **tmuxes** puts all of them behind one clean web UI:
> spin up a session, drop it in a folder, watch it work, peek at the files it's editing — local or remote, same view.

## ✨ Highlights

| | |
|---|---|
| 🧠 **Built for agents** | Run Claude Code, Codex, OpenCode and Hermes in separate tmux sessions with full terminal interaction. The Codex button enters `codex --no-daemon` directly. |
| 🔔 **Done / error / decision alerts** | Native structured events distinguish running, background work, human decisions, completion, failure and unknown. Expanded targets sync every 5 seconds; background shells, subagents and monitors do not imply completion. |
| 🌐 **Local · SSH · WSL · native Windows** | One sidebar manages local tmux, SSH, WSL and PowerShell / cmd sessions. SSH management reads reuse only manually established persistent connections. |
| 🗂️ **Folders & alert navigation** | Drag sessions into folders saved per target. Arrows locate offscreen alerts; collapsed groups summarize reminders. Files / Git use half the sidebar by default. |
| 📂 **Preview, edit & download** | Browse working directories, preview PNG / JPG / GIF / WebP and PDF, and render Markdown math. Edit, save and undo text; download original files in any format. PDFs support inverted colors. |
| 📖 **Agent reading & path links** | Read recent prompts and complete Codex 0.160 / Claude Code replies with tables and math. Click file paths in the terminal, reading view or rendered selection to open them. |
| 🪟 **Persistent file tabs** | Keep files, edits and file reading positions across sessions, windows and targets. Dock at the bottom or right, or maximize while the terminal remains mounted. |
| 🔀 **Git panel** | Inspect status, changes, history and incoming commits; show side-by-side diffs or full patches in the shared preview area. Supports branches, fetch, pull, push, sync and commit-all using target authentication. |
| 🔁 **Multi-client sync** | View and type in the same tmux session from multiple tabs, reusing retained server-side terminal connections. |
| ⚙️ **Layout & font controls** | Adjust sidebar, terminal and preview fonts separately, save dock position and dimensions, and drag dividers to resize. |
| 📋 **Easy copying** | Select text opens a directly selectable output snapshot. Includes Copy, `Ctrl+C` / `Ctrl+Shift+C` and optional copy-on-selection. |
| 🚀 **One-click launch** | Double-click `start.cmd` / `start.command`, or run `start.sh`, to build, start and open the browser. |

## 🖼️ What it looks like

<div align="center">
<img src="https://raw.githubusercontent.com/f1974939505/tmuxes/main/fig/fig1.png" alt="0.1.26 UI: agent sessions, downloads, persistent tabs and rendered Markdown math" width="1000">
</div>

The actual 0.1.26 UI, using fictional targets, sessions, paths and output. No real hosts, accounts or project data appear. The demo UI uses Chinese.

<details>
<summary>Agent reading and PDF with inverted colors</summary>

<p>Click PDF, image and Markdown paths in replies to open files.</p>
<img src="https://raw.githubusercontent.com/f1974939505/tmuxes/main/fig/agent-reading.png" alt="Agent reading: clickable file paths, tables and math" width="1000">
<p>PDFs support continuous scrolling, zoom, text selection and inverted colors; open files survive session switches.</p>
<img src="https://raw.githubusercontent.com/f1974939505/tmuxes/main/fig/pdf-preview.png" alt="PDF with inverted colors and persistent file tabs" width="1000">

</details>

## 🏗️ Architecture

```text
                          REST  (sessions · files / Range · messages · git)
  ┌────────────┐   ┌──────────────────────┐        ┌──────────────────────────────────┐
  │  Browser   │──▶│  Node · Express · ws │──pty──▶│ tmux                  (Linux/macOS)│
  │  xterm.js  │◀──│        node-pty      │──pty──▶│ ssh -tt user@host → tmux   (remote)│
  └────────────┘   └──────────────────────┘──pty──▶│ wsl.exe -d <distro> → tmux (Windows)│
        ▲   binary bytes ⇄ WebSocket ⇄ JSON control └──────────────────────────────────┘
```

- **`client/`** — React + Vite + TypeScript, terminal via [`@xterm/xterm`](https://www.npmjs.com/package/@xterm/xterm).
- **`server/`** — Node + Express + `ws` + `node-pty`. REST provides session management, file / Range transfers, paged messages and Git. WebSocket streams interactive *attach* using retained server-side terminal state. SSH management reads use only a manually established persistent connection; failures pause access until manual reconnect.

> **No native tmux on Windows?** No problem. The server runs natively (node-pty uses ConPTY) and reaches tmux **inside your WSL distros** via `wsl.exe`. On Linux/macOS it talks to local tmux directly. Remote hosts use the **system `ssh` binary**, reusing your existing `~/.ssh` keys / `ssh-agent` — **no passwords are ever stored.**

## 📦 Install from npm

Use `@latest` so you get the newest fixes. `tmuxes` is a single-user local tool and only listens on `127.0.0.1`.

```bash
# Verify the npm package entrypoint:
npx --yes tmuxes@latest --help

# One-shot (no clone, opens the browser by default):
npx --yes tmuxes@latest

# Or install globally and use the `tmuxes` command:
npm install -g tmuxes
tmuxes                       # → http://127.0.0.1:7420

# Flags:
tmuxes --port 8080 --no-open
```

If `npx` fails on Windows, check:

- `node -v` is **22.x (22.12.0 or later) or 24.x**, and `npm -v` is **10+**.
- You are using the official npm registry and do not have a stale/broken npm cache; run `npm cache verify` before retrying if needed.
- **tmux** is installed on the machine/host you connect to. On Linux, `node-pty` compiles from source, so install `build-essential` + `python3` first; Windows / macOS use prebuilt binaries.

## 🚀 One-click from source (for development)

<table>
<tr><th>OS</th><th>Do this</th></tr>
<tr><td><b>🪟 Windows 11</b></td><td>Double-click <b><code>start.cmd</code></b> (or run it in Windows Terminal). Installs deps, builds, starts the server, and opens <code>http://127.0.0.1:7420</code>. Your WSL distros appear in the sidebar.</td></tr>
<tr><td><b>🍎 macOS</b></td><td>Double-click <b><code>start.command</code></b> in Finder <sub>(first time: right-click → Open to bypass Gatekeeper)</sub>.</td></tr>
<tr><td><b>🐧 Linux</b></td><td>Run <b><code>./start.sh</code></b>.</td></tr>
</table>

## 🔧 Manual run

```bash
npm install            # node-pty: prebuilt on Win/macOS, compiles from source on Linux

# Development — Vite dev server + API with hot reload:
npm run dev            # → http://localhost:5173

# Production — build the client, serve everything from one process:
npm run build
npm start              # → http://localhost:7420   (set TMUXES_OPEN=1 to auto-open the browser)
```

## 🔔 Agent status and notifications

On page load or refresh, all sidebar target groups start collapsed, including Windows Local, WSL Ubuntu, local tmux, and SSH targets. Click a group header to expand it.

Open **Agent status integration**, select an agent and click **Install / update** once. The target needs **Python 3.9+ (`python3`)**, tmux and the installed agent. Installation preserves configuration and backs up modified hooks. Trust hooks, enable plugins and restart as required, then type `claude`, `codex --no-daemon`, `opencode` or `hermes` directly. Toolbar buttons enter those same commands without injected `--remote`, `-c` or wrappers. Updating a trusted Codex 0.160 integration does not require restarting merely to recover startup evidence; see below.

- **Running / background**: the root is working, or associated shells, monitors, subagents, goals, or scheduled wakeups remain.
- **Decision**: structured evidence indicates user input is needed; briefly resolved requests stay quiet.
- **Done**: the current root turn ended normally, known associated work settled, and a short confirmation period passed. Silence, process exit, and final text are insufficient.
- **Error**: a terminal root-task failure. Ordinary tool errors, warnings, and automatic retries do not directly alert.
- **Unknown**: missing interfaces, disconnection, uncertain pane ownership, or incomplete background evidence. Completion is never guessed.


Installation reads the target interactive shell PATH and exported configuration directories, supporting shell-initialized tool paths without modifying PATH. Blocking shell startup files cause a bounded installation failure.

| Agent | Integration and limits |
| --- | --- |
| Codex | Merges `CODEX_HOME/hooks.json` (default `~/.codex/hooks.json`); review and trust in `/hooks`. Foreground launch uses `--no-daemon`; hooks write metadata one way and bind by launch identity. Missing background-completion evidence stays unknown; the observer never answers approvals. Real CLI contract verified with 0.160.0. |
| Claude Code | Merges `CLAUDE_CONFIG_DIR/settings.json` (default `~/.claude/settings.json`). Reads lifecycle, questions, failures, and background fields. Missing background evidence or continued Stop hooks prevent completion. Another Stop hook's first continuation decision may be invisible; the confirmation period only mitigates this race. |
| OpenCode | Installs a global v1 plugin, respecting `XDG_CONFIG_HOME`. Only v1 is currently supported. The v2 plugin API changed; installation refuses v2 without modifying its configuration. v2 status collection is not implemented. |
| Hermes | Installs under `HERMES_HOME/plugins/tmuxes-native-observer` (default `~/.hermes`). Run `hermes plugins enable tmuxes-native-observer`, then restart. Missing lifecycle fields or background counters degrade to unknown. Install separately in each named profile's environment. |

The panel shows only observations linked to current panes. Unbound, ended, and superseded historical observations are removed from the tmuxes state cache on reads; agent session history and running processes are untouched. Each row shows its last event and report time. Non-Codex records are isolated by process identity; manual binding by process-name guessing is disabled.

The toolbar Codex button types `codex --no-daemon` directly into the current pane for the interactive shell to execute. Launching requires no Python, observer installation, or extra backend; tmux keeps the TUI alive. The sidebar integration panel only manages optional status collection and no longer offers a launch button. Existing daemons are not automatically stopped.

For foreground Codex 0.160, native hooks identify the current process and turn. The collector then incrementally verifies commands, nested subagents, and code execution cells in local session records, and reads goal status without modifying it. A green light requires the current turn and all observed work to finish, confirmed across two refreshes; `Stop` alone never reports success. Complete structured records can recover missing startup, tool-result, or `Stop` callbacks. A new prompt, user interruption, running shell / monitor / subagent, or active or paused goal never counts as completion.

After updating, select Codex in the target's **Agent status integration** and click **Install / update**; first installation still requires trust in `/hooks`. An already-trusted 0.160 integration can reconstruct a running session's status without restarting Codex to recover its startup event. The panel shows a hint during this initial incremental check. Updating local tmuxes alone does not update the target collector. Older sessions retain the existing hook verification path and may need a restart after work finishes if lifecycle records are incomplete.

Failed commands or image reads may emit `PreToolUse` without `PostToolUse`; a completed subagent wait also does not create new background work. The 0.160 collector uses actual execution records to remove these stale entries. A narrowly recognized single read-only `write_stdin` wait no longer stays background work forever after its exact command has exited, even if Codex never collects the result again. Code cells containing loops, later actions, or other tools still require their own completion evidence.

Each 0.160 observation shares an approximately 8 MiB read budget and a time limit across its root and subagents. Saved cursors allow subsequent reads to process only new records. Large images are skipped incrementally; the status cache retains identity and execution metadata, never conversation or tool output. Background work is also checked read-only. Collection does not contact a Codex daemon or add a persistent poller; SSH targets always reuse the existing management connection without new logins. Unverifiable ownership, formats, or incomplete records remain unknown. Hook input remains bounded at 8 MiB.

Codex `waitingOnApproval` cannot identify human versus automatic review, so it currently shows unknown without a human-decision alert. Structured user questions can still alert. The 0.160 goal database also covers manual goal status changes; older versions still depend on supported hooks. Session records are version-sensitive: unfamiliar work types or unreadable records are never guessed to be complete. A green light verifies observed Codex work, not arbitrary detached external background processes.

The collector stores bounded status metadata, never prompts or tool output. Installed files live under `~/.local/share/tmuxes/observer/`; records live under `~/.cache/tmuxes/observations/`. Reads are batched into the existing session refresh using the existing management connection, without additional SSH login probes or independent polling. `TMUXES_NO_AUTOHOOK` does not disable installed native integrations. To disable, remove only hooks pointing to the tmuxes observer, delete the corresponding OpenCode plugin file, or run `hermes plugins disable tmuxes-native-observer`.

You can also type `codex --no-daemon` yourself in the target pane. Optional native hook collection still requires target Python and `/hooks` trust; Python is removed from the launch path. On Linux / WSL, direct launches bind through native hook process ancestry, the --no-daemon argument, process start time, and the terminal foreground process group, without a launcher identity. Update the target integration and trust its hooks; missing events or unverifiable ownership never imply a guessed binding. Unbound observations are hidden and cleaned up; incomplete linked observations stay unknown instead of guessing completion.

The sidebar session area and Files / Git area each use half the available height by default; drag the divider to resize them. Unread completion, decision or error alerts outside the viewport show a small arrow and count at the top or bottom of the session area. Click it to locate the nearest reminder. Collapsed targets and folders summarize their hidden alerts. Position detection runs entirely in the browser and adds no remote reads or SSH requests.

## 📖 File previews and agent reading

PDF, image, Markdown and other previewable file paths in agent output are clickable and open or reuse persistent file tabs. The raw terminal, Agent reading and Render selection support absolute and relative paths; quote paths containing spaces or wrap them in backticks. The terminal also handles agents' own `file://` links: hover to underline, click to open, and use Shift for text selection. Relative terminal paths resolve against the originating session's current directory on click; paths inside Markdown files resolve against the document directory. Switching sessions keeps old output bound to its original source. Recognition performs no file probes or network requests; clicked files use the existing connection and session directory permissions.

Each file row and the preview toolbar provide Download, which saves the original target file, including images, PDFs, Markdown and formats without previews. Save edits first to include them in the download. Downloads reuse the existing management connection and stream blocks of at most 512 KiB to the browser, without preview size limits, whole-file server caches or new SSH logins.

Open files remain in preview tabs when switching tmux sessions, windows or targets, or opening another file. Tabs preserve PDF page/zoom, image zoom/position, rendered Markdown, unsaved edits and undo history. Click a tab to return; its target, session and path stay fixed, with the source shown in the title. Closing the file or refreshing the page releases it; file content is never written to browser persistent storage. The PDF toolbar's Invert colors button switches white pages and black text to black pages and white text, and remembers the color preference.

The file browser opens PNG, JPG/JPEG, GIF, WebP and PDF files. Images support fit, original size, zoom and dragging; PDFs support continuous scrolling, page jumps, zoom and selectable text. Preview limits are 32 MiB for images and 256 MiB for PDFs. Files transfer in bounded blocks; closing a preview never terminates the shared connection. PDF.js, fonts and its worker are bundled locally without a CDN.

Markdown opens in rendered preview mode. Switch to Source to edit, save and undo; Preview renders the current editor content. Tables, code blocks, `$...$` / `$$...$$` math and `\(...\)` / `\[...\]` outside code are supported. Invalid formulas retain their source with an error hint. Raw HTML is disabled; external images load only after a click. Relative image, Markdown and PDF links stay within the current session's working directory.

Click Agent reading above the terminal to automatically view recent user prompts and complete replies from the active pane, with earlier-message pagination. Files and reading have separate tabs. Dock the preview at the bottom or right, resize it, or maximize it. Maximizing preserves the mounted terminal and its geometry; dock position and size are stored in the browser. Reading follows the bottom while preserving your position when scrolling up.

Automatic reading supports **Codex 0.160** and verified Claude Code JSONL message shapes through the target's native integration. After upgrading tmuxes, click Install / Update once for each agent in the target's Agent integration panel, then wait for a new hook event to record its transcript path. Existing trust and other configuration are preserved. Missing bindings and unsupported formats show an explicit hint. As a fallback, select terminal output (including through Select text) and click Render selection. Terminal snapshots may contain wrapping or missing content.

Reading is independent of status-light collection and filters reasoning, system instructions and tool logs. Only an open, visible reading tab fetches incremental updates every 3 seconds; hidden pages and inactive tabs pause. Failures pause updates until a successful manual connection or a reading refresh. Each read has byte and time budgets; large logs are processed in bounded segments, with up to 50 initial messages. Conversation content stays in bounded browser/server memory and is never written to tmuxes state files, logs or browser persistent storage. Remote file and conversation reads reuse the established management connection and cannot initiate SSH, probe connectivity or reconnect automatically.

## 🔀 Git Panel

Switch the sidebar bottom from `Files` to `Git`. The Git panel is scoped to the currently selected tmux session's working directory. It does not run background Git polling; it reads status when you open the panel, switch sessions, refresh, or run a Git action.

- **Working tree changes:** pending files are listed separately. Click a changed file to open a VS Code-like side-by-side red/green diff in the bottom viewer region; untracked files are shown as newly added files.
- **Commit:** type a commit message and click `Commit`; tmuxes runs `git add -A` and then creates the commit. It refuses to commit while conflicts are present.
- **Commit history / remote commits:** the panel shows recent commits on the current branch and incoming commits from the upstream branch. Click any commit to show its full patch in the same bottom viewer.
- **Sync actions:** fetch, `pull --ff-only`, push, sync (`fetch --prune` → `pull --ff-only` → push when needed), and branch checkout are supported. tmuxes does not run force push, reset, discard, clean, or branch deletion.
- **Credentials:** Git authentication comes from the target machine's existing Git / SSH setup; tmuxes stores no credentials. If the target Git config references a missing `credential-manager` helper, fetch / pull / push automatically retry once with credential helpers temporarily disabled, so public / SSH repositories are not blocked by a broken helper.

## 🧩 Targets

- **Local** *(Linux/macOS)* — your machine's tmux. Not shown on Windows.
- **Native Windows shells** *(Windows)* — PowerShell / cmd spawned directly via ConPTY (auto-detects `pwsh` → `powershell` → `cmd` → Git Bash); pick the shell when creating. Sessions live as long as the server process (survive refresh / reconnect / multi-tab; lost on server restart). They have no tmux working directory, so Files / Git are unavailable. Previews, downloads and path links use the existing local tmux, WSL and SSH scope.
- **WSL distros** *(Windows)* — auto-discovered via `wsl.exe -l -q`; one target per distro. tmux must be installed inside the distro.
- **SSH hosts** — discovered from your `~/.ssh/config` `Host` entries (wildcards skipped). Add extras explicitly:

  ```bash
  TMUXES_HOSTS="alice@web1,bob@db2:2222" npm run dev      # Linux / macOS
  set TMUXES_HOSTS=alice@web1,bob@db2:2222 && npm run dev # Windows cmd
  ```

  **Cluster iron rule: no repeated SSH logins.** Expanding targets, page refreshes and polling cannot open SSH connections; click Connect / Reconnect explicitly. All platforms reuse one persistent management connection per destination and coalesce/cache session snapshots across browsers, without per-refresh SSH processes. A terminal connects on its first explicit opening per target/session; subsequent tab switches, page refreshes and browsers reuse that terminal. Transport failures, timeouts and authentication failures latch the destination offline on the server across all APIs. No automatic retries occur. Manual reconnect is allowed immediately without a long cooldown. Concurrent clicks across browsers share one attempt; elapsed time never initiates a connection. Terminal attachments reuse OpenSSH ControlMaster/ControlPersist where supported. No forced short keepalives or host scans. Configure keys and host-key trust in a normal terminal beforehand.

## 💻 Requirements

All platforms need **Node 22.x (22.12.0 or later) or 24.x** and **npm 10+**. The project version files keep 22.22.2 as the default development version; Node 24 is also supported. Windows release checks cover Node 22.22.2 and 24.16.0, including native terminal creation and input/output. The rest:

<details>
<summary><b>🪟 Windows 11</b></summary>

- WSL2 with at least one distro, and **tmux installed inside it** (`sudo apt install tmux`).
- The built-in OpenSSH client covers SSH targets.
- node-pty ships a **prebuilt Windows binary** — no compiler needed.

</details>

<details>
<summary><b>🍎 macOS</b></summary>

- `tmux` on `PATH` (`brew install tmux`).
- node-pty ships a **prebuilt darwin binary**.
- Launching from Finder and tmux isn't found? Make sure Homebrew's bin dir is on the GUI `PATH`.

</details>

<details>
<summary><b>🐧 Linux</b></summary>

- `tmux`, plus a C/C++ toolchain + Python 3 for node-pty (**no Linux prebuilt — it compiles on install**):
  ```bash
  sudo apt-get install -y build-essential python3 tmux
  ```
- WSL gotcha: `node-gyp` uses whatever `python3` is on `PATH`. If a broken conda Python breaks the build:
  ```bash
  PYTHON=/usr/bin/python3 npm install
  ```
  Select the interpreter through the `PYTHON` environment variable; see the [official node-gyp guidance](https://github.com/nodejs/node-gyp#configuring-python-dependency).

</details>

<details>
<summary><b>Run the server inside WSL instead (alternative)</b></summary>

On Windows you can also run the whole server *inside* WSL (like Linux) and just open the browser on Windows — WSL2 forwards `localhost`. The native-Windows + `wsl.exe` setup is what the one-click launcher uses, so it also covers SSH targets and multiple distros in one place.

</details>

## 🔒 Security

> ⚠️ **tmuxes grants full shell access to anything that can reach it.** It is a single-user, localhost dev tool.

By design it:

- binds to **`127.0.0.1` only** — the bind address is not configurable at runtime,
- has **no authentication**,
- provides real shell access through the terminal; management requests validate targets, session names and paths, with local processes launched through argv arrays rather than implicit Node command-string expansion,
- rejects WebSocket upgrades whose `Origin` isn't localhost (anti DNS-rebind),
- scopes browsing, editing, previews, downloads and path-link reads to the originating tmux session working directory; Agent reading only accesses server-verified bound records.

**Do not** reverse-proxy, tunnel, port-forward, or expose it on `0.0.0.0`. Any local user on the machine can use it.

## 🧪 Tests

```bash
npm test   # vitest: input validation, list parsing, ssh/tmux/wsl argv shapes
```

## 🐧 tmux cheat sheet

> tmux's "prefix" key is **`Ctrl+b`** by default (written `C-b` below) — press it, release, then press the next key.
> In a web terminal the thing you'll reach for most is **scroll / copy mode** (scroll back through output, copy text).

### Scroll & copy (most used)

When switching or reopening sessions, tmuxes restores the screen, cursor, full-screen and mouse modes from retained terminal state instead of replaying a raw output tail. Geometry changes are applied in output order, and mouse input preserves its original protocol bytes. Restoration reuses the existing connection without another SSH login. Scrolling inside full-screen applications is controlled by the application or tmux mouse settings.

**Copy to your system clipboard:** click **Select text** above the terminal, drag to select, then click **Copy** or press `Ctrl+C` / `Ctrl+Shift+C` (`⌘C` on macOS). No Shift-drag is needed. This view is a snapshot of the current terminal buffer when opened; the task keeps running. Click **Return to terminal** or press `Esc` to return to the live terminal; reopen it for a fresh snapshot. It is not full session history: full-screen programs may expose only their current screen, and tmux history not loaded into the browser is not included.

In interactive mode, `Ctrl+C` copies when text is selected and still interrupts the program otherwise; `Ctrl+Shift+C` is reserved for copying. Enable **Automatically copy mouse selections** in Settings if desired (off by default). A failed copy displays a message; the right-click menu remains available. For tmux's own scrolling and copy buffer, use the table below:

| Action | Keys |
|---|---|
| Enter copy / scroll mode | `C-b` then `[` |
| Scroll in that mode | `↑ ↓`, `PageUp` / `PageDown` |
| Select → copy | `Space` to start → move cursor → `Enter` to copy |
| Paste it back | `C-b` then `]` |
| Search in that mode | `C-s` forward / `C-r` backward (emacs-style default) |
| Quit copy / scroll mode | `q` |
| **Enable mouse wheel** (scroll + select with the mouse) | run `tmux set -g mouse on`, or put it in `~/.tmux.conf` |
| **Temporarily select in interactive mode** (bypass tmux mouse mode) | Hold `Shift`, drag to select → click **Copy** or press `Ctrl+C`; the right-click menu also works |

> Tip: once `mouse on` is set, the mouse belongs to tmux; to use the browser's native **drag-select + right-click copy/paste**, hold `Shift` while dragging / right-clicking.
>
> Tip: tmuxes **Copy** writes to the current device's system clipboard; tmux copy mode writes to tmux's own buffer by default. These are separate. Use tmux controls for history beyond the browser buffer and for splitting panes.


## ❓ FAQ

<details>
<summary><b>On one cluster, Chinese (or other non-ASCII) text in tmux shows up as underscores <code>_</code>?</b></summary>

That machine's login locale isn't UTF-8 (common on HPC login nodes — `LANG=C` / `POSIX`), so tmux runs in **non-UTF-8 mode** and renders each multibyte character as `_`. Fix it **on that machine**:

1. Set a UTF-8 locale — check what's available, then add it to `~/.bashrc` / `~/.zshrc`:
   ```bash
   locale -a | grep -i utf          # see which exist (C.UTF-8 / en_US.UTF-8 / zh_CN.UTF-8 …)
   echo 'export LANG=C.UTF-8' >> ~/.bashrc   # use a real one from the list above
   ```
2. Restart that machine's tmux server so sessions are recreated under UTF-8:
   ```bash
   tmux kill-server
   ```
3. Reconnect / create a session from tmuxes.

> ⚠️ A pane's UTF-8 mode is fixed **when it's created** — changing the locale **without restarting the server** won't fix already-broken sessions; they must be recreated.

</details>

### Diagnosing terminal freezes

On Windows, each PTY runs in a separate child process. A blocked native resize or close is isolated to that local terminal connection, rather than freezing other windows; operation timeouts never trigger automatic SSH reconnection. Slow browser viewers are detached individually while PTY output continues draining. One Ctrl+C normally exits; if cleanup blocks, the parent applies a deadline to its own local PTY process trees without terminating remote tmux sessions.

Startup prints the process PID and diagnostic log path. Windows defaults to `%LOCALAPPDATA%\tmuxes\logs\server-<PID>.log`; other platforms use `~/.local/state/tmuxes/logs/`. Override the directory with `TMUXES_LOG_DIR`. Each process rotates its log at approximately 1 MiB with one `.1` backup. Logs contain connection, timeout, and shutdown diagnostics, never terminal output. Include this file when reporting a freeze.

If typing an initial command or sending Enter fails after session creation, the API reports the error and preserves the created session. A failed SSH management channel stays offline until an explicit connection, without a long cooldown; entries with the same configured destination, user, and port share the connection identity.

## 📋 Changelog

### 0.1.26 (2026-10-13)

- **Codex completion:** replay 0.160 native records incrementally to recover missed tool and subagent events. Green requires the current turn to finish with no pending background tasks, decisions or goals.
- **File previews & downloads:** image, PDF and Markdown math previews, plus original file downloads. PDFs support continuous scrolling, text selection and inverted colors.
- **Persistent file tabs:** retain files, PDF pages, image zoom and unsaved edits across sessions, windows and targets, with bottom / right / maximized layouts.
- **Agent reading:** complete Codex 0.160 / Claude Code messages, incremental updates and history paging, with rendered selections as a fallback. Reading is independent of status collection.
- **Clickable paths:** open files from terminal output, reply prose and code while retaining their original target and session.
- **Sidebar & reminders:** Files / Git use half the height; arrows locate offscreen alerts and collapsed groups summarize unread reminders.
- **Preview style fixes:** isolate the main sidebar class from PDF.js so loading a PDF cannot narrow it; file toolbar buttons stay on one line.
- **Documentation:** new screenshots use entirely fictional data; both READMEs reflect the current UI and retain only the latest entry, with older logs archived separately.

See [release history](https://github.com/f1974939505/tmuxes/blob/main/CHANGELOG.en.md) for 0.1.25 and earlier.

<div align="center">
<sub>Built with React, TypeScript, node-pty &amp; xterm.js — plus a lot of tmux. Happy babysitting. 🤖</sub>
</div>

## 🧑‍🔬 About the author

> Hey, I'm the human behind this thing 👋
>
> A theoretical-physics PhD student at **USTC** (University of Science and Technology of China), spending my days wrestling with an **interpretable many-body-field-theory of Fermi superfluidity** (the stuff we use to study and explain high-Tc superconductivity), plus a small mountain of **high-performance numerical code** ⚛️.
>
> This tool started life as a self-rescue mission — if I'm going to babysit a swarm of CLI agents all day, they might as well have a proper command deck 😎.
>
> If any of that sounds fun (physics or code — either works), or you'd like to hack on this project together, come say hi 📮
>
> **📧 junruwu@mail.ustc.edu.cn**
