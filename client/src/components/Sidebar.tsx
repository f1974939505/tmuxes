import { useCallback, useEffect, useRef, useState } from 'react';
import type { OpenFile, OpenTextPreview, Selection, Target } from '../types';
import { useSettings } from '../settings';
import { useI18n } from '../i18n';
import { TargetGroup } from './TargetGroup';
import { FileExplorer } from './FileExplorer';
import { GitPanel } from './GitPanel';
import { SettingsButton } from './SettingsButton';
import { useOffscreenAttention } from '../hooks/useOffscreenAttention';

interface Props {
  targets: Target[];
  selection: Selection | null;
  nowMs: number;
  loadError: string | null;
  openFile: OpenFile | null;
  select: (sel: Selection | null) => void;
  onRefreshTargets: () => void;
  onOpenFile: (file: OpenFile) => void;
  onOpenText: (preview: OpenTextPreview) => void;
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
  onOpenText,
}: Props) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const [bottomHeight, setBottomHeight] = useState<number | null>(null);
  const [bottomTab, setBottomTab] = useState<'files' | 'git'>('files');
  const dragState = useRef<{ startY: number; startH: number } | null>(null);
  const mainRef = useRef<HTMLDivElement>(null), bottomRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null), contentRef = useRef<HTMLDivElement>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const hiddenAttention = useOffscreenAttention(viewportRef, contentRef);
  useEffect(() => () => dragCleanup.current?.(), []);

  const onDividerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragCleanup.current?.();
      dragState.current = { startY: e.clientY, startH: bottomRef.current?.getBoundingClientRect().height ?? MIN_BOTTOM };
      const onMove = (ev: MouseEvent) => {
        if (!dragState.current) return;
        const delta = dragState.current.startY - ev.clientY;
        const max = Math.max(MIN_BOTTOM, (mainRef.current?.clientHeight ?? window.innerHeight) - 86);
        setBottomHeight(Math.max(MIN_BOTTOM, Math.min(max, dragState.current.startH + delta)));
      };
      const onUp = () => {
        dragState.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        dragCleanup.current = null;
      };
      dragCleanup.current = onUp;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [],
  );

  const selectedTarget = selection ? targets.find((t) => t.id === selection.targetId) : undefined;
  const fileBrowsingEnabled = !selectedTarget || selectedTarget.kind !== 'winlocal';

  return (
    <div className="tmuxes-sidebar" style={{ fontSize: settings.sidebarFontSize }}>
      <div className="sidebar-header">
        <h1>tmuxes</h1>
        <button onClick={onRefreshTargets} title={t.reloadTargets}>
          ⟳
        </button>
      </div>

      <div className="sidebar-main" ref={mainRef}>
        <div className="sidebar-sessions">
          <div className="sidebar-top" ref={viewportRef}>
            <div ref={contentRef}>
              {loadError && <div className="error-line">{loadError}</div>}
              {targets.map((t) => (
                <TargetGroup key={t.id} target={t} selection={selection} nowMs={nowMs} select={select} />
              ))}
              {!loadError && targets.length === 0 && <div className="empty">{t.noTargets}</div>}
            </div>
          </div>
          {(['above', 'below'] as const).map(direction => {
            const hint = hiddenAttention[direction];
            if (!hint.count) return null;
            const label = direction === 'above' ? t.alertsAbove(hint.count) : t.alertsBelow(hint.count);
            return <button key={direction} className={`sidebar-alert-arrow ${direction} ${hint.reason}`}
              title={`${label} · ${hint.labels}`} aria-label={label} onClick={() => hiddenAttention.reveal(direction)}>
              {direction === 'above' ? '↑' : '↓'} <span>{hint.count}</span>
            </button>;
          })}
        </div>

        <div className="sidebar-vdivider" onMouseDown={onDividerDown} title={t.dragResize} />

        <div className="sidebar-bottom" ref={bottomRef} style={bottomHeight === null ? undefined : { height: bottomHeight, flex: 'none' }}>
          <div className="sidebar-tabs" role="tablist" aria-label={t.workingDirectory}>
            <button
              className={bottomTab === 'files' ? 'active' : ''}
              role="tab"
              aria-selected={bottomTab === 'files'}
              onClick={() => setBottomTab('files')}
            >
              {t.filesTab}
            </button>
            <button
              className={bottomTab === 'git' ? 'active' : ''}
              role="tab"
              aria-selected={bottomTab === 'git'}
              onClick={() => setBottomTab('git')}
            >
              {t.gitTab}
            </button>
          </div>
          {bottomTab === 'files' ? (
            <FileExplorer
              selection={selection}
              openFile={openFile}
              enabled={fileBrowsingEnabled}
              pauseOnError={selectedTarget?.kind === 'ssh'}
              onOpenFile={onOpenFile}
            />
          ) : (
            <GitPanel selection={selection} enabled={fileBrowsingEnabled} onOpenText={onOpenText} />
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <SettingsButton />
      </div>
    </div>
  );
}
