import net from 'node:net';

// This plugin is injected for this launch only. No project/global config edits.
export const TmuxesPlugin = async ({ client }) => {
  const path = process.env.TMUXES_EVENT_SOCKET;
  if (!path) return {};
  let root;
  let generation = 0;
  const parents = new Map();
  const tools = new Set();
  const tasks = new Set();
  let uncertainBackground = false;
  let queue = Promise.resolve();
  const emit = (type, data = {}) => new Promise((resolve) => {
    const sock = net.createConnection(path);
    sock.setTimeout(500);
    sock.on('connect', () => sock.end(JSON.stringify({ type, event: 'OpenCodePlugin', ...data }) + '\n'));
    sock.on('error', () => resolve());
    sock.on('timeout', () => { sock.destroy(); resolve(); });
    sock.on('close', () => resolve());
  });
  const info = async (id) => {
    if (!parents.has(id)) {
      const result = await client.session.get({ path: { id } });
      if (result.error || !result.data) throw new Error('Session metadata unavailable');
      parents.set(id, result.data.parentID || null);
    }
    return parents.get(id);
  };
  const related = async (id) => {
    let cur = id;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      if (cur === root) return true;
      seen.add(cur);
      cur = await info(cur);
    }
    return false;
  };
  const settle = async () => {
    const epoch = generation;
    const statuses = await client.session.status();
    if (statuses.error || !statuses.data) throw new Error('Status unavailable');
    const ids = new Set(tasks);
    for (const [id, status] of Object.entries(statuses.data)) {
      if (id !== root && status.type !== 'idle' && await related(id)) ids.add('child:' + id);
      if (id === root && status.type !== 'idle') return;
    }
    if (epoch !== generation) return;
    await emit('tasks', { ids: [...ids], known: !uncertainBackground && tools.size === 0 });
    await emit('stop', { known: !uncertainBackground && tools.size === 0 });
  };
  const handle = async ({ type, properties: p = {} }) => {
    const id = p.sessionID || p.info?.sessionID || p.part?.sessionID;
    if (!id) return;
    const parent = await info(id);
    if (type === 'session.status' && p.status?.type === 'busy' && !parent) {
      if (root !== id) { tools.clear(); tasks.clear(); uncertainBackground = false; }
      root = id;
      generation++;
      await emit('start');
    }
    if (!root || !await related(id)) return;
    if (type === 'session.error' && id === root) {
      if (p.error?.name === 'MessageAbortedError') await emit('interrupted');
      else await emit('error');
    } else if (type === 'session.status') {
      if (p.status?.type === 'retry' && id === root) await emit('activity');
      if (id !== root) {
        await emit(p.status?.type === 'idle' ? 'task.end' : 'task.start', { id: 'child:' + id });
      } else if (p.status?.type === 'idle') await settle();
    } else if (type === 'permission.asked' || type === 'question.asked') {
      await emit('decision.open', { id: p.id });
    } else if (['permission.replied', 'question.replied', 'question.rejected'].includes(type)) {
      await emit('decision.close', { id: p.requestID });
    } else if (type === 'message.part.updated' && p.part?.type === 'tool') {
      const part = p.part;
      const key = id + ':' + part.callID;
      const status = part.state?.status;
      if (status === 'pending' || status === 'running') tools.add(key);
      else tools.delete(key);
      // Third-party tools can detach work that OpenCode's session status cannot
      // describe. Never infer quiescence from their output text.
      if (part.state?.input?.background === true || part.state?.input?.run_in_background === true) {
        uncertainBackground = true;
        tasks.add('background:' + key);
      }
    }
  };
  return {
    event: ({ event }) => {
      queue = queue.then(() => handle(event)).catch(() => emit('unknown'));
      return queue;
    },
  };
};
