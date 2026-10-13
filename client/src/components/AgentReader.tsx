import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { AgentMessage, AgentMessages, OpenFile, Selection } from '../types';
import { useI18n } from '../i18n';
import { useSettings } from '../settings';
import { MarkdownView } from './LazyMarkdownView';
import { mergeMessages } from '../messages';

export function AgentReader({ selection, active, onOpenFile }: { selection: Selection; active: boolean; onOpenFile: (file: OpenFile) => void }) {
  const { t } = useI18n(), { settings } = useSettings();
  const [data, setData] = useState<AgentMessages | null>(null), [messages, setMessages] = useState<AgentMessage[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const state = useRef<{ source: string | null; after?: string; before?: string; busy: boolean; paused: boolean; history: boolean }>({ source: null, busy: false, paused: false, history: false });
  const retained = useRef<AgentMessage[]>([]);
  const runRef = useRef<(older?: boolean) => void>(() => {});
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null), stick = useRef(true);
  useEffect(() => {
    const observer = new ResizeObserver(() => { if (stick.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; });
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const abort = new AbortController();
    const run = async (older = false) => {
      const current = state.current;
      if (cancelled || current.busy || (!older && current.paused) || document.hidden) return;
      current.busy = true; setBusy(true);
      const element = scroll.current;
      const follow = !!element && element.scrollHeight - element.clientHeight - element.scrollTop < 80;
      if (!older && current.history && !follow) { current.busy = false; setBusy(false); return; }
      const height = element?.scrollHeight ?? 0;
      try {
        const result = await api.getMessages(selection.targetId, selection.session, older ? current.before : current.after, older ? 'older' : 'newer', abort.signal);
        if (cancelled) return;
        const reset = current.source !== result.source || result.reset || result.availability !== 'ready';
        current.source = result.source;
        if (!older || reset) current.after = result.after ?? undefined;
        if (older || reset) current.before = result.before ?? undefined;
        setData(result); setError('');
        if (reset || result.messages.length) {
          const merged = mergeMessages(reset ? [] : retained.current, result.messages, older && !reset);
          retained.current = merged.messages; setMessages(merged.messages);
          if (reset) current.history = false;
          if (merged.trimmed && older) {
            current.after = merged.messages.at(-1)?.after;
            current.history = true;
          } else if (merged.trimmed) current.before = merged.messages[0]?.before ?? undefined;
        }
        requestAnimationFrame(() => {
          if (!element) return;
          if (older && !reset) { stick.current = false; element.scrollTop += element.scrollHeight - height; }
          else if (follow || reset) { stick.current = true; element.scrollTop = element.scrollHeight; }
        });
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); current.paused = true; }
      } finally { current.busy = false; if (!cancelled) setBusy(false); }
    };
    runRef.current = (older = false) => {
      if (!older) {
        state.current.paused = false;
        if (state.current.history) { state.current.after = undefined; state.current.source = null; state.current.history = false; }
      }
      void run(older);
    };
    void run();
    const timer = window.setInterval(() => void run(), 3000);
    const show = () => { if (!document.hidden) void run(); };
    document.addEventListener('visibilitychange', show);
    const connected = (event: Event) => {
      if ((event as CustomEvent).detail.targetId === selection.targetId) { state.current.paused = false; void run(); }
    };
    window.addEventListener('tmuxes:target-connected', connected);
    return () => { cancelled = true; abort.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', show); window.removeEventListener('tmuxes:target-connected', connected); };
  }, [selection.targetId, selection.session, active]);
  const context = useMemo(() => data?.cwd ? { ...selection, path: `${data.cwd}/.tmuxes-reading.md`, name: '' } : undefined,
    [data?.cwd, selection.targetId, selection.session]);
  return <div className="viewer">
    <div className="viewer-head"><strong>{t.reading}</strong><span>{selection.session}</span><div className="viewer-head-spacer" />
      <button disabled={busy} onClick={() => runRef.current()}>{t.refreshReading}</button></div>
    <div ref={scroll} className="reading-scroll" style={{ fontSize: settings.viewerFontSize }} onScroll={e => {
      const element = e.currentTarget;
      stick.current = element.scrollHeight - element.clientHeight - element.scrollTop < 80;
    }}><div ref={content}>
      {error && <div className="viewer-msg error">{error}</div>}
      {data?.availability === 'unavailable' && <div className="viewer-msg">{t.readingUnavailable}</div>}
      {data?.availability === 'unsupported' && <div className="viewer-msg">{t.readingUnsupported}</div>}
      {state.current.before && <button disabled={busy} onClick={() => runRef.current(true)}>{t.loadEarlier}</button>}
      {messages.map(message => <article key={`${data?.source}:${message.id}`} className={`reading-message ${message.role}`}>
        <div className="reading-role">{message.role === 'user' ? t.userMessage : t.assistantMessage}</div>
        <MarkdownView text={message.markdown} context={context} onOpenFile={onOpenFile} />
        {message.truncated && <div className="viewer-note">{t.truncatedMessage}</div>}
      </article>)}
      {data?.availability === 'ready' && !messages.length && <div className="viewer-msg">{t.readingEmpty}</div>}
      {data?.limited && <div className="viewer-note">{t.readingLimited}</div>}
      {busy && !data && <div className="viewer-msg">{t.loading}</div>}
    </div></div>
  </div>;
}
