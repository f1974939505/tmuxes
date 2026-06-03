import { useCallback, useEffect, useState } from 'react';

/** A virtual folder used to organize tmux sessions in the sidebar tree.
 *  Folders are a client-only overlay (tmux has no folders); they persist in
 *  localStorage, keyed per target. */
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

type Store = Record<string, TargetFolders>;

const STORAGE_KEY = 'tmuxes.folders';
const EMPTY: TargetFolders = { folders: [], assign: {} };

function loadStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Store;
  } catch {
    return {};
  }
}

function saveSlice(targetId: string, slice: TargetFolders): void {
  const store = loadStore(); // read-modify-write so sibling targets aren't clobbered
  store[targetId] = slice;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
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
  /** Resolve a session to its folder id, or null if at root / folder deleted. */
  folderOf: (sessionName: string) => string | null;
  addFolder: (parentId: string | null) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  moveSession: (sessionName: string, folderId: string | null) => void;
  moveFolder: (id: string, parentId: string | null) => void;
}

export function useFolders(targetId: string): FoldersApi {
  const [slice, setSlice] = useState<TargetFolders>(() => loadStore()[targetId] ?? EMPTY);

  useEffect(() => {
    setSlice(loadStore()[targetId] ?? EMPTY);
  }, [targetId]);

  const update = useCallback(
    (fn: (prev: TargetFolders) => TargetFolders) => {
      setSlice((prev) => {
        const next = fn(prev);
        saveSlice(targetId, next);
        return next;
      });
    },
    [targetId],
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
      update((p) => ({
        ...p,
        folders: [...p.folders, { id: newId(), name: 'New folder', parentId }],
      })),
    [update],
  );

  const renameFolder = useCallback(
    (id: string, name: string) =>
      update((p) => ({
        ...p,
        folders: p.folders.map((f) => (f.id === id ? { ...f, name } : f)),
      })),
    [update],
  );

  const deleteFolder = useCallback(
    (id: string) =>
      update((p) => {
        // Reparent children to the deleted folder's parent; unassign its sessions.
        const target = p.folders.find((f) => f.id === id);
        const parent = target?.parentId ?? null;
        const folders = p.folders
          .filter((f) => f.id !== id)
          .map((f) => (f.parentId === id ? { ...f, parentId: parent } : f));
        const assign: Record<string, string> = {};
        for (const [name, fid] of Object.entries(p.assign)) {
          assign[name] = fid === id ? (parent ?? '') : fid;
          if (!assign[name]) delete assign[name];
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
        if (parentId && isAncestor(p.folders, id, parentId)) return p; // no cycles
        return { ...p, folders: p.folders.map((f) => (f.id === id ? { ...f, parentId } : f)) };
      }),
    [update],
  );

  return { folders: slice.folders, folderOf, addFolder, renameFolder, deleteFolder, moveSession, moveFolder };
}
