# tmuxes

- Synchronize `README.md` and `README.en.md` for user-facing changes; sync tracked `server/README.md` or use prepack. Explain intentional language-only differences.
- npm package is workspace `server`: publish with `npm publish --workspace server` only when authorized. Check `npm whoami`, registry version, and an unpublished version synchronized in root/server package.json and package-lock.json.
- Before release run npm test, pack workspace server --dry-run, inspect tarball, then CLI --help and startup --no-open on a temporary port with homepage request. Expected payload: dist/public/bin/README/LICENSE/package metadata only.
- After publish verify registry version and installed CLI. Use an OS-appropriate temporary npm cache if needed. Never persist publishing credentials in the repo or output.
- SSH/HPC: no scanning, periodic connectivity probes or repeated logins; no short forced keepalive defaults such as ServerAliveInterval=30 or reconnect/scan loops <=10 minutes.
- Reuse OpenSSH ControlMaster/ControlPath/ControlPersist where supported. Interrupted shared connections get at most one automatic reconnect; authentication failures get none. After failure stop polling, warn in UI and require manual reconnect.
- Check these SSH constraints whenever changing polling, refresh, file browsing, terminal reconnect or OpenSSH arguments.
