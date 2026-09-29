# Logic review — 2026-09-29

Reviewed the active paths connecting the toolbar, session REST API, shared SSH
management channel, terminal WebSockets, PTY lifecycle, native agent collectors,
session snapshots, and sidebar notifications. File/Git operations were checked
for transport routing. This is a bounded code review, not proof of correctness
for every external agent version or cluster configuration.

## Fixed

| Inconsistency | Consequence | Correction |
| --- | --- | --- |
| WebSocket control handlers assumed every valid JSON value was an object | `null` could throw outside REST error handling and terminate the server | Validate control shape on both tmux and Windows shell paths |
| Management commands inherited the shared SSH protocol input; local command stdin stayed open without input | A command waiting for stdin could consume protocol data or stall the queue | Redirect inputless remote commands from `/dev/null`; always end local stdin |
| SSH handled write callbacks but not stdin stream errors; unsuccessful initialization could leave an unusable live session | Uncaught stream errors or a permanently “connecting” destination | Handle stream errors, dispose failed initialization, preserve the offline latch (the subsequent user-requested policy allows immediate manual retry, with concurrent attempts coalesced) |
| SSH management identity ignored UI target IDs but ControlPath included them | Duplicate UI entries for the same destination could miss the existing multiplexed connection | Use destination and port consistently |
| Codex verification survived newer hooks; an unmatched SubagentStop created no outstanding task | Old completion evidence could be reused; an unverified child could be overlooked | Invalidate verification on each new hook and require child completion evidence |
| Session creation ignored failures while setting agent metadata or typing the command | API success even though the requested command never launched | Stop and report the first failed step; preserve the created session |
| Snapshot invalidation happened only before mutations | A concurrent read could cache pre-mutation data after invalidation | Invalidate again when the mutation response finishes |

## Remaining boundaries

- Foreground Codex observes hooks plus a bounded transcript tail. It does not
  query a complete authoritative runtime registry. Missing PostToolUse events
  can leave a tool pending; missing or changed completion records prevent green.
  A restart after observer installation is needed to establish tracking. Manual
  goal changes or specialized tool paths not emitting supported hooks are not
  fully covered. The green signal cannot certify all possible external work.
- Shared daemon/proxy adapters remain as compatibility code. The toolbar uses
  direct `codex --no-daemon`; those adapters are not used by that launch path.
- Different SSH host aliases resolving to the same machine are not canonicalized.
  Identity is the configured destination/user/port, not a DNS or SSH login probe.
- No live HPC/SSH target was contacted during this review. The SSH invariants
  were verified with simulated processes; Windows terminals were tested locally.

## Validation

Full suite: 78 server tests, 75 Python runtime tests, 9 client tests passed;
4 platform-specific tests skipped. Build/prepack passed. Regression cases cover
EOF, invalid controls, shared SSH identity, stream failure/offline latching,
failed command launch, and stale completion evidence.
