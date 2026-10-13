import type { Target } from './targets.js';
import { sshDestination } from './targets.js';
import { commandArgv } from './tmux/builder.js';
import { runTargetCommand } from './targetCommand.js';
import { TmuxError } from './tmux/sessions.js';

export interface AgentMessage { id: string; role: 'user' | 'assistant'; markdown: string; truncated?: boolean; before?: string | null; after?: string }
export interface AgentMessages {
  availability: 'ready' | 'unavailable' | 'unsupported'; source: string | null;
  messages: AgentMessage[]; before?: string; after?: string; reset?: boolean; limited?: boolean; cwd?: string;
}
const pending = new Map<string, Promise<AgentMessages>>();

/** One-way, on-demand reading. No connection creation, transcript logging or disk cache. */
export function readAgentMessages(target: Target, session: string, cursor: string | undefined, direction: 'newer' | 'older'): Promise<AgentMessages> {
  const destination = target.kind === 'ssh' ? `${sshDestination(target)}:${target.port ?? 22}` : target.id;
  const key = JSON.stringify([destination, session, cursor, direction]);
  const existing = pending.get(key);
  if (existing) return existing;
  if (pending.size >= 32) return Promise.reject(new TmuxError(429, 'Too many concurrent reading requests.'));
  const work = (async () => {
    const script = 'if [ -f "$HOME/.local/share/tmuxes/observer/native.py" ]; then python3 "$HOME/.local/share/tmuxes/observer/native.py" messages "$1" "$2" "$3"; else printf \'{"availability":"unavailable","source":null,"messages":[]}\\n\'; fi';
    const r = await runTargetCommand(target, opts => commandArgv(target,
      ['sh', '-c', script, 'tmuxes-messages', session, cursor ?? '', direction], opts), { timeoutMs: 15_000, memoryOnly: true });
    if (r.code !== 0) throw new TmuxError(r.code === 255 ? 503 : 502, 'Reading unavailable. Update the agent integration or reconnect the target manually.');
    // Old collectors do not implement this subcommand. Never interpret their
    // output as an empty successful conversation.
    if (!r.stdout.trim()) return { availability: 'unavailable', source: null, messages: [] } as AgentMessages;
    const data = JSON.parse(r.stdout) as AgentMessages;
    if (!['ready', 'unavailable', 'unsupported'].includes(data.availability) || !Array.isArray(data.messages) || r.stdout.length > 8 * 1024 * 1024) {
      throw new TmuxError(502, 'Unsupported reading response.');
    }
    return data;
  })();
  pending.set(key, work);
  void work.finally(() => pending.delete(key)).catch(() => {});
  return work;
}
