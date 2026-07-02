import { Router, type Request, type Response, type NextFunction } from 'express';
import { getTarget, isValidTargetId, refreshTargets, type Target } from '../targets.js';
import { isValidSessionName } from '../validate.js';
import {
  TmuxError,
  listSessions,
  createSession,
  renameSession,
  killSession,
  listWindows,
  launchAgentInSession,
  type LaunchAgent,
} from '../tmux/sessions.js';
import { annotate } from '../monitor.js';
import {
  getSessionCwd,
  listDirectory,
  listSessionDirectory,
  readFilePreview,
  resolveScopedPath,
  writeFile,
} from '../files.js';
import {
  checkoutSessionGit,
  commitSessionGit,
  fetchSessionGit,
  getSessionGitCommit,
  getSessionGitDiff,
  getSessionGitState,
  pullSessionGit,
  pushSessionGit,
  syncSessionGit,
} from '../git.js';
import { readFolders, writeFolders } from '../foldersStore.js';
import { winShell, ManagerError } from '../winshell/manager.js';

/** Cap on a saved file's size (matches the editor's text-only use). */
const MAX_WRITE_BYTES = 5_000_000;

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;

const wrap =
  (fn: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

/** Resolve :id → Target or throw a TmuxError with the right status. */
function requireTarget(req: Request): Target {
  const id = req.params.id;
  if (!isValidTargetId(id)) throw new TmuxError(400, 'invalid target id');
  const target = getTarget(id);
  if (!target) throw new TmuxError(404, 'target not found');
  return target;
}

function requireSessionName(raw: unknown): string {
  if (!isValidSessionName(raw)) throw new TmuxError(400, 'invalid session name');
  return raw;
}

function requireLaunchAgent(raw: unknown): LaunchAgent {
  if (raw === 'claude' || raw === 'codex') return raw;
  throw new TmuxError(400, 'invalid agent');
}

/** A filesystem path supplied via query. Passed as a single argv element (no
 *  shell), so we only sanity-check shape, not contents — this app already
 *  grants full shell access on the target by design. */
function requirePath(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096 || raw.includes('\0')) {
    throw new TmuxError(400, 'invalid path');
  }
  return raw;
}

async function requireSessionScopedPath(
  target: Target,
  session: unknown,
  path: unknown,
  opts: { forWrite?: boolean } = {},
): Promise<string> {
  const name = requireSessionName(session);
  const rawPath = requirePath(path);
  const cwd = await getSessionCwd(target, name);
  return resolveScopedPath(target, cwd, rawPath, opts);
}

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true });
});

apiRouter.get(
  '/targets',
  wrap(async (_req, res) => {
    // Re-discover (WSL distros / ssh config can change between loads).
    res.json({ targets: await refreshTargets() });
  }),
);

apiRouter.get(
  '/targets/:id/sessions',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    const sessions = target.kind === 'winlocal' ? winShell.list() : await listSessions(target);
    res.json({ sessions: annotate(target.id, sessions) });
  }),
);

apiRouter.post(
  '/targets/:id/sessions',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    const body = (req.body ?? {}) as { name?: unknown; command?: unknown; shell?: unknown };

    const name = body.name === undefined || body.name === '' ? undefined : body.name;
    if (name !== undefined && !isValidSessionName(name)) {
      throw new TmuxError(400, 'invalid session name');
    }
    const command =
      typeof body.command === 'string' && body.command.length > 0 ? body.command : undefined;

    if (target.kind === 'winlocal') {
      const shellId = typeof body.shell === 'string' ? body.shell : undefined;
      res.status(201).json(winShell.create({ name, shellId, command }));
      return;
    }

    const result = await createSession(target, { name, command });
    res.status(201).json(result);
  }),
);

apiRouter.patch(
  '/targets/:id/sessions/:name',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    const name = requireSessionName(req.params.name);
    const newName = (req.body ?? {}).newName;
    if (!isValidSessionName(newName)) throw new TmuxError(400, 'invalid new session name');
    if (target.kind === 'winlocal') {
      winShell.rename(name, newName);
      res.json({ name: newName });
      return;
    }
    await renameSession(target, name, newName);
    res.json({ name: newName });
  }),
);

apiRouter.post(
  '/targets/:id/sessions/:name/agent',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    if (target.kind === 'winlocal') throw new TmuxError(400, 'agent hooks require a tmux target');
    const name = requireSessionName(req.params.name);
    const agent = requireLaunchAgent((req.body ?? {}).agent);
    await launchAgentInSession(target, name, agent);
    res.json({ ok: true });
  }),
);

apiRouter.delete(
  '/targets/:id/sessions/:name',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    const name = requireSessionName(req.params.name);
    if (target.kind === 'winlocal') {
      winShell.kill(name);
      res.status(204).end();
      return;
    }
    await killSession(target, name);
    res.status(204).end();
  }),
);

apiRouter.get(
  '/targets/:id/sessions/:name/windows',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    const name = requireSessionName(req.params.name);
    if (target.kind === 'winlocal') {
      res.json({ windows: winShell.windows(name) });
      return;
    }
    res.json({ windows: await listWindows(target, name) });
  }),
);

/** Cwd-scoped features rely on tmux's pane cwd; native Windows shells have none. */
function rejectIfWinlocal(target: Target, feature = 'file browsing'): void {
  if (target.kind === 'winlocal') {
    throw new TmuxError(400, `${feature} is not available for native shell sessions`);
  }
}

// --- File browser (current pane cwd + directory listing + file preview) ---

apiRouter.get(
  '/targets/:id/sessions/:name/cwd',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target);
    const name = requireSessionName(req.params.name);
    res.json({ cwd: await getSessionCwd(target, name) });
  }),
);

apiRouter.get(
  '/targets/:id/files',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target);
    const path = await requireSessionScopedPath(target, req.query.session, req.query.path);
    res.json({ path, entries: await listDirectory(target, path) });
  }),
);

apiRouter.get(
  '/targets/:id/sessions/:name/files',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target);
    const name = requireSessionName(req.params.name);
    const rawPath = req.query.path;
    const path = rawPath === undefined ? undefined : requirePath(rawPath);
    res.json(await listSessionDirectory(target, name, path));
  }),
);

apiRouter.get(
  '/targets/:id/file',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target);
    const path = await requireSessionScopedPath(target, req.query.session, req.query.path);
    res.json(await readFilePreview(target, path));
  }),
);

apiRouter.put(
  '/targets/:id/file',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target);
    const body = (req.body ?? {}) as { session?: unknown; path?: unknown; content?: unknown };
    const path = await requireSessionScopedPath(target, body.session, body.path, { forWrite: true });
    if (typeof body.content !== 'string') throw new TmuxError(400, 'content must be a string');
    if (Buffer.byteLength(body.content, 'utf8') > MAX_WRITE_BYTES) {
      throw new TmuxError(413, 'file too large to save');
    }
    await writeFile(target, path, body.content);
    res.json({ ok: true });
  }),
);

// --- Git panel (current pane cwd + repository status/actions) ---

apiRouter.get(
  '/targets/:id/sessions/:name/git',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target, 'Git');
    const name = requireSessionName(req.params.name);
    res.json(await getSessionGitState(target, name));
  }),
);

apiRouter.post(
  '/targets/:id/sessions/:name/git/fetch',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target, 'Git');
    const name = requireSessionName(req.params.name);
    res.json(await fetchSessionGit(target, name));
  }),
);

apiRouter.post(
  '/targets/:id/sessions/:name/git/pull',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target, 'Git');
    const name = requireSessionName(req.params.name);
    res.json(await pullSessionGit(target, name));
  }),
);

apiRouter.post(
  '/targets/:id/sessions/:name/git/push',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target, 'Git');
    const name = requireSessionName(req.params.name);
    res.json(await pushSessionGit(target, name));
  }),
);

apiRouter.post(
  '/targets/:id/sessions/:name/git/sync',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target, 'Git');
    const name = requireSessionName(req.params.name);
    res.json(await syncSessionGit(target, name));
  }),
);

apiRouter.post(
  '/targets/:id/sessions/:name/git/checkout',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target, 'Git');
    const name = requireSessionName(req.params.name);
    const branch = (req.body ?? {}).branch;
    if (typeof branch !== 'string') throw new TmuxError(400, 'branch must be a string');
    res.json(await checkoutSessionGit(target, name, branch));
  }),
);

apiRouter.get(
  '/targets/:id/sessions/:name/git/diff',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target, 'Git');
    const name = requireSessionName(req.params.name);
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    const staged = req.query.staged === '1' || req.query.staged === 'true';
    res.json(await getSessionGitDiff(target, name, path, staged));
  }),
);

apiRouter.get(
  '/targets/:id/sessions/:name/git/commit/:hash',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target, 'Git');
    const name = requireSessionName(req.params.name);
    const hash = typeof req.params.hash === 'string' ? req.params.hash : '';
    res.json(await getSessionGitCommit(target, name, hash));
  }),
);

apiRouter.post(
  '/targets/:id/sessions/:name/git/commit',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    rejectIfWinlocal(target, 'Git');
    const name = requireSessionName(req.params.name);
    const message = (req.body ?? {}).message;
    res.json(await commitSessionGit(target, name, message));
  }),
);

// --- Sidebar folder organization, persisted on the target (syncs clients) ---

apiRouter.get(
  '/targets/:id/folders',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    res.json(await readFolders(target));
  }),
);

apiRouter.put(
  '/targets/:id/folders',
  wrap(async (req, res) => {
    const target = requireTarget(req);
    const body = req.body as { folders?: unknown; assign?: unknown };
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !Array.isArray(body.folders) ||
      typeof body.assign !== 'object' ||
      body.assign === null
    ) {
      throw new TmuxError(400, 'invalid folders payload');
    }
    await writeFolders(target, {
      folders: body.folders,
      assign: body.assign as Record<string, unknown>,
    });
    res.json({ ok: true });
  }),
);

// Central error mapper.
apiRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof TmuxError || err instanceof ManagerError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'internal error';
  res.status(500).json({ error: message });
});
