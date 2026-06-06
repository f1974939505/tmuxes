# Agent Notes

- Keep `README.md` and `README.en.md` synchronized. When changing user-facing README content, update both language versions in the same change unless there is an explicit reason not to.
- Keep install commands, feature descriptions, requirements, FAQ entries, and changelog items aligned across both README files.
- `server/README.md` is the packaged README copy. If the root `README.md` changes and the package copy is kept in git, sync it too or run the prepack flow that copies it.
- If a README change intentionally applies to only one language, mention that explicitly in the final summary.

## npm Publishing Constraints

- The publishable npm package is the `server` workspace. Publish with `npm publish --workspace server`; do not publish the root monorepo package by accident.
- Never commit or paste personal publishing material into this repo, including `.npmrc` auth lines, npm tokens, `NPM_TOKEN` values, one-time passwords, SSH private keys, or registry credentials. Use the local `npm login` session, a prompt, or a CI secret store instead.
- Before publishing, confirm the active npm identity with `npm whoami`, check the current registry version with `npm view tmuxes version`, and bump `package.json`, `server/package.json`, and `package-lock.json` to an unpublished semver version.
- Run `npm test`, `npm --cache /tmp/npm-cache pack --workspace server --dry-run`, and inspect the tarball contents. The package should contain `dist`, `public`, `bin`, `README.md`, `LICENSE`, and `package.json` metadata only; it must not contain source-only workspace files, local caches, logs, or secrets.
- Validate the CLI before and after publish. At minimum run `npm exec --yes --package <tarball-or-tmuxes@latest> -- tmuxes --help`; for a startup smoke test, run with `--no-open --port <temporary-port>` and request the local homepage.
- If `~/.npm` is not writable in the current environment, use a temporary npm cache such as `/tmp/npm-cache`. Do not add cache directories to the repository.
- After publishing, verify `npm view tmuxes version` and run `npm exec --yes --package tmuxes@latest -- tmuxes --help` before announcing the release.

## SSH Safety Constraints

- Do not add SSH port scanning, periodic SSH connectivity probes, or repeated SSH login attempts against cluster/HPC targets. Repeated SSH handshakes may be classified by remote administrators as scanning or brute-force behavior.
- Do not reintroduce short forced SSH keepalive defaults such as `ServerAliveInterval=30`, and do not add any 10-minute-or-less periodic SSH reconnect/scan loop.
- SSH management commands for remote targets should reuse a long-lived OpenSSH connection through `ControlMaster`/`ControlPath`/`ControlPersist` where the platform supports it, instead of opening a new SSH connection for every refresh.
- If a shared SSH connection is interrupted, automatic recovery may try exactly one reconnect. Authentication failures must not be retried automatically.
- After the single reconnect attempt fails, pause automatic SSH polling for that target, surface a clear frontend warning, and require the user to click a manual reconnect button before trying again.
- Any future change that touches SSH polling, target refresh, file browsing over SSH, terminal reconnect, or OpenSSH argument construction must be checked against these constraints before commit and release.
