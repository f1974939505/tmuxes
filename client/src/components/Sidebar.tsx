import { useCallback, useRef, useState } from 'react';
import type { OpenFile, Selection, Target } from '../types';
import { useSettings } from '../settings';
import { TargetGroup } from './TargetGroup';
import { FileExplorer } from './FileExplorer';
import { SettingsButton } from './SettingsButton';

interface Props {
  targets: Target[];
  selection: Selection | null;
  nowMs: number;
  loadError: string | null;
  openFile: OpenFile | null;
  select: (sel: Selection | null) => void;
  onRefreshTargets: () => void;
  onOpenFile: (file: OpenFile) => void;
}

const MIN_BOTTOM = 120;

export function Sidebar({
  targets,
  selection,
  nowMs,
  loadError,
  openFile,
  select,
  onRefreshTargets,
  onOpenFile,
}: Props) {
  const { settings } = useSettings();
  const [bottomHeight, setBottomHeight] = useState(260);
  const dragState = useRef<{ startY: number; startH: number } | null>(null);

  const onDividerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragState.current = { startY: e.clientY, startH: bottomHeight };
      const onMove = (ev: MouseEvent) => {
        if (!dragState.current) return;
        const delta = dragState.current.startY - ev.clientY;
        const max = window.innerHeight - 220;
        setBottomHeight(Math.max(MIN_BOTTOM, Math.min(max, dragState.current.startH + delta)));
      };
      const onUp = () => {
        dragState.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [bottomHeight],
  );

  const selectedTarget = selection ? targets.find((t) => t.id === selection.targetId) : undefined;
  const fileBrowsingEnabled = !selectedTarget || selectedTarget.kind !== 'winlocal';

  return (
    <div className="sidebar" style={{ fontSize: settings.sidebarFontSize }}>
      <div className="sidebar-header">
        <h1>tmuxes</h1>
        <button onClick={onRefreshTargets} title="Reload targets">
          ⟳
        </button>
      </div>

      <div className="sidebar-top">
        {loadError && <div className="error-line">{loadError}</div>}
        {targets.map((t) => (
          <TargetGroup key={t.id} target={t} selection={selection} nowMs={nowMs} select={select} />
        ))}
        {!loadError && targets.length === 0 && <div className="empty">No targets.</div>}
      </div>

      <div className="sidebar-vdivider" onMouseDown={onDividerDown} title="Drag to resize" />

      <div className="sidebar-bottom" style={{ height: bottomHeight }}>
        <div className="section-label">Working directory</div>
        <FileExplorer
          selection={selection}
          openFile={openFile}
          enabled={fileBrowsingEnabled}
          onOpenFile={onOpenFile}
        />
      </div>

      <div className="sidebar-footer">
        <SettingsButton />
      </div>
    </div>
  );
}
