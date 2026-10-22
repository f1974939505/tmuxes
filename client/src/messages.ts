import type { AgentMessage } from './types';

/** A movable window, not a history limit: callers retain the evicted edge's
 * cursor so every older page remains reachable. Keep an individual large
 * message intact even when it exceeds the normal window budget. */
export function mergeMessages(previous: AgentMessage[], incoming: AgentMessage[], older: boolean) {
  const unique = new Map((older ? [...incoming, ...previous] : [...previous, ...incoming]).map(m => [m.id, m]));
  const messages = [...unique.values()];
  let chars = messages.reduce((sum, m) => sum + m.markdown.length, 0), trimmed = false;
  while (messages.length > 1 && (messages.length > 500 || chars > 4 * 1024 * 1024)) {
    const removed = older ? messages.pop()! : messages.shift()!;
    chars -= removed.markdown.length; trimmed = true;
  }
  return { messages, trimmed };
}
