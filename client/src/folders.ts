import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/** A virtual folder used to organize tmux sessions in the sidebar tree.
 *  Stored ON THE TARGET (server: $HOME/.config/tmuxes/folders.json) so the tree
 *  follows the cluster and syncs across browsers/machines. localStorage is kept
 *  only as an offline cache + one-time migration source. */
export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
}

interface TargetFolders {
  folders: FolderNode[];
  /** sessionName -> folderId (only non-root assignments are stored). */
  assign: Record<string, string>;
}

const EMPTY: TargetFolders = { folders: [], assign: {} };
const CACHE_KEY = 'tmuxes.folders';
const POLL_MS = 15_000;
const SAVE_DEBOUNCE_MS = 350;

type Cache = Record<string, TargetFolders>;

function loadCacheStore(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Cache;
  } catch {
    return {};
  }
}
function loadCache(targetId: string): TargetFolders {
  return loadCacheStore()[targetId] ?? EMPTY;
}
function saveCache(targetId: string, slice: TargetFolders): void {
  const store = loadCacheStore();
  store[targetId] = slice;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function isEmpty(s: TargetFolders): boolean {
  return s.folders.length === 0 && Object.keys(s.assign).length === 0;
}
function sameJson(a: TargetFolders, b: TargetFolders): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function coerce(payload: { folders: unknown[]; assign: Record<string, unknown> }): TargetFolders {
  return { folders: payload.folders as FolderNode[], assign: payload.assign as Record<string, string> };
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `f-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

/** True if `maybeAncestor` is `node` or an ancestor of `node` (cycle guard). */
function isAncestor(folders: FolderNode[], maybeAncestor: string, node: string | null): boolean {
  let cur = node;
  while (cur) {
    if (cur === maybeAncestor) return true;
    cur = folders.find((f) => f.id === cur)?.parentId ?? null;
  }
  return false;
}

export interface FoldersApi {
  folders: FolderNode[];
  folderOf: (sessionName: string) => string | null;
  addFolder: (parentId: string | null) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  moveSession: (sessionName: string, folderId: string | null) => void;
  moveFolder: (id: string, parentId: string | null) => void;
}

export function useFolders(targetId: string, enabled: boolean, pauseOnError = false): FoldersApi {
  const [slice, setSlice] = useState<TargetFolders>(() => loadCache(targetId));
  const sliceRef = useRef(slice);
  const pendingSave = useRef(false);
  const pollingPaused = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);

  const applySlice = useCallback((next: TargetFolders) => {
    sliceRef.current = next;
    setSlice(next);
  }, []);

  const saveToServer = useCallback(
    (data: TargetFolders) => {
      pendingSave.current = true;
      return api
        .saveFolders(targetId, { folders: data.folders, assign: data.assign })
        .then(() => {
          pollingPaused.current = false;
          saveCache(targetId, data);
        })
        .catch(() => {
          if (pauseOnError) pollingPaused.current = true;
          /* offline / host down — cache keeps it; retried on next change */
        })
        .finally(() => {
          pendingSave.current = false;
        });
    },
    [targetId, pauseOnError],
  );

  // Load from the target on open (with localStorage migration + cache fallback).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    pollingPaused.current = false;
    const cached = loadCache(targetId);
    applySlice(cached);
    api
      .getFolders(targetId)
      .then((payload) => {
        if (cancelled) return;
        const remote = coerce(payload);
        if (isEmpty(remote) && !isEmpty(cached)) {
          // First run on the server side — push existing local folders up.
          applySlice(cached);
          void saveToServer(cached);
        } else {
          applySlice(remote);
          saveCache(targetId, remote);
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (pauseOnError) pollingPaused.current = true;
        /* keep cache */
      });
    return () => {
      cancelled = true;
    };
  }, [targetId, enabled, applySlice, saveToServer]);

  // Light poll so changes from another browser/machine show up here too.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (pollingPaused.current) return;
      if (pendingSave.current) return;
      api
        .getFolders(targetId)
        .then((payload) => {
          if (pendingSave.current) return;
          const remote = coerce(payload);
          if (!sameJson(remote, sliceRef.current)) {
            applySlice(remote);
            saveCache(targetId, remote);
          }
        })
        .catch(() => {
          if (pauseOnError) pollingPaused.current = true;
          /* transient — keep current */
        });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [targetId, enabled, pauseOnError, applySlice]);

  const update = useCallback(
    (fn: (prev: TargetFolders) => TargetFolders) => {
      const next = fn(sliceRef.current);
      applySlice(next);
      saveCache(targetId, next);
      pendingSave.current = true; // block poll clobber until the save lands
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void saveToServer(next), SAVE_DEBOUNCE_MS);
    },
    [targetId, applySlice, saveToServer],
  );

  const folderOf = useCallback(
    (sessionName: string): string | null => {
      const id = slice.assign[sessionName];
      if (id && slice.folders.some((f) => f.id === id)) return id;
      return null;
    },
    [slice],
  );

  const addFolder = useCallback(
    (parentId: string | null) =>
      update((p) => ({ ...p, folders: [...p.folders, { id: newId(), name: 'New folder', parentId }] })),
    [update],
  );

  const renameFolder = useCallback(
    (id: string, name: string) =>
      update((p) => ({ ...p, folders: p.folders.map((f) => (f.id === id ? { ...f, name } : f)) })),
    [update],
  );

  const deleteFolder = useCallback(
    (id: string) =>
      update((p) => {
        const target = p.folders.find((f) => f.id === id);
        const parent = target?.parentId ?? null;
        const folders = p.folders
          .filter((f) => f.id !== id)
          .map((f) => (f.parentId === id ? { ...f, parentId: parent } : f));
        const assign: Record<string, string> = {};
        for (const [name, fid] of Object.entries(p.assign)) {
          const moved = fid === id ? (parent ?? '') : fid;
          if (moved) assign[name] = moved;
        }
        return { folders, assign };
      }),
    [update],
  );

  const moveSession = useCallback(
    (sessionName: string, folderId: string | null) =>
      update((p) => {
        const assign = { ...p.assign };
        if (folderId) assign[sessionName] = folderId;
        else delete assign[sessionName];
        return { ...p, assign };
      }),
    [update],
  );

  const moveFolder = useCallback(
    (id: string, parentId: string | null) =>
      update((p) => {
        if (id === parentId) return p;
        if (parentId && isAncestor(p.folders, id, parentId)) return p;
        return { ...p, folders: p.folders.map((f) => (f.id === id ? { ...f, parentId } : f)) };
      }),
    [update],
  );

  return { folders: slice.folders, folderOf, addFolder, renameFolder, deleteFolder, moveSession, moveFolder };
}
