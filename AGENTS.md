# Agent Notes

- Keep `README.md` and `README.en.md` synchronized. When changing user-facing README content, update both language versions in the same change unless there is an explicit reason not to.
- Keep install commands, feature descriptions, requirements, FAQ entries, and changelog items aligned across both README files.
- `server/README.md` is the packaged README copy. If the root `README.md` changes and the package copy is kept in git, sync it too or run the prepack flow that copies it.
- If a README change intentionally applies to only one language, mention that explicitly in the final summary.

## SSH Safety Constraints

- Do not add SSH port scanning, periodic SSH connectivity probes, or repeated SSH login attempts against cluster/HPC targets. Repeated SSH handshakes may be classified by remote administrators as scanning or brute-force behavior.
- Do not reintroduce short forced SSH keepalive defaults such as `ServerAliveInterval=30`, and do not add any 10-minute-or-less periodic SSH reconnect/scan loop.
- SSH management commands for remote targets should reuse a long-lived OpenSSH connection through `ControlMaster`/`ControlPath`/`ControlPersist` where the platform supports it, instead of opening a new SSH connection for every refresh.
- If a shared SSH connection is interrupted, automatic recovery may try exactly one reconnect. Authentication failures must not be retried automatically.
- After the single reconnect attempt fails, pause automatic SSH polling for that target, surface a clear frontend warning, and require the user to click a manual reconnect button before trying again.
- Any future change that touches SSH polling, target refresh, file browsing over SSH, terminal reconnect, or OpenSSH argument construction must be checked against these constraints before commit and release.
