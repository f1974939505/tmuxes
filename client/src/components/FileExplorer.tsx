import { useCallback, useEffect, useState } from 'react';
import type { FileEntry, OpenFile, Selection } from '../types';
import { api, ApiError } from '../api';
import { basename, isTextFile, joinPath, parentPath } from '../util';

interface Props {
  selection: Selection | null;
  openFile: OpenFile | null;
  /** Native shell sessions have no tmux cwd — disables the file browser. */
  enabled: boolean;
  onOpenFile: (file: OpenFile) => void;
}

const POLL_MS = 3000;

function samePath(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const clean = (p: string) => (p === '/' ? p : p.replace(/\/+$/, ''));
  return clean(a) === clean(b);
}

/** Bottom of the sidebar: the files/folders of the selected session's current
 *  working directory. Follows the session's cwd until you navigate away. */
export function FileExplorer({ selection, openFile, enabled, onOpenFile }: Props) {
  const [cwd, setCwd] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const path = manualPath ?? cwd;
  const following = manualPath === null;
  const targetId = selection?.targetId;
  const session = selection?.session;

  // New selection → re-follow that session's cwd.
  useEffect(() => {
    setManualPath(null);
    setCwd(null);
    setEntries([]);
    setError(null);
  }, [targetId, session]);

  const tick = useCallback(async () => {
    if (!targetId || !session) return;
    try {
      const { cwd: latest } = await api.getCwd(targetId, session);
      setCwd(latest);
      const listPath = manualPath ?? latest;
      const { entries } = await api.listFiles(targetId, session, listPath);
      setEntries(entries);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'cannot list directory');
    }
  }, [targetId, session, manualPath]);

  useEffect(() => {
    if (!targetId || !session || !enabled) return;
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => window.clearInterval(id);
  }, [targetId, session, enabled, tick]);

  if (!selection) {
    return (
      <div className="explorer">
        <div className="explorer-empty">Select a session to browse its working directory.</div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="explorer">
        <div className="explorer-empty">File browser isn't available for native shell sessions.</div>
      </div>
    );
  }

  const navigate = (entry: FileEntry) => {
    if (!path) return;
    const full = joinPath(path, entry.name);
    if (entry.type === 'dir') {
      setManualPath(full);
    } else if (isTextFile(entry.name)) {
      onOpenFile({ targetId: selection.targetId, session: selection.session, path: full, name: entry.name });
    }
  };

  const atRoot = samePath(path, cwd);

  return (
    <div className="explorer">
      <div className="explorer-head">
        <span className="explorer-path" title={path ?? ''}>
          {path ? basename(path) : '…'}
        </span>
        <span className="explorer-actions">
          {!following && (
            <button title="Back to session directory" onClick={() => setManualPath(null)}>
              ⌂
            </button>
          )}
          <button title="Up one level" disabled={!path || path === '/' || atRoot} onClick={() => path && setManualPath(parentPath(path))}>
            ↑
          </button>
        </span>
      </div>
      {error && <div className="error-line">{error}</div>}
      <div className="explorer-list">
        {entries.map((e) => {
          const openable = e.type === 'dir' || isTextFile(e.name);
          const isOpen =
            openFile?.targetId === selection.targetId && path && openFile.path === joinPath(path, e.name);
          return (
            <div
              key={e.name}
              className={`file-row ${e.type} ${openable ? '' : 'disabled'} ${isOpen ? 'open' : ''}`}
              onClick={() => openable && navigate(e)}
              title={e.name}
            >
              <span className="file-icon">{e.type === 'dir' ? '📁' : isTextFile(e.name) ? '📄' : '▫'}</span>
              <span className="file-name">{e.name}</span>
            </div>
          );
        })}
        {entries.length === 0 && !error && <div className="explorer-empty">empty directory</div>}
      </div>
    </div>
  );
}
