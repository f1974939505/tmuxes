import type { SshState } from './protocol.js';

/**
 * Classify ssh failure/prompt states from PTY output so the UI can show
 * something better than a black screen. Best-effort string matching on the
 * raw ssh client output.
 */
const MATCHERS: { state: SshState; re: RegExp; message: string }[] = [
  {
    state: 'hostkey',
    re: /authenticity of host|fingerprint|known_hosts|REMOTE HOST IDENTIFICATION HAS CHANGED/i,
    message: 'Unknown or changed host key — verify the host in a regular terminal first.',
  },
  {
    state: 'authfail',
    re: /permission denied|too many authentication failures|no such identity|authentication failed/i,
    message: 'SSH authentication failed — check your keys / ssh-agent.',
  },
  {
    state: 'refused',
    re: /connection refused|could not resolve hostname|name or service not known|no route to host/i,
    message: 'Could not connect to the host (refused / unresolved).',
  },
  {
    state: 'timeout',
    re: /connection timed out|operation timed out|timed out waiting/i,
    message: 'Connection timed out.',
  },
];

export function classifySsh(text: string): { state: SshState; message: string } | null {
  for (const m of MATCHERS) {
    if (m.re.test(text)) return { state: m.state, message: m.message };
  }
  return null;
}
