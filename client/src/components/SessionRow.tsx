import { useState } from 'react';
import type { SessionInfo } from '../types';
import { ago, isValidSessionName } from '../util';
import { useAttention } from '../attention';
import { agentStatusLabel, attentionLabel, isSessionActive } from '../activity';

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
      title={`${session.name} — ${agentStatusLabel(session)} — ${session.windows} window(s)`}
    >
      <span className={`dot ${active ? 'active' : 'inactive'}`} title={agentStatusLabel(session)} />
      <span className="name">{session.name}</span>
      {reason && (
        <span className={`attn-badge ${reason}`} title={attentionLabel(reason)}>
          {reason === 'decision' ? '决策' : '结束'}
        </span>
      )}
      <span className="meta">
        {session.windows} win{session.created ? ` · ${ago(session.created, nowMs)}` : ''}
      </span>
      <span className="row-actions">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDraft(session.name);
            setRenaming(true);
          }}
          title="Rename"
        >
          ✎
        </button>
        <button
          className="danger"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Kill session "${session.name}"? This terminates its processes.`)) onKill();
          }}
          title="Kill"
        >
          ✕
        </button>
      </span>
    </div>
  );
}
