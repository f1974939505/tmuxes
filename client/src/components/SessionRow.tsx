import { useState } from 'react';
import type { SessionInfo } from '../types';
import { ago, isValidSessionName } from '../util';
import { useAttention } from '../attention';
import { isSessionActive } from '../activity';
import { agentStatusLabel, attentionText, attentionTitle, useI18n } from '../i18n';

interface Props {
  targetId: string;
  session: SessionInfo;
  selected: boolean;
  nowMs: number;
  depth?: number;
  onSelect: () => void;
  onRename: (newName: string) => void;
  onKill: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}

export function SessionRow({
  targetId,
  session,
  selected,
  nowMs,
  depth = 0,
  onSelect,
  onRename,
  onKill,
  onDragStart,
}: Props) {
  const attention = useAttention();
  const { language, t } = useI18n();
  const reason = attention.reasonFor(targetId, session.name);
  const active = isSessionActive(session);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(session.name);

  const commitRename = () => {
    const next = draft.trim();
    if (next && next !== session.name && isValidSessionName(next)) {
      onRename(next);
    }
    setRenaming(false);
  };

  const status = agentStatusLabel(session, t);

  if (renaming) {
    return (
      <div className="session-row" style={{ paddingLeft: 8 + depth * 14 }}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            else if (e.key === 'Escape') setRenaming(false);
          }}
          onBlur={() => setRenaming(false)}
        />
      </div>
    );
  }

  return (
    <div
      className={`session-row ${selected ? 'selected' : ''} ${reason ? 'attention' : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onClick={onSelect}
      title={`${session.name} - ${status} - ${session.windows} ${t.windowsShort}`}
    >
      <span className={`dot ${active ? 'active' : 'inactive'}`} title={status} />
      <span className="name">{session.name}</span>
      {reason && (
        <span className={`attn-badge ${reason}`} title={attentionTitle(reason, t)}>
          {attentionText(reason, t)}
        </span>
      )}
      <span className="meta">
        {session.windows} {t.windowsShort}{session.created ? ` · ${ago(session.created, nowMs, language)}` : ''}
      </span>
      <span className="row-actions">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDraft(session.name);
            setRenaming(true);
          }}
          title={t.rename}
        >
          ✎
        </button>
        <button
          className="danger"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(t.killConfirm(session.name))) onKill();
          }}
          title={t.kill}
        >
          ✕
        </button>
      </span>
    </div>
  );
}
