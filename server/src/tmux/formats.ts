/** tmux -F format strings + parsers.
 *
 *  tmux ESCAPES control characters in -F output (e.g. 0x1f comes back as the
 *  literal text "\037"), so we cannot use a control byte as a separator. We use
 *  a printable "|" and place the only free-form field (the name) LAST, then
 *  rejoin the remainder — robust even if a name itself contains "|", because
 *  the leading numeric fields never do. */

const SEP = '|';

export const SESSION_FORMAT = [
  '#{session_windows}',
  '#{session_attached}',
  '#{session_created}',
  '#{session_activity}', // epoch of last activity in any window (winlocal idle fallback)
  '#{@tmuxes_attn}', // attention event set by an agent hook: "<reason>:<nonce>" (or empty)
  '#{session_name}', // free-form → must be last
].join(SEP);

export const WINDOW_FORMAT = [
  '#{window_index}',
  '#{window_panes}',
  '#{window_active}',
  '#{window_name}', // free-form → must be last
].join(SEP);

export interface SessionInfo {
  name: string;
  windows: number;
  attached: boolean;
  /** unix epoch seconds */
  created: number;
  /** epoch seconds of last output activity (drives idle/attention detection) */
  lastActivity: number;
  /** Seconds idle since we last observed activity change. Filled by the monitor. */
  idleSeconds?: number;
  /** True once we've observed this session produce output during this watch. */
  observedActive?: boolean;
  /** Attention event from an agent hook — "<reason>:<nonce>", empty if unset. */
  attn?: string;
}

export interface WindowInfo {
  index: number;
  name: string;
  panes: number;
  active: boolean;
}

export function parseSessions(stdout: string): SessionInfo[] {
  return stdout
    .split('\n')
    .filter((l) => l.length > 0)
    .map((line) => {
      const parts = line.split(SEP);
      return {
        windows: Number(parts[0]) || 0,
        attached: Number(parts[1]) > 0,
        created: Number(parts[2]) || 0,
        lastActivity: Number(parts[3]) || 0,
        attn: parts[4] || '',
        name: parts.slice(5).join(SEP), // name may legitimately contain "|"
      };
    })
    .filter((s) => s.name);
}

export function parseWindows(stdout: string): WindowInfo[] {
  return stdout
    .split('\n')
    .filter((l) => l.length > 0)
    .map((line) => {
      const parts = line.split(SEP);
      return {
        index: Number(parts[0]) || 0,
        panes: Number(parts[1]) || 0,
        active: Number(parts[2]) > 0,
        name: parts.slice(3).join(SEP),
      };
    });
}

/** stderr patterns that mean "no sessions" rather than a real error. */
const EMPTY_RE = /no server running|no sessions|error connecting to/i;

export function isEmptySessionsError(stderr: string): boolean {
  return EMPTY_RE.test(stderr);
}
