# Release history

[简体中文](./CHANGELOG.md) ｜ **English**

[Current features and latest source changes](./README.en.md#-changelog). Entries below describe their original versions; use the README for current connection, safety and integration behavior.

### 0.1.28 (2026-10-22)

- **Latest-first reading:** load recent answers first, continue backwards through tool-only log segments, page through older history and return to the latest messages. Keep a bounded movable window instead of a fixed reachable-history limit.
- **Reading scroll:** even a slight upward scroll immediately stops following, so updates cannot pull you back to the bottom. Scroll down to the bottom or click Latest messages to resume.
- **Complete replies:** remove the 256 Ki-character truncation and keep reused provider message IDs distinct. Oversized records still have an explicit safety-budget hint.
- **Interactive terminal menu:** right-click to copy, paste, select, render text, scroll or redraw; Shift+right-click reaches mouse-aware terminal applications. Alt+right-click keeps the browser menu. Clipboard-denied browsers have a manual paste dialog.
- **Consistent live selection:** ordinary left drags select in the browser across SSH, WSL and local sessions, even with tmux mouse reporting. Ctrl/⌘+left reaches the application. File and web links no longer swallow a selection start or open while being dragged.
- **Math parsing:** fix multiline formulas whose opening or closing `$$` shares a line with content swallowing later prose. Preserve matrix row breaks and Markdown containers, and validate display equations in display mode, including equation numbering.
- **WSL agent binding:** prove ownership through real process ancestry and pane PIDs even when hooks lose tmux environment variables. Stable Linux process identities remain compatible with older observations; ambiguous or daemon ownership still fails closed.
- **Connection rule:** reading and status collection reuse existing management connections without automatic SSH login, connectivity probes or retries.

### 0.1.27 (2026-10-13)

- **Live files:** check only the visible file about every 3 seconds; unchanged content is not retransmitted, and returning to a tab checks immediately. Text / Markdown update automatically; images and PDFs reload only on changes while retaining zoom, page and reading positions.
- **Edit protection:** external updates preserve unsaved edits and show a conflict. Saving checks the file version; overwriting external changes requires confirmation. A toolbar button also reloads manually.
- **Terminal display:** retain the latest resize until ready and remeasure after font loading, browser zoom and visibility changes. Browser and server use matching Unicode 11 widths to prevent cursor offsets from modern emoji.
- **Stable layout:** keep terminal controls on one line and reserve at least 320 pixels for the terminal beside a right preview. Limited space temporarily docks previews at the bottom; widening restores the preferred layout.
- **Connection safety:** file checks reuse existing management connections. Hidden tabs stop polling; connection and permission errors pause until manual refresh or connection. No additional SSH logins.

### 0.1.26 (2026-10-13)

- **Codex completion:** replay 0.160 native records incrementally to recover missed tool and subagent events. Green requires the current turn to finish with no pending background tasks, decisions or goals.
- **File previews & downloads:** image, PDF and Markdown math previews, plus original file downloads. PDFs support continuous scrolling, text selection and inverted colors.
- **Persistent file tabs:** retain files, PDF pages, image zoom and unsaved edits across sessions, windows and targets, with bottom / right / maximized layouts.
- **Agent reading:** complete Codex 0.160 / Claude Code messages, incremental updates and history paging, with rendered selections as a fallback. Reading is independent of status collection.
- **Clickable paths:** open files from terminal output, reply prose and code while retaining their original target and session.
- **Sidebar & reminders:** Files / Git use half the height; arrows locate offscreen alerts and collapsed groups summarize unread reminders.
- **Preview style fixes:** isolate the main sidebar class from PDF.js so loading a PDF cannot narrow it; file toolbar buttons stay on one line.
- **Documentation:** new screenshots use entirely fictional data; both READMEs reflect the current UI and retain only the latest entry, with older logs archived separately.

### 0.1.25

- **Codex 0.160 completion:** rebuild status from structured execution records, including nested subagents, code cells, and read-only goal checks. Fix permanently red status caused by missing callbacks, failed image reads, and waits on commands that already exited.
- **Recovery without restart:** bound 0.160 sessions can recover after updating the collector. Large records are processed incrementally, and live pane observations no longer expire after one day. Updates continue using the existing management connection.

### 0.1.24

- **Codex completion:** recover unmatched hooks from structured tool-completion events and incrementally verify cancelled subagents' commands and goals. Clear stale tasks while retaining running monitors and background work.
- **Collection diagnostics:** show a hint when lifecycle records are incomplete; restart Codex after its work ends to cover the full lifecycle. Update the target integration to apply the fix. Status reads continue reusing the existing management connection.

### 0.1.22

- **Terminal stability:** isolate Windows PTYs in child processes, bound output queues, and complete shutdown cleanup so one terminal cannot freeze all windows; add rotating local diagnostic logs.
- **Codex completion:** combine foreground hooks with matching turn-complete records while retaining background-task and subagent checks. Update the target Codex integration, trust `/hooks`, and restart Codex.
- **Logic consistency:** fix control-message validation, management stdin, SSH stream errors, connection identity, stale completion evidence, command-launch errors, and session-cache races.
- **Manual SSH retry:** remove the long cooldown while keeping automatic reconnect disabled; coalesce concurrent clicks and ignore late failures from old connections.
- **Collapsed by default:** all sidebar target groups start collapsed, including Windows Local and WSL Ubuntu.

### 0.1.21

- **Direct foreground Codex:** the toolbar types `codex --no-daemon` into the interactive shell. Launching requires neither Python nor an extra app-server; the duplicate sidebar launch control is removed.
- **Verified ownership:** on Linux / WSL, native hooks verify direct Codex process ancestry, foreground process group, and process identity. Identical session IDs in different processes remain isolated. Install / update the target integration again and trust it in `/hooks`; optional status collection still requires Python.
- **Old observation cleanup:** unbound, ended, and superseded observation metadata is no longer displayed or retained. Agent session history and background processes are untouched.
- **Claude background compatibility:** background-task and cron lists are read independently, preserving positive evidence when one field is missing. Incomplete evidence never reports completion.
- **SSH constraints preserved:** management requests reuse an explicitly established connection; no automatic connection, reconnection, or per-refresh SSH login.

### 0.1.20

- **Cluster SSH iron rule:** management connections are explicitly opened and persist across requests on every platform. All automatic reconnects are removed. Server-side failure latches prevent polling and other browsers from automatically reconnecting. The original ten-minute manual-retry cooldown is removed in the 0.1.22; concurrent clicks still coalesce.
- **Reuse terminal connections:** refreshes, tab switches and multiple browsers share the existing target/session terminal; session snapshots are coalesced and cached across browsers.
- **Verified Codex ownership:** shared-daemon environment/process guesses no longer bind panes. Launch bound Codex uses a private official backend with verified launch identity and ancestry. TUI exit unbinds the pane while preserving background work. Install / update the integration again to deploy the new runtime.
- **Exact pane display:** the panel identifies session/window/pane; sidebar state follows the active pane instead of mixing other windows.

### 0.1.19

- **Fix false agent-not-installed errors:** installation reads the target interactive shell PATH and exported agent configuration directories. Codex, Claude, and Hermes hook setup no longer requires an agent executable in the management process PATH. This runs only during explicit installation, without extra status polling or SSH logins.

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
