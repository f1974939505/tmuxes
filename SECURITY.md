# Security Policy

tmuxes is a localhost-only, single-user developer tool.

It intentionally gives the browser UI access to live tmux sessions, keyboard input, and files inside a selected session's current working directory. Treat anyone who can reach the HTTP server as having shell-level access to the target machine or SSH host.

## Supported Use

- Run tmuxes only on a trusted workstation.
- The server binds to `127.0.0.1` only. Do not reverse-proxy, tunnel, port-forward, or otherwise expose it to a network.
- tmuxes has no authentication by design.
- SSH targets use your existing system `ssh` configuration, keys, and agent. tmuxes does not store SSH passwords or private keys.
- The file browser/editor is scoped to the selected tmux session's current working directory.

## Unsupported Use

- Binding to `0.0.0.0` or a LAN/public interface.
- Running tmuxes as a shared multi-user service.
- Exposing tmuxes through ngrok, cloudflared, SSH remote forwards, reverse proxies, or container port publishing.
- Treating tmuxes as a hardened remote administration system.

## Reporting a Vulnerability

Please open a private security advisory on GitHub if the repository is hosted there. If advisories are not enabled, contact the maintainer privately before publishing details.

Useful reports include:

- Steps to reproduce.
- Affected platform and Node.js version.
- Whether the issue affects local, WSL, or SSH targets.
- The expected security boundary and how it was bypassed.
