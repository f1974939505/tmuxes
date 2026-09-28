import { describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

describe('OpenCode event adapter', () => {
  it('separates root completion, child work, decisions, and unknown background tools', async () => {
    const path = process.platform === 'win32' ? `\\\\.\\pipe\\tmuxes-test-${randomUUID()}` : join(tmpdir(), `tmuxes-${randomUUID()}.sock`);
    const events: { type: string; known?: boolean; ids?: string[]; id?: string }[] = [];
    const server = createServer((socket) => {
      let text = '';
      socket.on('data', (chunk) => { text += chunk.toString(); });
      socket.on('end', () => { events.push(JSON.parse(text)); });
    });
    await new Promise<void>((resolve) => server.listen(path, resolve));
    const old = process.env.TMUXES_EVENT_SOCKET;
    process.env.TMUXES_EVENT_SOCKET = path;
    try {
      const source = fileURLToPath(new URL('../src/agentRuntime/opencode.mjs', import.meta.url));
      const { TmuxesPlugin } = await import(/* @vite-ignore */ pathToFileURL(source).href);
      let statuses = {};
      const client = { session: {
        get: async ({ path: { id } }: { path: { id: string } }) => ({ data: { id, parentID: id === 'child' ? 'root' : null } }),
        status: async () => ({ data: statuses }),
      } };
      const plugin = await TmuxesPlugin({ client });
      const event = (type: string, properties: Record<string, unknown>) => plugin.event({ event: { type, properties } });
      await event('session.status', { sessionID: 'root', status: { type: 'busy' } });
      await event('permission.asked', { sessionID: 'root', id: 'approval' });
      await event('permission.replied', { sessionID: 'root', requestID: 'approval' });
      expect(events.slice(-2).map((e) => [e.type, e.id])).toEqual([['decision.open', 'approval'], ['decision.close', 'approval']]);
      statuses = { child: { type: 'busy' } };
      await event('session.status', { sessionID: 'root', status: { type: 'idle' } });
      expect(events.at(-2)?.ids).toEqual(['child:child']);
      const count = events.filter((e) => e.type === 'stop').length;
      await event('session.status', { sessionID: 'child', status: { type: 'idle' } });
      expect(events.filter((e) => e.type === 'stop')).toHaveLength(count);
      statuses = {};
      await event('message.part.updated', { part: { type: 'tool', sessionID: 'root', callID: 'monitor', state: { status: 'completed', input: { background: true } } } });
      await event('session.status', { sessionID: 'root', status: { type: 'idle' } });
      expect(events.at(-1)).toMatchObject({ type: 'stop', known: false });
    } finally {
      if (old === undefined) delete process.env.TMUXES_EVENT_SOCKET;
      else process.env.TMUXES_EVENT_SOCKET = old;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
