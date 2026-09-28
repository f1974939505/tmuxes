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

## Implemented passive integration

New launches enter the original command. They do not use the bridge or inject
configuration flags. The bridge remains only as legacy code with regression
coverage; an already-running wrapped process must be restarted to migrate.

The target panel explicitly installs native hooks/plugins once, preserving
existing hooks and backing up modified JSON. Versioned Python stdlib assets and
a stable launcher live in `~/.local/share/tmuxes/observer`. Native callbacks write
allowlisted metadata into private atomic JSON files, never prompts or tool
output. No extra listener or collector daemon is started. The normal session
refresh reads these files on the target using the existing management transport.
SSH reconnect and authentication-failure policy is unchanged.

An automatic pane binding requires process ancestry and a matching process start
time. Inherited daemon environment alone is insufficient. Unbound observations
are visible separately, without window alerts. Users can explicitly link a
session ID to an active pane containing exactly one matching agent process.
Resumes reset stale state; records owned by the same live process prefer the
latest session. Multiple live processes aggregate conservatively so one ending
cannot hide another running process.

Codex hooks follow normal `/hooks` trust. A separate read-only connection to the
existing daemon uses only thread reads, turn summaries, goal, descendant, and
background-terminal lists. It never launches a daemon, resumes a thread,
subscribes by mutation, or responds to approval requests. A Stop event only
nominates a turn for verification; success requires a matching completed turn,
no unresolved work, a second root-state check, and stable confirmation across
refreshes. Paused goals and incomplete pagination cannot count as completion.
Missing interfaces and older unsupported histories degrade to unknown.

`waitingOnApproval` cannot identify the reviewer. It therefore remains unknown
rather than falsely announcing a human decision during automatic review.
`waitingOnUserInput` can announce a decision. Shared-daemon pane binding may
require explicit user association. These limits mean native observation is not
feature-equivalent to intercepting every TUI protocol message.

Claude requires its background evidence fields to certify completion. Another
Stop hook's first continuation decision may remain invisible. Hermes requires
normal plugin enablement and reliable lifecycle/background fields. OpenCode
currently supports only v1; installation rejects v2 before changing config
because its plugin API changed. Future adapters should be added from actual
schemas and fixtures, without guessing compatibility.

## Validation

`npm test` covers event transitions, background work, incomplete evidence,
metadata privacy, preserved configuration, pane ownership and aggregation.
`scripts/test-native-observer.py` exercises real isolated tmux panes and the
installer with a synthetic Claude executable entered as an ordinary command;
it covers resume, renaming, background work and stale inherited environment.
This is not a live model test. `scripts/test-codex-bridge.py` also checks a separate
read-only observer against a real isolated Codex 0.158 daemon, with no model
requests. It does not prove all interactive agent/version combinations.

## Official references

- [Hooks: discovery, trust, event fields and limitations](https://learn.chatgpt.com/docs/hooks)
- [Notifications: notify versus TUI notifications](https://learn.chatgpt.com/docs/config-file/config-advanced#notifications)
- [App Server: reading stored threads without resuming](https://learn.chatgpt.com/docs/app-server)

- [Claude Code hooks](https://code.claude.com/docs/en/hooks)
- [OpenCode v2 plugins](https://opencode.ai/v2/docs/build/plugins)
- [Hermes hooks](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks)
