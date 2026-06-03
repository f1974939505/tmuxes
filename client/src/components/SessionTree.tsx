import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import type { SessionInfo, Selection } from '../types';
import type { FoldersApi } from '../folders';
import { SessionRow } from './SessionRow';

const DND_TYPE = 'application/x-tmuxes';
type DragPayload = { kind: 'session'; name: string } | { kind: 'folder'; id: string };

interface Props {
  targetId: string;
  sessions: SessionInfo[];
  folders: FoldersApi;
  selection: Selection | null;
  nowMs: number;
  select: (sel: Selection | null) => void;
  onRename: (oldName: string, newName: string) => void;
  onKill: (name: string) => void;
}

export function SessionTree({ targetId, sessions, folders, selection, nowMs, select, onRename, onKill }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Drop folder ids that no longer exist from the collapsed set.
  useEffect(() => {
    setCollapsed((prev) => {
      const valid = new Set(folders.folders.map((f) => f.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [folders.folders]);

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const startDrag = (payload: DragPayload) => (e: DragEvent) => {
    e.dataTransfer.setData(DND_TYPE, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  };

  const allowDrop = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(DND_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const dropInto = (folderId: string | null) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const raw = e.dataTransfer.getData(DND_TYPE);
    if (!raw) return;
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw) as DragPayload;
    } catch {
      return;
    }
    if (payload.kind === 'session') folders.moveSession(payload.name, folderId);
    else folders.moveFolder(payload.id, folderId);
  };

  const commitFolderRename = () => {
    if (renamingId && renameDraft.trim()) folders.renameFolder(renamingId, renameDraft.trim());
    setRenamingId(null);
  };

  function renderLevel(parentId: string | null, depth: number): ReactNode {
    const subFolders = folders.folders.filter((f) => f.parentId === parentId);
    const subSessions = sessions.filter((s) => folders.folderOf(s.name) === parentId);
    return (
      <>
        {subFolders.map((f) => {
          const isCollapsed = collapsed.has(f.id);
          return (
            <div
              key={f.id}
              className={`folder ${dragOver === f.id ? 'drop' : ''}`}
              onDragOver={(e) => {
                allowDrop(e);
                e.stopPropagation();
                setDragOver(f.id);
              }}
              onDragLeave={() => setDragOver((p) => (p === f.id ? null : p))}
              onDrop={dropInto(f.id)}
            >
              {renamingId === f.id ? (
                <div className="folder-head" style={{ paddingLeft: 8 + depth * 14 }}>
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitFolderRename();
                      else if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={commitFolderRename}
                  />
                </div>
              ) : (
                <div
                  className="folder-head"
                  style={{ paddingLeft: 8 + depth * 14 }}
                  draggable
                  onDragStart={startDrag({ kind: 'folder', id: f.id })}
                  onClick={() => toggleCollapse(f.id)}
                >
                  <span className="caret">{isCollapsed ? '▸' : '▾'}</span>
                  <span className="folder-name" title={f.name}>
                    {isCollapsed ? '📁' : '📂'} {f.name}
                  </span>
                  <span className="folder-actions">
                    <button
                      title="New subfolder"
                      onClick={(e) => {
                        e.stopPropagation();
                        folders.addFolder(f.id);
                        setCollapsed((p) => {
                          const n = new Set(p);
                          n.delete(f.id);
                          return n;
                        });
                      }}
                    >
                      ＋
                    </button>
                    <button
                      title="Rename folder"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameDraft(f.name);
                        setRenamingId(f.id);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="danger"
                      title="Delete folder (keeps sessions)"
                      onClick={(e) => {
                        e.stopPropagation();
                        folders.deleteFolder(f.id);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              )}
              {!isCollapsed && <div className="folder-children">{renderLevel(f.id, depth + 1)}</div>}
            </div>
          );
        })}
        {subSessions.map((s) => (
          <SessionRow
            key={s.name}
            targetId={targetId}
            session={s}
            nowMs={nowMs}
            depth={depth}
            selected={selection?.targetId === targetId && selection.session === s.name}
            onSelect={() => select({ targetId, session: s.name })}
            onRename={(next) => onRename(s.name, next)}
            onKill={() => onKill(s.name)}
            onDragStart={startDrag({ kind: 'session', name: s.name })}
          />
        ))}
      </>
    );
  }

  const empty = folders.folders.length === 0 && sessions.length === 0;

  return (
    <div
      className={`tree ${dragOver === '__root__' ? 'drop-root' : ''}`}
      onDragOver={(e) => {
        allowDrop(e);
        setDragOver('__root__');
      }}
      onDragLeave={() => setDragOver((p) => (p === '__root__' ? null : p))}
      onDrop={dropInto(null)}
    >
      {empty && <div className="empty">No sessions. Create one below.</div>}
      {renderLevel(null, 0)}
    </div>
  );
}
