import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttentionReason, SessionInfo, Selection, Target } from '../types';
import { api, ApiError } from '../api';
import { isValidSessionName } from '../util';
import { useFolders } from '../folders';
import { useAttention } from '../attention';
import { useI18n } from '../i18n';
import { SessionTree } from './SessionTree';

interface Props {
  target: Target;
  selection: Selection | null;
  nowMs: number;
  select: (sel: Selection | null) => void;
}

const POLL_MS = 5000;

function isAttentionReason(v: string | undefined): v is AttentionReason {
  return v === 'done' || v === 'error';
}

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

  const folders = useFolders(target.id, expanded, target.kind === 'ssh');
  const attention = useAttention();
  const { t } = useI18n();

  // Avoid overlapping fetches when a poll and a manual refresh race.
  const inFlight = useRef(false);
  // Avoid repeated SSH login failures that can look like brute-force attempts.
  // Collapse/re-expand the target to retry after fixing keys, VPN, or host access.
  const pollingPaused = useRef(false);
  // Last-seen agent hook event key per session; first sight is a baseline.
  const lastAgentEvent = useRef<Map<string, string>>(new Map());
  const eventKey = (s: SessionInfo): string => {
    if (!s.agentKind || !s.agentState || !s.agentNonce) return '';
    return [
      s.agentKind,
      s.agentState,
      s.attentionReason ?? '',
      s.agentEvent ?? '',
      s.agentNonce,
    ].join(':');
  };

  const detectAttention = useCallback(
    (sessions: SessionInfo[]) => {
      const present = new Set<string>();
      for (const s of sessions) {
        present.add(s.name);
        const key = eventKey(s);
        const seen = lastAgentEvent.current.has(s.name);
        const prev = lastAgentEvent.current.get(s.name);
        lastAgentEvent.current.set(s.name, key);

        if (s.agentState === 'running') {
          attention.clearAlert(target.id, s.name);
        } else if (
          seen &&
          key &&
          key !== prev &&
          isAttentionReason(s.attentionReason)
        ) {
          attention.fire(target.id, s.name, s.attentionReason);
        }
      }
      // Forget sessions that vanished.
      for (const name of [...lastAgentEvent.current.keys()]) {
        if (!present.has(name)) {
          lastAgentEvent.current.delete(name);
          attention.clearAlert(target.id, name);
        }
      }
    },
    [attention, target.id],
  );

  const refresh = useCallback(async () => {
    if (pollingPaused.current) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const { sessions } = await api.getSessions(target.id);
      setSessions(sessions);
      detectAttention(sessions);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.failedListSessions);
      if (target.kind === 'ssh') pollingPaused.current = true;
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [target.id, target.kind, detectAttention, t.failedListSessions]);

  const manualReconnect = useCallback(() => {
    pollingPaused.current = false;
    setError(null);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!expanded) return;
    pollingPaused.current = false;
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [expanded, refresh]);

  const submitCreate = async () => {
    const name = newName.trim();
    if (name && !isValidSessionName(name)) {
      setFormError(t.invalidSessionName);
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
      setFormError(e instanceof ApiError ? e.message : t.failedCreateSession);
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
      setError(e instanceof ApiError ? e.message : t.renameFailed);
    }
  };

  const handleKill = async (name: string) => {
    try {
      await api.killSession(target.id, name);
      if (selection?.targetId === target.id && selection.session === name) select(null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.killFailed);
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
          {error && (
            <div className="error-line">
              <span>{error}</span>
              {target.kind === 'ssh' && (
                <button onClick={manualReconnect} disabled={loading}>
                  {t.reconnect}
                </button>
              )}
            </div>
          )}

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
            <button onClick={() => folders.addFolder(null, t.folderDefaultName)} title={t.newFolderTitle}>
              {t.newFolder}
            </button>
            <button onClick={() => setShowForm((v) => !v)}>{t.newSession}</button>
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
                placeholder={t.nameOptional}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submitCreate()}
              />
              <input
                placeholder={t.commandOptional}
                value={newCommand}
                onChange={(e) => setNewCommand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submitCreate()}
              />
              {formError && <div className="field-error">{formError}</div>}
              <div className="row">
                <button className="primary" disabled={creating} onClick={() => void submitCreate()}>
                  {t.create}
                </button>
                <button onClick={() => setShowForm(false)}>{t.cancel}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
