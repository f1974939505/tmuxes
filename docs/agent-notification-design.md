# Agent notification transport review

Reviewed against Codex CLI 0.158.0 and official documentation on 2026-09-28.

## The 0.1.17 resume regression

tmuxes launched the TUI with `--remote unix://<private bridge>`. The bridge
accepted exactly one WebSocket connection. The `/resume` picker opens another
app-server connection while the original TUI remains connected, so its handshake
timed out with `Failed to start TUI session picker: failed to connect to remote app server`.

The fix keeps the local listener alive and forwards each client through its own
upstream connection. Request IDs and observers are independent. Only a client
that successfully starts, resumes, or forks a thread can own attention state;
closing a list-only picker or a replaced client cannot clear that state. Binding
a different thread resets attention and background work from the previous one.

The opt-in `scripts/test-codex-bridge.py` reproduces the old second-connection
timeout and checks simultaneous clients, repeated pickers, synthetic-history
resume, replacement ownership, and reconnecting to the same listener against a
real isolated daemon. It uses no account or model calls. It does not establish
compatibility with every interactive Codex feature or future protocol version.

## Simpler alternatives

| Source | Advantages | Limits for tmuxes |
| --- | --- | --- |
| Native hooks / plugins → one-way local JSON events | Does not interpose on the CLI connection; natural fit for Claude Code, OpenCode, and Hermes | Codex hooks require explicit trust. Its documented events lack a complete terminal-error, human-wait, and background-work snapshot. `PermissionRequest` can be resolved by another hook; `Stop` can be continued. Neither is final evidence on its own. |
| Codex `notify` → local receiver | Small official callback, no custom app-server transport | Currently only `agent-turn-complete`; cannot distinguish the requested three categories or certify no remaining background work. |
| TUI OSC 9 / BEL → terminal handler | Reuses terminal output; no RPC proxy | BEL has no type. OSC notifications are user-facing notices, not a complete lifecycle stream; focus settings, tmux forwarding and attachment affect delivery. Completion notices do not establish task completion. |
| Read-only app-server queries beside the unmodified TUI | Can inspect goals, descendants, and background terminals without forwarding TUI traffic | Still experimental; needs a reliable thread-to-pane binding, and reads do not subscribe to thread events. Must not call `thread/resume` merely to monitor a thread. |
| Transcript or screen scraping | Little initial setup | Transcript format and screen text are not stable status APIs. Text, process exit and silence cannot establish true completion. |

## Recommended direction

Keep agent execution independent from monitoring. Prefer native hooks/plugins
sending bounded metadata to a local receiver, which updates the existing tmux
status option. That receiver should be fail-open, preserve per-launch ownership,
and never send approvals or inject prompts. It needs no new SSH connections or
public HTTP service. Model-authored "done" messages are not lifecycle evidence.

For Codex, this is a direction, not a drop-in replacement with equal coverage.
First validate native event coverage and a reliable session-to-pane binding in
shared-daemon mode, including `/resume`, `/new`, multiple panes in the same
directory, and an already-running daemon. Do not assume the daemon inherits each
TUI launch's environment. Configure hooks through supported files and the normal
trust flow; do not inject `-c` or silently bypass hook trust.

Expose incomplete capability honestly: a turn-stop signal can trigger a
read-only verification when available, otherwise the state remains unknown.
Human decisions require evidence of an unresolved human-facing request; success
requires verified completion of the root and associated work. A simpler
transport alone cannot supply missing lifecycle evidence. The bridge fix is a
compatibility repair, not a claim that the bridge is the preferred long-term
architecture.

## Official references

- [Hooks: discovery, trust, event fields and limitations](https://learn.chatgpt.com/docs/hooks)
- [Notifications: notify versus TUI notifications](https://learn.chatgpt.com/docs/config-file/config-advanced#notifications)
- [App Server: reading stored threads without resuming](https://learn.chatgpt.com/docs/app-server)
