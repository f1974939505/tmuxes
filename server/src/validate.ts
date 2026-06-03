/**
 * Allowlist validation. Every value that reaches a spawned tmux/ssh argv is
 * checked here first. We never spawn a shell (argv arrays + shell:false), so
 * this is defense-in-depth, but it also keeps tmux target syntax sane.
 */

// '.' and ':' are tmux target delimiters (session:window.pane) — forbidden in names.
const SESSION_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const HOST_RE = /^[A-Za-z0-9._-]{1,255}$/;
const USER_RE = /^[A-Za-z0-9._-]{1,64}$/;
// ssh_config Host aliases: word chars, dots, hyphens (no wildcards/spaces).
const HOST_ALIAS_RE = /^[A-Za-z0-9._-]{1,255}$/;

export function isValidSessionName(name: unknown): name is string {
  return typeof name === 'string' && SESSION_NAME_RE.test(name);
}

export function isValidHost(host: unknown): host is string {
  return typeof host === 'string' && HOST_RE.test(host);
}

export function isValidUser(user: unknown): user is string {
  return typeof user === 'string' && USER_RE.test(user);
}

export function isValidHostAlias(alias: unknown): alias is string {
  return typeof alias === 'string' && HOST_ALIAS_RE.test(alias);
}

export function isValidPort(port: unknown): port is number {
  return (
    typeof port === 'number' &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535
  );
}

/** Terminal geometry sent by clients. */
export function isValidDimension(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 1000;
}

export interface HostSpec {
  user?: string;
  host: string;
  port?: number;
}

/**
 * Parse a "user@host:port" spec (used by the TMUXES_HOSTS env override).
 * Returns null if any component is invalid.
 */
export function parseHostSpec(spec: string): HostSpec | null {
  const trimmed = spec.trim();
  if (!trimmed) return null;

  let user: string | undefined;
  let rest = trimmed;
  const at = rest.indexOf('@');
  if (at !== -1) {
    user = rest.slice(0, at);
    rest = rest.slice(at + 1);
    if (!isValidUser(user)) return null;
  }

  let port: number | undefined;
  const colon = rest.indexOf(':');
  if (colon !== -1) {
    const portStr = rest.slice(colon + 1);
    rest = rest.slice(0, colon);
    const parsed = Number(portStr);
    if (!isValidPort(parsed)) return null;
    port = parsed;
  }

  if (!isValidHost(rest)) return null;
  return { user, host: rest, port };
}
