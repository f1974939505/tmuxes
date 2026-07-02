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

export function App() {
  const { settings } = useSettings();
  const { t } = useI18n();
  const attention = useAttention();
  const [targets, setTargets] = useState<Target[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [openText, setOpenText] = useState<OpenTextPreview | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [viewerHeight, setViewerHeight] = useState(300);
  const dragState = useRef<{ startY: number; startH: number } | null>(null);

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

  // Switching sessions changes the file context — close any open file.
  useEffect(() => {
    setOpenFile(null);
    setOpenText(null);
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
      dragState.current = { startY: e.clientY, startH: viewerHeight };
      const onMove = (ev: MouseEvent) => {
        if (!dragState.current) return;
        const delta = dragState.current.startY - ev.clientY; // drag up → taller viewer
        const max = window.innerHeight - 160;
        setViewerHeight(Math.max(100, Math.min(max, dragState.current.startH + delta)));
      };
      const onUp = () => {
        dragState.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [viewerHeight],
  );

  const selectedTarget = selection ? targets.find((t) => t.id === selection.targetId) : undefined;
  const openViewer = !!openFile || !!openText;

  const handleOpenFile = (file: OpenFile) => {
    setOpenText(null);
    setOpenFile(file);
  };

  const handleOpenText = (preview: OpenTextPreview) => {
    setOpenFile(null);
    setOpenText(preview);
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

      <div className="workspace">
        <div className="term-region">
          {selection && selectedTarget ? (
            <TerminalPanel
              key={`${selection.targetId}/${selection.session}`}
              targetId={selection.targetId}
              targetKind={selectedTarget.kind}
              targetLabel={selectedTarget.label}
              session={selection.session}
              fontSize={settings.terminalFontSize}
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
            <div className="viewer-region" style={{ height: viewerHeight }}>
              {openFile && <FileViewer file={openFile} onClose={() => setOpenFile(null)} />}
              {openText && <TextViewer preview={openText} onClose={() => setOpenText(null)} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
