import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { OpenFile, OpenTextPreview, Selection, Target } from './types';
import { useSettings } from './settings';
import { useAttention } from './attention';
import { useI18n } from './i18n';
import { Sidebar } from './components/Sidebar';
import { TerminalPanel } from './components/TerminalPanel';
import { FileViewer } from './components/FileViewer';
import { TextViewer } from './components/TextViewer';
import { AgentReader } from './components/AgentReader';

function loadDock(): { layout: 'bottom' | 'right'; height: number; width: number } {
  try {
    const value = JSON.parse(localStorage.getItem('tmuxes.previewDock') ?? '{}');
    return { layout: value.layout === 'right' ? 'right' : 'bottom',
      height: Math.max(120, Math.min(1000, Number(value.height) || 300)),
      width: Math.max(240, Math.min(1400, Number(value.width) || window.innerWidth * 0.4)) };
  } catch { return { layout: 'bottom', height: 300, width: 600 }; }
}

const fileKey = (file: OpenFile) => JSON.stringify([file.targetId, file.session, file.path]);

export function App() {
  const { settings } = useSettings();
  const { t } = useI18n();
  const attention = useAttention();
  const [targets, setTargets] = useState<Target[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileKey, setActiveFileKey] = useState<string | null>(null);
  const [openText, setOpenText] = useState<OpenTextPreview | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [dock, setDock] = useState(loadDock);
  const [maximized, setMaximized] = useState(false);
  const [readingOpen, setReadingOpen] = useState(false);
  const [tab, setTab] = useState<'file' | 'reading'>('file');
  const workspace = useRef<HTMLDivElement>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(() => window.innerWidth - 320);
  const layout = dock.layout === 'right' && workspaceWidth < 600 ? 'bottom' : dock.layout;
  const dragCleanup = useRef<(() => void) | null>(null);
  useEffect(() => { try { localStorage.setItem('tmuxes.previewDock', JSON.stringify(dock)); } catch { /* storage disabled */ } }, [dock]);
  useEffect(() => () => dragCleanup.current?.(), []);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWorkspaceWidth(entries[0].contentRect.width));
    if (workspace.current) observer.observe(workspace.current);
    return () => observer.disconnect();
  }, []);

  const loadTargets = useCallback(async () => {
    try {
      const { targets } = await api.getTargets();
      setTargets(targets);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : t.failedLoadTargets);
    }
  }, [t.failedLoadTargets]);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  // Reading follows the active session; file documents retain their original
  // source and mounted viewer state until the user explicitly closes them.
  useEffect(() => {
    setReadingOpen(false);
    setTab('file');
  }, [selection?.targetId, selection?.session]);

  // Tell the attention tracker which session is in view, so it acknowledges
  // (clears) that session's badge and won't alert the one you're watching.
  useEffect(() => {
    attention.setActive(selection?.targetId ?? null, selection?.session ?? null);
  }, [attention, selection?.targetId, selection?.session]);

  // Tick for relative "created" times in the sidebar.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const onViewerDividerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragCleanup.current?.();
      const start = layout === 'right' ? e.clientX : e.clientY;
      const size = layout === 'right' ? dock.width : dock.height;
      const onMove = (ev: MouseEvent) => {
        const right = layout === 'right';
        const max = right ? (workspace.current?.clientWidth ?? window.innerWidth) - 326 : window.innerHeight - 160;
        const value = Math.max(right ? 240 : 120, Math.min(max, size + start - (right ? ev.clientX : ev.clientY)));
        setDock(d => ({ ...d, [right ? 'width' : 'height']: value }));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        dragCleanup.current = null;
      };
      dragCleanup.current = onUp;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [dock, layout],
  );

  const selectedTarget = selection ? targets.find((t) => t.id === selection.targetId) : undefined;
  const openFile = openFiles.find(file => fileKey(file) === activeFileKey) ?? null;
  const openViewer = openFiles.length > 0 || !!openText || readingOpen;
  const activeTab = tab === 'reading' && readingOpen ? 'reading' : openFiles.length || openText ? 'file' : 'reading';

  const handleOpenFile = useCallback((file: OpenFile) => {
    setOpenText(null);
    const key = fileKey(file);
    setOpenFiles(files => files.some(item => fileKey(item) === key) ? files : [...files, file]);
    setActiveFileKey(key);
    setTab('file');
  }, []);

  const handleOpenText = (preview: OpenTextPreview) => {
    setActiveFileKey(null);
    setOpenText(preview);
    setTab('file');
  };

  const closeFile = (file: OpenFile) => {
    const key = fileKey(file), remaining = openFiles.filter(item => fileKey(item) !== key);
    setOpenFiles(remaining);
    if (activeFileKey === key) setActiveFileKey(remaining.length ? fileKey(remaining[remaining.length - 1]) : null);
  };

  return (
    <div className="app">
      <Sidebar
        targets={targets}
        selection={selection}
        nowMs={nowMs}
        loadError={loadError}
        openFile={openFile}
        select={setSelection}
        onRefreshTargets={() => void loadTargets()}
        onOpenFile={handleOpenFile}
        onOpenText={handleOpenText}
      />

      <div ref={workspace} className={`workspace dock-${layout}`}>
        <div className="term-region">
          {selection && selectedTarget ? (
            <TerminalPanel
              key={`${selection.targetId}/${selection.session}`}
              targetId={selection.targetId}
              targetKind={selectedTarget.kind}
              targetLabel={selectedTarget.label}
              session={selection.session}
              fontSize={settings.terminalFontSize}
              onRead={() => { setReadingOpen(true); setTab('reading'); }}
              onRender={content => handleOpenText({ title: t.renderSelection, subtitle: selection.session, content, mode: 'markdown', source: selectedTarget.kind === 'winlocal' ? undefined : selection })}
              onOpenFile={handleOpenFile}
            />
          ) : (
            <div className="panel">
              <div className="panel-placeholder">
                <div style={{ fontSize: 18 }}>{t.selectOrCreateSession}</div>
                <div>{t.pickSession}</div>
              </div>
            </div>
          )}
        </div>

        {openViewer && (
          <>
            <div className="hdivider" onMouseDown={onViewerDividerDown} title={t.dragResize} />
            <div className="viewer-slot" style={layout === 'right' ? { width: dock.width } : { height: dock.height }}>
            <div className={`viewer-region preview-dock${maximized ? ' maximized' : ''}`}>
              <div className="dock-toolbar">
                {(openFiles.length > 0 || openText) && <button aria-pressed={activeTab === 'file'} onClick={() => setTab('file')}>{t.fileViewer}</button>}
                {readingOpen && <button aria-pressed={activeTab === 'reading'} onClick={() => setTab('reading')}>{t.reading}</button>}
                <div className="viewer-head-spacer" />
                <button disabled={workspaceWidth < 600} title={workspaceWidth < 600 ? t.narrowPreviewDock : undefined}
                  onClick={() => setDock(d => ({ ...d, layout: layout === 'right' ? 'bottom' : 'right' }))}>{layout === 'right' ? t.dockBottom : t.dockRight}</button>
                <button onClick={() => setMaximized(v => !v)}>{maximized ? t.restore : t.maximize}</button>
                {activeTab === 'reading' && <button onClick={() => { setReadingOpen(false); setTab('file'); setMaximized(false); }}>✕</button>}
              </div>
              <div className={`dock-content file-workspace${activeTab !== 'file' ? ' dock-hidden' : ''}`}>
                {openFiles.length > 0 && <div className="file-tabs" role="tablist" aria-label={t.openFiles}>
                  {openFiles.map(file => <button key={fileKey(file)} role="tab" aria-selected={activeFileKey === fileKey(file)}
                    title={`${targets.find(target => target.id === file.targetId)?.label ?? file.targetId} / ${file.session} · ${file.path}`}
                    onClick={() => setActiveFileKey(fileKey(file))}>{file.name}</button>)}
                  {openText && <button role="tab" aria-selected={activeFileKey === null} onClick={() => setActiveFileKey(null)}>{openText.title}</button>}
                </div>}
                {openFiles.map(file => <div key={fileKey(file)} className={`file-preview${activeFileKey !== fileKey(file) ? ' dock-hidden' : ''}`}>
                  <FileViewer file={file} active={activeTab === 'file' && activeFileKey === fileKey(file)} sourceLabel={`${targets.find(target => target.id === file.targetId)?.label ?? file.targetId} / ${file.session}`}
                    onClose={() => closeFile(file)} onOpenFile={handleOpenFile} />
                </div>)}
                {openText && <div className={`file-preview${activeFileKey !== null ? ' dock-hidden' : ''}`}>
                  <TextViewer preview={openText} onOpenFile={handleOpenFile} onClose={() => { setOpenText(null); setActiveFileKey(openFiles.length ? fileKey(openFiles[openFiles.length - 1]) : null); }} />
                </div>}
              </div>
              {readingOpen && selection && <div className={`dock-content${activeTab !== 'reading' ? ' dock-hidden' : ''}`}>
                <AgentReader key={`${selection.targetId}/${selection.session}`} selection={selection} active={activeTab === 'reading'} onOpenFile={handleOpenFile} />
              </div>}
            </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
