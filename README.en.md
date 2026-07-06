<div align="center">

# 🖥️ tmuxes

[简体中文](./README.md) ｜ **English**

### One browser tab to run, watch, and wrangle a whole swarm of CLI coding agents.

**Claude Code · Codex · OpenCode · Hermes** — each in its own tmux session,
live across **Local · SSH · WSL**, with a file browser and Git panel for every agent's working directory.

🔔 **When Claude Code finishes, stops abnormally, or needs a decision, your browser pings you**: red/green sidebar status dots, done/error/decision badges, a sound, and a flashing tab title when you're away. Codex approval / decision requests no longer alert, so Codex auto-approval does not get misreported.

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
| 🔔 **Done / error notifications** | Sessions created with an initial `claude` or `codex` command automatically get official lifecycle hooks. You can also open an empty session, `cd` to the target directory, then click the terminal's top-right `claude` / `codex` button to launch a hooked agent there. Expanded targets sync every 5 seconds: a red dot means running, a green dot means finished or stopped abnormally, and badges tell those cases apart. |
| 🌐 **Local · SSH · WSL · native Windows** | One sidebar lists your local machine, your `~/.ssh/config` hosts, your WSL distros (on Windows), and native PowerShell / cmd sessions (on Windows) — all side by side. |
| 🗂️ **Folder tree** | Organize sessions into **drag-and-drop folders** like a file explorer. Persists locally, per target. |
| 📂 **Live file browser + editor** | The bottom of the sidebar follows each session's **working directory** — click a code file to split the terminal and **read or edit** it inline (save, undo/redo). |
| 🔀 **Git panel** | Switch the sidebar bottom to Git view to inspect the current session's repository status, uncommitted changes, commit history, and incoming remote commits; click a pending file to open a VS Code-like side-by-side red/green diff in the bottom viewer region, and click a commit to show its full patch there; check out branches, fetch, pull, push, sync, and commit all working-tree changes. Git auth comes from the target machine's existing setup; tmuxes stores no credentials. |
| 🔁 **True multi-client sync** | Powered by native `tmux attach`: open the same session in two tabs and they mirror each other, keystroke for keystroke. |
| ⚙️ **Tweakable** | Adjustable font sizes for the sidebar, terminal, and file viewer — applied live, saved across reloads. |
| 🚀 **One click** | Double-click `start.cmd` / `start.command` / `start.sh` → it builds, launches, and opens your browser. |

## 🖼️ What it looks like

<div align="center">
<img src="https://raw.githubusercontent.com/f1974939505/tmuxes/main/fig/fig1.png" alt="tmuxes screenshot — one tab to run a swarm of CLI agents" width="900">
</div>

## 🏗️ Architecture

```text
                          REST  (create · list · rename · kill · cwd · files · git)
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

- `node -v` is **22.12+ and <23**, and `npm -v` is **10+**.
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

## 🔔 Launch Hooked Claude Code / Codex

tmuxes currently auto-wires official lifecycle hooks for **Claude Code (`claude`)** and **Codex (`codex`)**, so it can tell whether the agent is running, finished, or stopped abnormally.

Two launch paths:

1. Create a session with `claude` or `codex` as the initial command.
2. Create an empty session, `cd /your/project` in the terminal, then click the terminal's top-right `claude` / `codex` button.

Status meanings:

- Red dot: the agent is running.
- Green dot: the agent finished, stopped abnormally, or this session has no agent hook.
- `done` badge: the current turn finished.
- `error` badge: the agent stopped abnormally, for example when Codex disconnects without firing a stop hook. During the 5-second sync for expanded targets, tmuxes scans the tail of running agent panes and corrects these cases into an alert state.

Approval / decision handling differs by agent. Claude Code's `PermissionRequest`, `permission_prompt`, and `elicitation_dialog` events fire a "needs decision" alert. Codex approval / decision requests do not alert — that means Codex automatic approval / Approve for me will not turn `PermissionRequest` into a tmuxes "needs decision" notification, and manual approval mode no longer rings either.

Note: the top-right buttons send a hooked `claude` / `codex` command into the current tmux pane. Do not click them while another program in that pane is waiting for input. Bare `cc` is often the system C compiler, so tmuxes does not treat it as Claude Code by default. Native Windows shells have no tmux session option, so this hook status is not supported there.

## 🔀 Git Panel

Switch the sidebar bottom from `Files` to `Git`. The Git panel is scoped to the currently selected tmux session's working directory. It does not run background Git polling; it reads status when you open the panel, switch sessions, refresh, or run a Git action.

- **Working tree changes:** pending files are listed separately. Click a changed file to open a VS Code-like side-by-side red/green diff in the bottom viewer region; untracked files are shown as newly added files.
- **Commit:** type a commit message and click `Commit`; tmuxes runs `git add -A` and then creates the commit. It refuses to commit while conflicts are present.
- **Commit history / remote commits:** the panel shows recent commits on the current branch and incoming commits from the upstream branch. Click any commit to show its full patch in the same bottom viewer.
- **Sync actions:** fetch, `pull --ff-only`, push, sync (`fetch --prune` → `pull --ff-only` → push when needed), and branch checkout are supported. tmuxes does not run force push, reset, discard, clean, or branch deletion.
- **Credentials:** Git authentication comes from the target machine's existing Git / SSH setup; tmuxes stores no credentials. If the target Git config references a missing `credential-manager` helper, fetch / pull / push automatically retry once with credential helpers temporarily disabled, so public / SSH repositories are not blocked by a broken helper.

## 🧩 Targets

- **Local** *(Linux/macOS)* — your machine's tmux. Not shown on Windows.
- **Native Windows shells** *(Windows)* — PowerShell / cmd spawned directly via ConPTY (auto-detects `pwsh` → `powershell` → `cmd` → Git Bash); pick the shell when creating. Sessions live as long as the server process (survive refresh / reconnect / multi-tab; lost on server restart). They have no tmux working directory, so the file browser is hidden for them.
- **WSL distros** *(Windows)* — auto-discovered via `wsl.exe -l -q`; one target per distro. tmux must be installed inside the distro.
- **SSH hosts** — discovered from your `~/.ssh/config` `Host` entries (wildcards skipped). Add extras explicitly:

  ```bash
  TMUXES_HOSTS="alice@web1,bob@db2:2222" npm run dev      # Linux / macOS
  set TMUXES_HOSTS=alice@web1,bob@db2:2222 && npm run dev # Windows cmd
  ```

  Key/agent auth must already work from a normal shell. For a brand-new host, accept its host key once in a regular terminal first. To avoid repeated SSH handshakes for short management calls, Unix-like platforms keep reusing one long-lived OpenSSH connection with `ControlMaster` / `ControlPersist`; native Windows keeps an app-owned long-lived SSH management connection instead of using Windows OpenSSH mux sockets, avoiding `getsockname failed: Not a socket`. tmuxes no longer forces `ServerAliveInterval`, so add keepalives to your own `~/.ssh/config` only when your site allows them. If the shared/management connection is interrupted, tmuxes rebuilds it and retries once; if that still fails, the frontend shows a warning and pauses automatic polling for that SSH target. Click `Reconnect` to try again manually.

## 💻 Requirements

All platforms need **Node 22.12+** (the project version files pin 22.22.2) and **npm 10+**. The rest:

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
>
> Tip: in tmuxes, you can **create / select / rename / kill sessions** directly from the UI; no tmux commands needed for those. Scrolling through history, copying text, and splitting panes are tmux features, so use the shortcuts above for them.


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

### 0.1.14
- **Claude Code decision alerts restored:** 0.1.13 accidentally removed Claude Code's approval, permission, and user-decision alerts too. This version re-scopes the removal to Codex only; Claude Code's `PermissionRequest`, `permission_prompt`, and `elicitation_dialog` events once again fire the `decision` badge, sound, and flashing background tab.
- **Codex decision alerts stay removed:** Codex approval / decision requests still do not trigger browser alerts, avoiding false positives from `approvals_reviewer = "auto_review"` / Approve for me.

### 0.1.13
- **decision alerts removed:** Codex approval, permission, and user-decision requests no longer trigger browser alerts; tmuxes only alerts when an agent finishes or stops abnormally, avoiding Codex auto-approval false positives. (Note: 0.1.13 also accidentally removed Claude Code's decision alerts, restored in 0.1.14.)
- **Git panel:** added a Git view in the sidebar bottom for the current session's working directory, with status, uncommitted changes, file diffs, branch checkout, fetch, pull, push, sync, and commit-all.
- **commit history / remote commits:** the Git panel shows recent commits on the current branch and incoming upstream commits; click any commit to inspect its full patch in the bottom viewer region, and click any pending file to open a side-by-side red/green diff.
- **credential-manager fallback:** fetch / pull / push automatically retry once with credential helpers temporarily disabled when the target Git config references a missing `credential-manager` helper, so public/SSH repositories are not blocked by a broken helper.

### 0.1.12
- **Codex auto-review alert fix:** when Codex uses `approvals_reviewer = "auto_review"` / Approve for me, approval requests stay in the running state instead of incorrectly firing the `decision` badge, sound, or flashing background tab; manual approval mode still alerts normally.

### 0.1.11
- **docs / publishing rules:** added the npm publishing checklist, clarified that only the `server` workspace is published, and requires `npx` / `npm exec` plus local startup smoke tests before and after release.
- **security constraints:** publishing must not commit or paste `.npmrc` tokens, `NPM_TOKEN`, SSH private keys, one-time passwords, or any personal credentials.
- **README refresh:** added `npx --help` verification, Windows troubleshooting notes, and condensed early release history.

### 0.1.10
- **publish fix:** republished the npm `latest` package and verified the online `tmuxes` bin, bundled `public` assets, and `npx tmuxes@latest` entrypoint.

### 0.1.9
- **fix: native Windows SSH management commands now use an app-owned long-lived connection.** Avoids Windows OpenSSH `ControlMaster` mux socket failures (`getsockname failed: Not a socket`) while preventing short management calls from repeatedly opening SSH connections.
- **improve: file browser remote directory refresh is now coalesced.** One remote call reads the pane cwd, validates scope, and lists the directory, reducing SSH management traffic.

### 0.1.0 - 0.1.8
- **early feature set:** built local / SSH / WSL / native Windows shell targets, tmux attach multi-client sync, draggable folders, and the working-directory file browser/editor.
- **agent alerts:** evolved from active-to-quiet notifications to official Claude Code / Codex lifecycle hooks with done and abnormal-stop states.
- **Windows / SSH stability:** fixed ConPTY `Ctrl+C` shutdown, restored native browser right-click, and moved SSH management calls to long-lived reusable connections with only one automatic reconnect.

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
