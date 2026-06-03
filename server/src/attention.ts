/** Heuristic classification of an agent's recent terminal output, used to turn
 *  "this session went idle" into a meaningful notification: is the agent waiting
 *  for a decision (a prompt on screen), or did it simply finish / go quiet?
 *
 *  This is intentionally fuzzy — it scans the tail of the pane for the prompt
 *  shapes the common CLI agents (Claude Code, Codex, OpenCode, Hermes) and
 *  ordinary shells use when they want input. False positives just mean a
 *  "decision" badge instead of a "done" badge; both still notify. */

export type AttentionReason = 'decision' | 'done';

export interface AttentionPeek {
  reason: AttentionReason;
  /** A few trailing lines of plain text, handy for a tooltip. */
  tail: string;
}

/** Strip ANSI/VT escapes so the regex matches plain text (capture-pane is
 *  already plain, but winshell scrollback carries raw escapes). */
export function stripAnsi(s: string): string {
  return s
    // CSI sequences: ESC [ ... final-byte
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    // OSC sequences: ESC ] ... (BEL | ESC \)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // Other two-byte escapes
    .replace(/\x1b[@-Z\\-_]/g, '');
}

/** Prompts that mean "the agent/shell is waiting on the user". */
const DECISION_RE = new RegExp(
  [
    '\\(y/n\\)',
    '\\[y/n\\]',
    '\\(yes/no\\)',
    '\\by/N\\b',
    '\\bN/y\\b',
    'press enter to',
    'do you want',
    'would you like',
    'proceed\\?',
    '\\bapprove\\b',
    '\\ballow\\b[^?\\n]*\\?',
    '\\bconfirm\\b',
    'continue\\?',
    'overwrite\\?',
    'waiting for (?:your|input)',
    'select an option',
    '\\bchoose\\b',
    '❯\\s*\\d', // Claude/OpenCode arrow-selected numbered choices
    '»\\s*\\d',
    '\\b\\d\\.\\s*(?:yes|no)\\b',
  ].join('|'),
  'i',
);

export function classifyTail(text: string): AttentionReason {
  return DECISION_RE.test(stripAnsi(text)) ? 'decision' : 'done';
}

/** Last N non-empty lines of stripped text, trimmed for display. */
export function lastLines(text: string, n: number): string {
  const lines = stripAnsi(text)
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.length > 0);
  return lines.slice(-n).join('\n').slice(0, 500);
}
