import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionInfo, Selection, Target } from '../types';
import { api, ApiError } from '../api';
import { isValidSessionName } from '../util';
import { useFolders } from '../folders';
import { useAttention } from '../attention';
import { SessionTree } from './SessionTree';

interface Props {
  target: Target;
  selection: Selection | null;
  nowMs: number;
  select: (sel: Selection | null) => void;
}

const POLL_MS = 5000;
/** Seconds of observed silence (after activity) before we flag a session. */
const ATTENTION_IDLE_SEC = 10;

export function TargetGroup({ target, selection, nowMs, select }: Props) {
  // Expand the "local-ish" targets by default (local tmux, WSL, native shells).
  const [expanded, setExpanded] = useState(
    target.kind === 'local' || target.kind === 'wsl' || target.kind === 'winlocal',
  );
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCommand, setNewCommand] = useState('');
  const [newShell, setNewShell] = useState(target.shells?.[0]?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const folders = useFolders(target.id, expanded);
  const attention = useAttention();

  // Avoid overlapping fetches when a poll and a manual refresh race.
  const inFlight = useRef(false);
  // Sessions currently flagged as needing attention (edge detection per poll).
  const alerting = useRef<Set<string>>(new Set());

  const detectAttention = useCallback(
    (sessions: SessionInfo[]) => {
      const present = new Set<string>();
      for (const s of sessions) {
        present.add(s.name);
        const idle = !!s.observedActive && (s.idleSeconds ?? 0) >= ATTENTION_IDLE_SEC;
        const wasAlerting = alerting.current.has(s.name);
        if (idle && !wasAlerting) {
          alerting.current.add(s.name);
          attention.fire(target.id, s.name);
        } else if (!idle && wasAlerting) {
          alerting.current.delete(s.name);
          attention.clearAlert(target.id, s.name);
        }
      }
      // Forget sessions that vanished.
      for (const name of [...alerting.current]) {
        if (!present.has(name)) alerting.current.delete(name);
      }
    },
    [attention, target.id],
  );

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const { sessions } = await api.getSessions(target.id);
      setSessions(sessions);
      detectAttention(sessions);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'failed to list sessions');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [target.id, detectAttention]);

  useEffect(() => {
    if (!expanded) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [expanded, refresh]);

  const submitCreate = async () => {
    const name = newName.trim();
    if (name && !isValidSessionName(name)) {
      setFormError('Use letters, digits, _ or - (max 64). No "." or ":".');
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const { name: created } = await api.createSession(target.id, {
        name: name || undefined,
        command: newCommand.trim() || undefined,
        shell: target.kind === 'winlocal' ? newShell || undefined : undefined,
      });
      setNewName('');
      setNewCommand('');
      setShowForm(false);
      await refresh();
      select({ targetId: target.id, session: created });
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (oldName: string, next: string) => {
    try {
      await api.renameSession(target.id, oldName, next);
      await refresh();
      if (selection?.targetId === target.id && selection.session === oldName) {
        select({ targetId: target.id, session: next });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'rename failed');
    }
  };

  const handleKill = async (name: string) => {
    try {
      await api.killSession(target.id, name);
      if (selection?.targetId === target.id && selection.session === name) select(null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'kill failed');
    }
  };

  return (
    <div className="target-group">
      <div className="target-head" onClick={() => setExpanded((v) => !v)}>
        <span className="caret">{expanded ? '▾' : '▸'}</span>
        <span className="label">{target.label}</span>
        <span className="kind">{target.kind}</span>
        {expanded && loading && <span className="badge loading">…</span>}
        {expanded && error && (
          <span className="badge err" title={error}>
            !
          </span>
        )}
      </div>

      {expanded && (
        <div className="session-list">
          {error && <div className="error-line">{error}</div>}

          <SessionTree
            targetId={target.id}
            sessions={sessions ?? []}
            folders={folders}
            selection={selection}
            nowMs={nowMs}
            select={select}
            onRename={(oldName, next) => void handleRename(oldName, next)}
            onKill={(name) => void handleKill(name)}
          />

          <div className="list-toolbar">
            <button onClick={() => folders.addFolder(null)} title="New folder">
              + folder
            </button>
            <button onClick={() => setShowForm((v) => !v)}>+ session</button>
          </div>

          {showForm && (
            <div className="create-form" onClick={(e) => e.stopPropagation()}>
              {target.kind === 'winlocal' && target.shells && target.shells.length > 0 && (
                <select value={newShell} onChange={(e) => setNewShell(e.target.value)}>
                  {target.shells.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
              <input
                autoFocus
                placeholder="name (optional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submitCreate()}
              />
              <input
                placeholder="initial command (optional)"
                value={newCommand}
                onChange={(e) => setNewCommand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submitCreate()}
              />
              {formError && <div className="field-error">{formError}</div>}
              <div className="row">
                <button className="primary" disabled={creating} onClick={() => void submitCreate()}>
                  Create
                </button>
                <button onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
