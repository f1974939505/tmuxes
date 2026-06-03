<div align="center">

# 🖥️ tmuxes

[简体中文](./README.md) ｜ **English**

### One browser tab to run, watch, and wrangle a whole swarm of CLI coding agents.

**Claude Code · Codex · OpenCode · Hermes** — each in its own tmux session,
live across **Local · SSH · WSL**, with a file browser of every agent's working directory.

<p>
<img alt="platform" src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows%2011-2b2b2b?style=flat-square">
<img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white">
<img alt="Node.js" src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=nodedotjs&logoColor=white">
<img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white">
<img alt="tmux" src="https://img.shields.io/badge/tmux-3.x-1BB91F?style=flat-square&logo=tmux&logoColor=white">
<img alt="xterm.js" src="https://img.shields.io/badge/xterm.js-6-1f6feb?style=flat-square">
</p>

<sub>🔒 localhost-only · ⚡ one-click launch · 🪟 reaches into WSL on Windows · 🧩 zero config</sub>

</div>

---

> **Why?** Modern coding agents are long-running terminal processes. Run a few at once and you're juggling
> panes, SSH windows, and "wait, which box was that on?". **tmuxes** puts all of them behind one clean web UI:
> spin up a session, drop it in a folder, watch it work, peek at the files it's editing — local or remote, same view.

## ✨ Highlights

| | |
|---|---|
| 🧠 **Built for agents** | Every agent gets its own tmux session. Create one (with an initial command like `claude` or `codex`), select it, and the right pane becomes a **fully interactive live terminal**. |
| 🌐 **Local · SSH · WSL · native Windows** | One sidebar lists your local machine, your `~/.ssh/config` hosts, your WSL distros (on Windows), and native PowerShell / cmd sessions (on Windows) — all side by side. |
| 🗂️ **Folder tree** | Organize sessions into **drag-and-drop folders** like a file explorer. Persists locally, per target. |
| 📂 **Live file browser + editor** | The bottom of the sidebar follows each session's **working directory** — click a code file to split the terminal and **read or edit** it inline (save, undo/redo). |
| 🔁 **True multi-client sync** | Powered by native `tmux attach`: open the same session in two tabs and they mirror each other, keystroke for keystroke. |
| ⚙️ **Tweakable** | Adjustable font sizes for the sidebar, terminal, and file viewer — applied live, saved across reloads. |
| 🚀 **One click** | Double-click `start.cmd` / `start.command` / `start.sh` → it builds, launches, and opens your browser. |

## 🖼️ What it looks like

```text
┌───────────────────────────┬──────────────────────────────────────────────┐
│ tmuxes                  ⟳ │  ● claude-code — agent1                        │
│                           │                                                │
│ ▾ Local            local  │   $ claude "refactor the auth module"          │
│   📂 frontend             │   ⠿ thinking…                                  │
│     ● agent1   2 win · 3m │   ▸ Editing src/auth/session.ts                │
│     ○ agent2   1 win      │   ▸ Running tests…                             │
│   📁 backend              │                                                │
│   ○ scratch    1 win      │                                                │
│ ▾ devbox             ssh  ├───────────────── src/auth/session.ts ─────────┤
│   ○ build      1 win      │  1  export function createSession(user) {      │
│ ─────────── drag ──────── │  2    const token = sign(user, KEY)            │
│ WORKING DIRECTORY     ↑ ⌂ │  3    return { token, exp: Date.now() + TTL }  │
│   📁 src                  │  4  }                                          │
│   📄 session.ts           │                                                │
│   📄 README.md            │                                                │
│ ⚙ Settings                │                                                │
└───────────────────────────┴──────────────────────────────────────────────┘
   sidebar: tmux tree + cwd file browser        terminal  ╱  opened file
```

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

## 🚀 Quick start

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

<div align="center">
<sub>Built with React, TypeScript, node-pty &amp; xterm.js — and a lot of tmux. Happy supervising. 🤖</sub>
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
