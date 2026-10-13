import type { AgentMessage } from './types';

/** Limit retained text to roughly 8 MiB of UTF-16 and 500 messages. */
export function mergeMessages(previous: AgentMessage[], incoming: AgentMessage[], older: boolean) {
  const unique = new Map((older ? [...incoming, ...previous] : [...previous, ...incoming]).map(m => [m.id, m]));
  const messages = [...unique.values()];
  let chars = messages.reduce((sum, m) => sum + m.markdown.length, 0), trimmed = false;
  while (messages.length > 500 || chars > 4 * 1024 * 1024) {
    const removed = older ? messages.pop()! : messages.shift()!;
    chars -= removed.markdown.length; trimmed = true;
  }
  return { messages, trimmed };
}
