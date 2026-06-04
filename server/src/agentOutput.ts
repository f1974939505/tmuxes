import type { AgentKind } from './agentState.js';

interface TerminalErrorPattern {
  event: string;
  kinds?: AgentKind[];
  re: RegExp;
}

const ERROR_PATTERNS: TerminalErrorPattern[] = [
  {
    event: 'CodexStreamDisconnected',
    kinds: ['codex'],
    re: /stream disconnected before completion.*error sending request for url.*\/codex\/responses/i,
  },
  {
    event: 'StreamDisconnected',
    re: /stream disconnected before completion/i,
  },
];

function normalizeTerminalText(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyAgentTerminalError(text: string, kind: AgentKind): string | undefined {
  const normalized = normalizeTerminalText(text);
  if (!normalized) return undefined;
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.kinds && !pattern.kinds.includes(kind)) continue;
    if (pattern.re.test(normalized)) return pattern.event;
  }
  return undefined;
}
