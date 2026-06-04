import { useEffect, useRef, useState } from 'react';
import type { FilePreview, OpenFile } from '../types';
import { api, ApiError } from '../api';
import { useSettings } from '../settings';
import { useI18n } from '../i18n';

interface Props {
  file: OpenFile;
  onClose: () => void;
}

/** New undo checkpoint after this idle gap, so a burst of typing collapses
 *  into a single undo step. */
const COALESCE_MS = 500;

/** Read-only preview + editor for a text file. Editable only when the file is
 *  text and was not truncated (saving a truncated preview would lose data). */
export function FileViewer({ file, onClose }: Props) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lastEditRef = useRef(0);

  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState('');
  const [baseline, setBaseline] = useState('');
  const [past, setPast] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const editable = !!preview && !preview.binary && !preview.truncated;
  const dirty = editable && text !== baseline;

  // Load (or reload) the file.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setPreview(null);
    setPast([]);
    setFuture([]);
    lastEditRef.current = 0;
    api
      .getFile(file.targetId, file.session, file.path)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setText(p.content);
        setBaseline(p.content);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof ApiError ? e.message : t.failedReadFile);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file.targetId, file.session, file.path, t.failedReadFile]);

  const onType = (next: string) => {
    const now = Date.now();
    if (now - lastEditRef.current > COALESCE_MS) {
      setPast((p) => [...p, text]); // checkpoint = value at start of this burst
      setFuture([]);
    }
    lastEditRef.current = now;
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
    lastEditRef.current = 0;
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[future.length - 1];
    setPast((p) => [...p, text]);
    setFuture((f) => f.slice(0, -1));
    setText(next);
    lastEditRef.current = 0;
  };

  const save = async () => {
    if (!editable || !dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveFile(file.targetId, file.session, file.path, text);
      setBaseline(text);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : t.saveFailed);
    } finally {
      setSaving(false);
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
        <span className="viewer-path">{file.path}</span>
        <div className="viewer-head-spacer" />
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

      <div className="viewer-body">
        {loading && <div className="viewer-msg">{t.loading}</div>}
        {loadError && <div className="viewer-msg error">{loadError}</div>}
        {preview && preview.binary && <div className="viewer-msg">{t.binaryNotShown}</div>}
        {preview && !preview.binary && editable && (
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
        {preview && !preview.binary && !editable && (
          <pre className="viewer-pre" style={{ fontSize: settings.viewerFontSize }}>
            {preview.content}
          </pre>
        )}
      </div>
    </div>
  );
}
