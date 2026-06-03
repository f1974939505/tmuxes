import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isValidHostAlias, parseHostSpec } from './validate.js';
import { isWindows } from './platform.js';
import { listWslDistros } from './wsl.js';
import { winShell } from './winshell/manager.js';
import { log } from './logger.js';

export interface Target {
  /** Stable, URL-safe id used in REST paths and the WS query. */
  id: string;
  kind: 'local' | 'ssh' | 'wsl' | 'winlocal';
  label: string;
  /** ssh destination host or config-alias (ssh targets only). */
  host?: string;
  /** ssh user (undefined when a ~/.ssh/config alias supplies it). */
  user?: string;
  /** ssh port (undefined when default / config supplies it). */
  port?: number;
  /** WSL distro name (wsl targets only). */
  distro?: string;
  /** Launchable shells (winlocal target only). */
  shells?: { id: string; label: string }[];
}

/** Native Windows shells (PowerShell/cmd via ConPTY). Enabled on Windows, or
 *  anywhere via TMUXES_FAKE_WINSHELL for testing the path on Linux/macOS. */
const WINSHELL_ENABLED = isWindows || !!process.env.TMUXES_FAKE_WINSHELL;

function winlocalTarget(): Target {
  return {
    id: 'winlocal',
    kind: 'winlocal',
    label: isWindows ? 'Windows (local)' : 'Local shell (fake)',
    shells: winShell.listShells(),
  };
}

const ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

export function isValidTargetId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '-');
}

const LOCAL: Target = { id: 'local', kind: 'local', label: 'Local' };

/** Best-effort, read-only parse of ~/.ssh/config Host aliases (no wildcards). */
function parseSshConfig(): Target[] {
  const path = join(homedir(), '.ssh', 'config');
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return []; // no config file is normal
  }

  const targets: Target[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^Host\s+(.+)$/i.exec(line);
    if (!m) continue;
    for (const token of m[1].split(/\s+/)) {
      // Skip wildcard / negated patterns — they aren't concrete hosts.
      if (token.includes('*') || token.includes('?') || token.startsWith('!')) continue;
      if (!isValidHostAlias(token) || seen.has(token)) continue;
      seen.add(token);
      targets.push({ id: `cfg-${slug(token)}`, kind: 'ssh', label: token, host: token });
    }
  }
  return targets;
}

/** Parse the TMUXES_HOSTS="alice@web1,bob@db2:2222" override. */
function parseEnvHosts(): Target[] {
  const env = process.env.TMUXES_HOSTS;
  if (!env) return [];
  const targets: Target[] = [];
  for (const part of env.split(',')) {
    const spec = parseHostSpec(part);
    if (!spec) {
      log.warn(`ignoring invalid TMUXES_HOSTS entry: ${part.trim()}`);
      continue;
    }
    const label = `${spec.user ? `${spec.user}@` : ''}${spec.host}${spec.port ? `:${spec.port}` : ''}`;
    targets.push({
      id: `env-${slug(label)}`,
      kind: 'ssh',
      label,
      host: spec.host,
      user: spec.user,
      port: spec.port,
    });
  }
  return targets;
}

function sshTargets(): Target[] {
  const all = [...parseEnvHosts(), ...parseSshConfig()];
  const byId = new Map<string, Target>();
  for (const t of all) if (!byId.has(t.id)) byId.set(t.id, t);
  return [...byId.values()];
}

/** The synchronous part of the target list (everything except WSL discovery). */
function baseTargets(): Target[] {
  const base: Target[] = [];
  if (WINSHELL_ENABLED) base.push(winlocalTarget());
  // Windows has no native tmux; its "local" machine is reached through WSL.
  if (!isWindows) base.push(LOCAL);
  return [...base, ...sshTargets()];
}

// Cache so the (async, Windows-only) WSL discovery doesn't run on the WS
// upgrade path. The client always GETs /api/targets first, which refreshes it.
let cachedTargets: Target[] = baseTargets();

/** Recompute the full target list, including WSL distros on Windows. */
export async function refreshTargets(): Promise<Target[]> {
  if (isWindows) {
    const distros = await listWslDistros();
    const wsl: Target[] = distros.map((name) => ({
      id: `wsl-${slug(name)}`,
      kind: 'wsl',
      label: name,
      distro: name,
    }));
    cachedTargets = [winlocalTarget(), ...wsl, ...sshTargets()];
  } else {
    cachedTargets = baseTargets();
  }
  return cachedTargets;
}

export function listTargets(): Target[] {
  return cachedTargets;
}

export function getTarget(id: string): Target | undefined {
  return cachedTargets.find((t) => t.id === id);
}

/** ssh destination string: "user@host" or just the config alias / host. */
export function sshDestination(t: Target): string {
  return t.user ? `${t.user}@${t.host}` : `${t.host}`;
}
