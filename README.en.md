<div align="center">

# 🖥️ tmuxes

[简体中文](./README.md) ｜ **English**

### One browser tab to run, watch, and wrangle a whole swarm of CLI coding agents.

**Claude Code · Codex · OpenCode · Hermes** — each in its own tmux session,
live across **Local · SSH · WSL**, with a file browser and Git panel for every agent's working directory.

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
| 🔔 **Done / error / decision notifications** | Enter an agent command when creating a session, or launch any of the four agents from an idle terminal's toolbar. Structured events distinguish running, background work, human decisions, completion, failure, and unknown state. Expanded targets sync tmux status every 5 seconds without scanning terminal text for errors. |
| 🌐 **Local · SSH · WSL · native Windows** | One sidebar lists your local machine, your `~/.ssh/config` hosts, your WSL distros (on Windows), and native PowerShell / cmd sessions (on Windows) — all side by side. |
| 🗂️ **Folder tree** | Organize sessions into **drag-and-drop folders** like a file explorer. Persists locally, per target. |
| 📂 **Live file browser + editor** | The bottom of the sidebar follows each session's **working directory** — click a code file to split the terminal and **read or edit** it inline (save, undo/redo). |
| 🔀 **Git panel** | Switch the sidebar bottom to Git view to inspect the current session's repository status, uncommitted changes, commit history, and incoming remote commits; click a pending file to open a VS Code-like side-by-side red/green diff in the bottom viewer region, and click a commit to show its full patch there; check out branches, fetch, pull, push, sync, and commit all working-tree changes. Git auth comes from the target machine's existing setup; tmuxes stores no credentials. |
| 🔁 **True multi-client sync** | Powered by native `tmux attach`: open the same session in two tabs and they mirror each other, keystroke for keystroke. |
| ⚙️ **Tweakable** | Adjustable font sizes for the sidebar, terminal, and file viewer — applied live, saved across reloads. |
| 📋 **Easy copying** | Click **Select text** to drag-select an output snapshot without Shift; includes a Copy button, `Ctrl+C` / `Ctrl+Shift+C`, and optional automatic copying of mouse selections. |
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

Open **Agent status integration** on a target, select an agent, and click **Install / update** once. The target needs **Python 3.9+ (`python3`)**, tmux, and the installed agent. Installation preserves existing configuration and backs up modified hook files. Restart the agent, then type ordinary `claude`, `codex`, `opencode`, or `hermes` commands in a tmux pane. Toolbar buttons also enter the original command, without injected `--remote`, `-c`, or a launch wrapper.

- **Running / background**: the root is working, or associated shells, monitors, subagents, goals, or scheduled wakeups remain.
- **Decision**: structured evidence indicates user input is needed; briefly resolved requests stay quiet.
- **Done**: the current root turn ended normally, known associated work settled, and a short confirmation period passed. Silence, process exit, and final text are insufficient.
- **Error**: a terminal root-task failure. Ordinary tool errors, warnings, and automatic retries do not directly alert.
- **Unknown**: missing interfaces, disconnection, uncertain pane ownership, or incomplete background evidence. Completion is never guessed.

| Agent | Integration and limits |
| --- | --- |
| Codex | Merges `CODEX_HOME/hooks.json` (default `~/.codex/hooks.json`). Restart and review/trust through `/hooks`. Hooks write metadata one way; an independent read-only connection to the existing daemon checks status, goals, descendants, and background terminals. It never proxies the TUI, starts the daemon, or answers approvals. Validation baseline: 0.158.0. Missing hooks/interfaces or older history without pagination support degrade to unknown. |
| Claude Code | Merges `CLAUDE_CONFIG_DIR/settings.json` (default `~/.claude/settings.json`). Reads lifecycle, questions, failures, and background fields. Missing background evidence or continued Stop hooks prevent completion. Another Stop hook's first continuation decision may be invisible; the confirmation period only mitigates this race. |
| OpenCode | Installs a global v1 plugin, respecting `XDG_CONFIG_HOME`. Only v1 is currently supported. The v2 plugin API changed; installation refuses v2 without modifying its configuration. v2 status collection is not implemented. |
| Hermes | Installs under `HERMES_HOME/plugins/tmuxes-native-observer` (default `~/.hermes`). Run `hermes plugins enable tmuxes-native-observer`, then restart. Missing lifecycle fields or background counters degrade to unknown. Install separately in each named profile's environment. |

A shared Codex daemon may not prove which pane owns a session. Unbound sessions appear only in the integration panel and do not trigger window alerts. Check the full session ID before linking to the selected tmux session's active pane; linking requires one matching agent process. Automatic binding verifies process ancestry and start time, not merely inherited `TMUX_PANE`. Resumed sessions may need linking again.

Codex `waitingOnApproval` cannot identify human versus automatic review, so it currently shows unknown without a human-decision alert. Structured user questions can still alert. Paused goals, background work, incomplete pagination, and unverifiable endings never produce completion alerts. These are explicit limits of passive observation.

The collector stores bounded status metadata, never prompts or tool output. Installed files live under `~/.local/share/tmuxes/observer/`; records live under `~/.cache/tmuxes/observations/`. Reads are batched into the existing session refresh using the existing management connection, without additional SSH login probes or independent polling. `TMUXES_NO_AUTOHOOK` does not disable installed native integrations. To disable, remove only hooks pointing to the tmuxes observer, delete the corresponding OpenCode plugin file, or run `hermes plugins disable tmuxes-native-observer`.

New launches no longer use the bridge that caused `/resume` compatibility problems. Exit and restart already-running old processes. User-supplied Codex configuration overrides can still produce Codex's own embedded-mode warning. Click launch buttons only at an idle shell. Native Windows shells lack tmux; use WSL or SSH. See the [notification design](https://github.com/f1974939505/tmuxes/blob/main/docs/agent-notification-design.md).

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

## 📋 Changelog

### 0.1.18
- **Native status integration:** install hooks/plugins once per target, then launch agents with ordinary commands in tmux panes. Existing configuration is preserved and modified hook files are backed up.
- **Codex launch and resume:** toolbar launches no longer inject `--remote`, `-c`, or wrappers, removing the bridge path behind the `/resume` connection failure. Restart old processes and trust Codex hooks through `/hooks`.
- **Conservative status checks:** independently read background tasks, subagents, and goals; unverifiable completion stays unknown. Shared-daemon sessions can be linked manually to panes. Ambiguous human/automatic approval states do not trigger decision alerts.
- **Compatibility limits:** the OpenCode plugin currently supports v1 only and refuses v2 installation. Hermes requires normal plugin enablement after installation. See the integration section above.

### 0.1.17
- **Agent alerts redesigned:** distinguish errors, pending user decisions, and verified task completion; background tasks, subagents, monitor shells, and brief pauses do not count as overall completion. Unverifiable activity is shown as unknown.
- **Codex shared background server:** use a local protocol bridge instead of injecting `-c` hooks, removing the resulting embedded-mode warning; restore actual user-decision alerts while filtering brief automatic approvals.
- **Four agent integrations:** update Claude Code hooks and add OpenCode and Hermes launch buttons and event adapters. Automatic integration requires Python 3.9+ on the tmux target; compatibility limits and the opt-out are documented above.

### 0.1.16
- **Node 24 support:** corrected `engines.node` to `^22.12.0 || ^24.0.0`, removing the incorrect `EBADENGINE` warning on Node 24; synchronized all workspaces, lockfile, installation guidance, and launcher messages.

### 0.1.15
- **Terminal copying**: added a Copy button, selection copy shortcuts, a text snapshot selection mode without Shift, and optional automatic copying of mouse selections; interactive `Ctrl+C` still interrupts when nothing is selected.

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
