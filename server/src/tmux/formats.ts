/** tmux -F format strings + parsers.
 *
 *  tmux ESCAPES control characters in -F output (e.g. 0x1f comes back as the
 *  literal text "\037"), so we cannot use a control byte as a separator. We use
 *  a printable "|" and place the only free-form field (the name) LAST, then
 *  rejoin the remainder — robust even if a name itself contains "|", because
 *  the leading numeric fields never do. */

import { AGENT_OPTION, parseAgentValue, type AgentKind, type AgentState, type AttentionReason } from '../agentState.js';

const SEP = '|';

export const SESSION_FORMAT = [
  '#{session_windows}',
  '#{session_attached}',
  '#{session_created}',
  '#{session_activity}', // epoch from tmux; kept for display/debug
  `#{${AGENT_OPTION}}`, // agent hook state: "<kind>:<state>:<reason>:<event>:<nonce>"
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
  /** unix epoch seconds from tmux; kept for display/debug. */
  lastActivity: number;
  /** Recognized agent whose hooks are driving status. */
  agentKind?: AgentKind;
  /** Agent lifecycle state from official hooks. */
  agentState?: AgentState;
  /** Why this session is asking for attention, when known. */
  attentionReason?: AttentionReason;
  /** Hook event that last updated the state. */
  agentEvent?: string;
  /** Monotonic-ish event token for client edge detection. */
  agentNonce?: string;
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
      const agent = parseAgentValue(parts[4] || '');
      return {
        windows: Number(parts[0]) || 0,
        attached: Number(parts[1]) > 0,
        created: Number(parts[2]) || 0,
        lastActivity: Number(parts[3]) || 0,
        ...agent,
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
