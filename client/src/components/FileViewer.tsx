import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FilePreview, OpenFile } from '../types';
import { api, ApiError, fileContentUrl } from '../api';
import { useSettings } from '../settings';
import { useI18n } from '../i18n';
import { previewKind } from '../util';
import { MarkdownView } from './LazyMarkdownView';
import { ImageViewer } from './ImageViewer';
import { FileDownload } from './FileDownload';
import { startFileRefresh } from '../fileRefresh';
const PdfViewer = lazy(() => import('./PdfViewer'));

interface Props {
  file: OpenFile;
  onClose: () => void;
  onOpenFile?: (file: OpenFile) => void;
  sourceLabel?: string;
  active?: boolean;
}

/** New undo checkpoint after this idle gap, so a burst of typing collapses
 *  into a single undo step. */
const COALESCE_MS = 500;

/** Read-only preview + editor for a text file. Editable only when the file is
 *  text and was not truncated (saving a truncated preview would lose data). */
export function FileViewer({ file, onClose, onOpenFile, sourceLabel, active = true }: Props) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lastEditRef = useRef(0);
  const markdownRef = useRef<HTMLDivElement>(null);
  const restorePosition = useRef<{ top: number; left: number; start?: number; end?: number } | null>(null);

  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState('');
  const [baseline, setBaseline] = useState('');
  const [past, setPast] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [externalChange, setExternalChange] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const loadedVersion = useRef<string | null>(null);
  const editRevision = useRef(0), forceReload = useRef(false);
  const refreshRef = useRef<() => void>(() => {});
  const latest = useRef({ text, baseline, saving });
  latest.current = { text, baseline, saving };
  const kind = previewKind(file.name);
  const media = kind === 'image' || kind === 'pdf';
  const [rendered, setRendered] = useState(kind === 'markdown');

  const editable = !!preview && !preview.binary && !preview.truncated;
  const dirty = editable && text !== baseline;

  // The source stays fixed across tmux switches; only its visible tab polls.
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setPreview(null);
    setPast([]);
    setFuture([]);
    lastEditRef.current = 0;
    loadedVersion.current = null; setVersion(null); setExternalChange(false);
    editRevision.current = 0;
    setRendered(kind === 'markdown');
  }, [file.targetId, file.session, file.path, kind]);

  useEffect(() => {
    if (!active) return;
    const loop = startFileRefresh({
      visible: () => !document.hidden,
      read: async (signal) => {
        const force = forceReload.current; forceReload.current = false;
        const revision = editRevision.current;
        const mode = media ? 'media' : latest.current.saving || !force && latest.current.text !== latest.current.baseline ? 'metadata' : 'text';
        return { ...await api.getFileUpdate(file, force ? null : loadedVersion.current, mode, signal), force, revision };
      },
      result: ({ version: next, preview: p, force, revision }) => {
        setLoadError(null); setLoading(false);
        if (latest.current.saving) return;
        const changed = loadedVersion.current !== next;
        if (!media && (latest.current.text !== latest.current.baseline) && !(force && revision === editRevision.current)) {
          if (changed) setExternalChange(true);
          return; // never replace edits that began while a read was in flight
        }
        if (!media && changed && !p) return; // an undo during HEAD needs a fresh body on the next check
        if (p) {
          if (force) setSaveError(null);
          if (p.content !== latest.current.text) {
            const element = renderedRef.current ? markdownRef.current : taRef.current;
            if (element) restorePosition.current = { top: element.scrollTop, left: element.scrollLeft,
              ...(element instanceof HTMLTextAreaElement ? { start: element.selectionStart, end: element.selectionEnd } : {}) };
            setPast([]); setFuture([]); lastEditRef.current = 0;
          }
          setPreview(p); setText(p.content); setBaseline(p.content);
          latest.current.text = latest.current.baseline = p.content;
        }
        loadedVersion.current = next; setVersion(next); setExternalChange(false);
      },
      error: (error) => {
        setLoading(false); setLoadError(error instanceof Error ? error.message : String(error));
        return !(error instanceof ApiError && (error.status === 409 || error.status === 404));
      },
    });
    refreshRef.current = loop.refresh;
    const shown = () => loop.wake();
    const connected = (event: Event) => {
      if ((event as CustomEvent).detail.targetId === file.targetId) loop.refresh();
    };
    document.addEventListener('visibilitychange', shown);
    window.addEventListener('tmuxes:target-connected', connected);
    return () => { loop.dispose(); refreshRef.current = () => {}; document.removeEventListener('visibilitychange', shown); window.removeEventListener('tmuxes:target-connected', connected); };
  }, [active, file.targetId, file.session, file.path, media]);
  const renderedRef = useRef(rendered); renderedRef.current = rendered;

  useLayoutEffect(() => {
    const saved = restorePosition.current, element = rendered ? markdownRef.current : taRef.current;
    if (!saved || !element) return;
    restorePosition.current = null;
    if (element instanceof HTMLTextAreaElement && saved.start !== undefined) {
      element.setSelectionRange(Math.min(saved.start, text.length), Math.min(saved.end ?? saved.start, text.length));
    }
    element.scrollTop = saved.top; element.scrollLeft = saved.left;
  }, [text, preview, rendered]);

  const refresh = () => {
    if (dirty && !confirm(t.discardUnsaved)) return;
    forceReload.current = true; refreshRef.current();
  };

  const onType = (next: string) => {
    const now = Date.now();
    if (now - lastEditRef.current > COALESCE_MS) {
      setPast((p) => [...p, text]); // checkpoint = value at start of this burst
      setFuture([]);
    }
    lastEditRef.current = now;
    latest.current.text = next; editRevision.current++;
    setText(next);
  };

  // Flat functional updates (no nested setState) so the handlers are
  // StrictMode-safe; past/future/text come from the current render.
  const undo = () => {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setFuture((f) => [...f, text]);
    setPast((p) => p.slice(0, -1));
    setText(prev);
    latest.current.text = prev; editRevision.current++;
    lastEditRef.current = 0;
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[future.length - 1];
    setPast((p) => [...p, text]);
    setFuture((f) => f.slice(0, -1));
    setText(next);
    latest.current.text = next; editRevision.current++;
    lastEditRef.current = 0;
  };

  const save = async () => {
    if (!editable || !dirty || saving) return;
    if (externalChange && !confirm(t.overwriteExternalChanges)) return;
    latest.current.saving = true;
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveFile(file.targetId, file.session, file.path, text, externalChange ? null : loadedVersion.current);
      setBaseline(text);
      latest.current.baseline = text;
      setExternalChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 412) { setExternalChange(true); setSaveError(t.fileChangedUnsaved); }
      else setSaveError(e instanceof ApiError ? e.message : t.saveFailed);
    } finally {
      setSaving(false);
      latest.current.saving = false;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === 's') {
      e.preventDefault();
      void save();
    } else if (mod && k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      onType(text.slice(0, start) + '  ' + text.slice(end));
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  };

  const requestClose = () => {
    if (dirty && !confirm(t.discardUnsaved)) return;
    onClose();
  };

  return (
    <div className="viewer">
      <div className="viewer-head">
        <span className="viewer-name" title={file.path}>
          {dirty && <span className="dirty-dot" title={t.unsavedChanges}>●</span>}
          {file.name}
        </span>
        <span className="viewer-path" title={`${sourceLabel ?? file.session} · ${file.path}`}>{sourceLabel ?? file.session} · {file.path}</span>
        <div className="viewer-head-spacer" />
        <FileDownload file={file} />
        <button onClick={refresh} disabled={saving} title={t.refreshFile}>{t.refreshFile}</button>
        {kind === 'markdown' && <button aria-pressed={rendered} onClick={() => setRendered(v => !v)}>{rendered ? t.source : t.preview}</button>}
        {editable && (
          <>
            <button onClick={undo} disabled={past.length === 0} title={t.undo}>
              ↶
            </button>
            <button onClick={redo} disabled={future.length === 0} title={t.redo}>
              ↷
            </button>
            <button className="primary" onClick={() => void save()} disabled={!dirty || saving} title={t.saveShortcut}>
              {saving ? t.saving : t.save}
            </button>
          </>
        )}
        {preview?.truncated && <span className="viewer-note">{t.truncatedReadOnly}</span>}
        <button onClick={requestClose} title={t.closeFile}>
          ✕
        </button>
      </div>

      {saveError && <div className="viewer-msg error">{saveError}</div>}
      {externalChange && <div className="viewer-msg" role="status">{t.fileChangedUnsaved}</div>}

      <div className="viewer-body">
        {version && kind === 'image' && <ImageViewer key={file.path} url={`${fileContentUrl(file.targetId, file.session, file.path)}&version=${encodeURIComponent(version)}`} />}
        {version && kind === 'pdf' && <Suspense fallback={<div className="viewer-msg">{t.loading}</div>}><PdfViewer key={file.path} url={`${fileContentUrl(file.targetId, file.session, file.path)}&version=${encodeURIComponent(version)}`} /></Suspense>}
        {loading && <div className="viewer-msg">{t.loading}</div>}
        {loadError && <div className="viewer-msg error">{loadError}</div>}
        {preview && preview.binary && <div className="viewer-msg">{t.binaryNotShown}</div>}
        {preview && !preview.binary && rendered && <div ref={markdownRef} tabIndex={0} aria-label={t.preview} className="markdown-scroll" style={{ fontSize: settings.viewerFontSize }}><MarkdownView text={text} context={file} onOpenFile={onOpenFile} /></div>}
        {preview && !preview.binary && editable && !rendered && (
          <textarea
            ref={taRef}
            className="viewer-editor"
            style={{ fontSize: settings.viewerFontSize }}
            value={text}
            spellCheck={false}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={onKeyDown}
          />
        )}
        {preview && !preview.binary && !editable && !rendered && (
          <pre className="viewer-pre" style={{ fontSize: settings.viewerFontSize }}>
            {preview.content}
          </pre>
        )}
      </div>
    </div>
  );
}
