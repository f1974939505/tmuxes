<div align="center">

# 🖥️ tmuxes

[简体中文](./README.md) ｜ **English**

### One browser tab to run, watch, and wrangle a whole swarm of CLI coding agents.

**Claude Code · Codex · OpenCode · Hermes** — each in its own tmux session,
live across **Local · SSH · WSL**, with a file browser of every agent's working directory.

🔔 **When Claude Code / Codex finishes or needs a decision, your browser pings you**: red/green sidebar status dots, done/decision badges, a sound, and a flashing tab title when you're away. No more babysitting panes to see whether it is still running.

<p>
<a href="https://www.npmjs.com/package/tmuxes"><img alt="npm version" src="https://img.shields.io/npm/v/tmuxes?style=flat-square&logo=npm&color=CB3837"></a>
<img alt="platform" src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows%2011-2b2b2b?style=flat-square">
<img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white">
<img alt="Node.js" src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=nodedotjs&logoColor=white">
<img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white">
<img alt="tmux" src="https://img.shields.io/badge/tmux-3.x-1BB91F?style=flat-square&logo=tmux&logoColor=white">
<img alt="xterm.js" src="https://img.shields.io/badge/xterm.js-6-1f6feb?style=flat-square">
</p>

<sub>🔒 localhost-only · ⚡ one-click launch · 🔔 agent-hook notifications · 🪟 reaches into WSL on Windows · 🧩 zero config</sub>

</div>

---

> **Why?** Modern coding agents are long-running terminal processes. Run a few at once and you're juggling
> panes, SSH windows, and "wait, which box was that on?". **tmuxes** puts all of them behind one clean web UI:
> spin up a session, drop it in a folder, watch it work, peek at the files it's editing — local or remote, same view.

## ✨ Highlights

| | |
|---|---|
| 🧠 **Built for agents** | Every agent gets its own tmux session. Create one (with an initial command like `claude` or `codex`), select it, and the right pane becomes a **fully interactive live terminal**. |
| 🔔 **Done / decision notifications** | Sessions created with an initial `claude`, `cc`, or `codex` command automatically get official lifecycle hooks. You can also open an empty session, `cd` to the target directory, then click the terminal's top-right `cc` / `codex` button to launch a hooked agent there. Expanded targets sync every 5 seconds: a red dot means running, a green dot means finished or waiting for your decision, and badges tell those cases apart. |
| 🌐 **Local · SSH · WSL · native Windows** | One sidebar lists your local machine, your `~/.ssh/config` hosts, your WSL distros (on Windows), and native PowerShell / cmd sessions (on Windows) — all side by side. |
| 🗂️ **Folder tree** | Organize sessions into **drag-and-drop folders** like a file explorer. Persists locally, per target. |
| 📂 **Live file browser + editor** | The bottom of the sidebar follows each session's **working directory** — click a code file to split the terminal and **read or edit** it inline (save, undo/redo). |
| 🔁 **True multi-client sync** | Powered by native `tmux attach`: open the same session in two tabs and they mirror each other, keystroke for keystroke. |
| ⚙️ **Tweakable** | Adjustable font sizes for the sidebar, terminal, and file viewer — applied live, saved across reloads. |
| 🚀 **One click** | Double-click `start.cmd` / `start.command` / `start.sh` → it builds, launches, and opens your browser. |

## 🖼️ What it looks like

<div align="center">
<img src="https://raw.githubusercontent.com/f1974939505/tmuxes/main/fig/fig1.png" alt="tmuxes screenshot — one tab to run a swarm of CLI agents" width="900">
</div>

## 🏗️ Architecture

```text
                          REST  (create · list · rename · kill · cwd · files)
  ┌────────────┐   ┌──────────────────────┐        ┌──────────────────────────────────┐
  │  Browser   │──▶│  Node · Express · ws │──pty──▶│ tmux                  (Linux/macOS)│
  │  xterm.js  │◀──│        node-pty      │──pty──▶│ ssh -tt user@host → tmux   (remote)│
  └────────────┘   └──────────────────────┘──pty──▶│ wsl.exe -d <distro> → tmux (Windows)│
        ▲   binary bytes ⇄ WebSocket ⇄ JSON control └──────────────────────────────────┘
```

- **`client/`** — React + Vite + TypeScript, terminal via [`@xterm/xterm`](https://www.npmjs.com/package/@xterm/xterm).
- **`server/`** — Node + Express + `ws` + `node-pty`. A small REST API runs short-lived tmux *management* commands; a single WebSocket endpoint streams the interactive *attach*.

> **No native tmux on Windows?** No problem. The server runs natively (node-pty uses ConPTY) and reaches tmux **inside your WSL distros** via `wsl.exe`. On Linux/macOS it talks to local tmux directly. Remote hosts use the **system `ssh` binary**, reusing your existing `~/.ssh` keys / `ssh-agent` — **no passwords are ever stored.**

## 📦 Install from npm

```bash
# One-shot (no clone, opens the browser):
npx tmuxes

# Or install globally and use the `tmuxes` command:
npm install -g tmuxes
tmuxes                       # → http://127.0.0.1:7420

# Flags:
tmuxes --port 8080 --no-open
```

> Needs **tmux** on the machine/host you connect to. On **Linux**, `node-pty` compiles from source (`build-essential` + `python3`); **Windows / macOS** ship prebuilt binaries — truly one-click. See Requirements below.

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

## 🔔 Launch Hooked cc / Codex

tmuxes currently auto-wires official lifecycle hooks for **Claude Code (`cc`)** and **Codex (`codex`)**, so it can tell whether the agent is running, finished, or waiting for your decision.

Two launch paths:

1. Create a session with `cc` or `codex` as the initial command.
2. Create an empty session, `cd /your/project` in the terminal, then click the terminal's top-right `cc` / `codex` button.

Status meanings:

- Red dot: the agent is running.
- Green dot: the agent finished, is waiting for your decision, or this session has no agent hook.
- `done` badge: the current turn finished.
- `decision` badge: the agent is waiting for permission or user input.

Note: the top-right buttons send a hooked `cc` / `codex` command into the current tmux pane. Do not click them while another program in that pane is waiting for input. Native Windows shells have no tmux session option, so this hook status is not supported there.

## 🧩 Targets

- **Local** *(Linux/macOS)* — your machine's tmux. Not shown on Windows.
- **Native Windows shells** *(Windows)* — PowerShell / cmd spawned directly via ConPTY (auto-detects `pwsh` → `powershell` → `cmd` → Git Bash); pick the shell when creating. Sessions live as long as the server process (survive refresh / reconnect / multi-tab; lost on server restart). They have no tmux working directory, so the file browser is hidden for them.
- **WSL distros** *(Windows)* — auto-discovered via `wsl.exe -l -q`; one target per distro. tmux must be installed inside the distro.
- **SSH hosts** — discovered from your `~/.ssh/config` `Host` entries (wildcards skipped). Add extras explicitly:

  ```bash
  TMUXES_HOSTS="alice@web1,bob@db2:2222" npm run dev      # Linux / macOS
  set TMUXES_HOSTS=alice@web1,bob@db2:2222 && npm run dev # Windows cmd
  ```

  Key/agent auth must already work from a normal shell. For a brand-new host, accept its host key once in a regular terminal first.

## 💻 Requirements

All platforms need **Node 18+** (developed on 22) and **npm**. The rest:

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
  npm config set python /usr/bin/python3
  ```

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
- **never spawns a shell** (argv arrays + `shell:false`) and allowlist-validates every input,
- rejects WebSocket upgrades whose `Origin` isn't localhost (anti DNS-rebind),
- scopes the file browser/editor to the selected tmux session's current working directory.

**Do not** reverse-proxy, tunnel, port-forward, or expose it on `0.0.0.0`. Any local user on the machine can use it.

## 🧪 Tests

```bash
npm test   # vitest: input validation, list parsing, ssh/tmux/wsl argv shapes
```

## 🐧 tmux cheat sheet

> tmux's "prefix" key is **`Ctrl+b`** by default (written `C-b` below) — press it, release, then press the next key.
> In a web terminal the thing you'll reach for most is **scroll / copy mode** (scroll back through output, copy text).

### Scroll & copy (most used)

| Action | Keys |
|---|---|
| Enter copy / scroll mode | `C-b` then `[` |
| Scroll in that mode | `↑ ↓`, `PageUp` / `PageDown` |
| Select → copy | `Space` to start → move cursor → `Enter` to copy |
| Paste it back | `C-b` then `]` |
| Search in that mode | `C-s` forward / `C-r` backward (emacs-style default) |
| Quit copy / scroll mode | `q` |
| **Enable mouse wheel** (scroll + select with the mouse) | run `tmux set -g mouse on`, or put it in `~/.tmux.conf` |
| **Hold Shift for the mouse** (bypass tmux mouse mode) | Hold `Shift`, drag to select → browser right-click "Copy"; right-click "Paste" |

> Tip: once `mouse on` is set, the mouse belongs to tmux; to use the browser's native **drag-select + right-click copy/paste**, hold `Shift` while dragging / right-clicking.


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

## 📋 Changelog

### 0.1.4
- **improve: notifications now use official Claude Code / Codex lifecycle hooks.** Sessions created with an initial `claude`, `cc`, or `codex` command get hooks injected automatically; you can also open an empty session, `cd` to the target directory, then click the top-right `cc` / `codex` button to launch a hooked agent there. tmuxes syncs their tmux session option every 5 seconds. A red dot means running, a green dot means finished or waiting for a decision, and badges distinguish done vs. decision alerts.

### 0.1.3
- **fix (Windows)**: `Ctrl+C` actually stops the server now. The previous fix was buggy (the readline bridge never entered terminal mode, so it was a no-op), and node-pty's ConPTY backend breaks the host's `CTRL_C_EVENT → SIGINT` path. We now **read the raw Ctrl+C byte (0x03) straight from the console**, bypassing the broken signal machinery. `Ctrl+Break` still works too.
- **change: native browser right-click restored.** The terminal no longer suppresses the context menu. To use the browser's native **drag-select + right-click copy/paste**, hold `Shift` while dragging / right-clicking (bypasses tmux mouse mode).

### 0.1.2
- **New: active-to-quiet notifications.** Zero-config monitoring of every session: when a session's terminal screen stops changing, you get a **sidebar status dot + sound + background tab-title flash**. Toggle notifications and sound in Settings.

### 0.1.1
- **fix (Windows)**: `Ctrl+C` now correctly stops the server. ConPTY child processes (node-pty) were consuming the `CTRL_C_EVENT` before it reached the host node process; fixed by bridging SIGINT via `readline` directly from the console input layer.
- **fix (terminal)**: Right-click now works in tmux mouse mode. The browser's native context menu is suppressed inside the terminal area so right-click events flow through xterm → tmux. Requires `set -g mouse on` in tmux.

### 0.1.0
- Initial release.

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
