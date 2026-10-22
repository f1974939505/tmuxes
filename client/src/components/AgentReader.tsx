import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { AgentMessage, AgentMessages, OpenFile, Selection } from '../types';
import { useI18n } from '../i18n';
import { useSettings } from '../settings';
import { MarkdownView } from './LazyMarkdownView';
import { mergeMessages } from '../messages';
import { ReadingScroll } from '../readingScroll';

export function AgentReader({ selection, active, onOpenFile }: { selection: Selection; active: boolean; onOpenFile: (file: OpenFile) => void }) {
  const { t } = useI18n(), { settings } = useSettings();
  const [data, setData] = useState<AgentMessages | null>(null), [messages, setMessages] = useState<AgentMessage[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const state = useRef<{ source: string | null; after?: string; before?: string; watchAfter?: string; busy: boolean; paused: boolean; history: boolean;
    backfill?: 'latest' | 'history'; remaining: number; latest: boolean; tailCheck: boolean; request?: AbortController
  }>({ source: null, busy: false, paused: false, history: false, remaining: 0, latest: false, tailCheck: false });
  const retained = useRef<AgentMessage[]>([]);
  const runRef = useRef<(older?: boolean) => void>(() => {});
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null), follow = useRef(new ReadingScroll());
  const touchY = useRef<number | undefined>(undefined);
  useEffect(() => {
    const observer = new ResizeObserver(() => { if (scroll.current) follow.current.follow(scroll.current); });
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let queued: boolean | undefined;
    const abort = new AbortController();
    const run = async (older = false) => {
      const current = state.current;
      if (cancelled || current.busy || queued !== undefined || (!older && current.paused) || document.hidden) return;
      const latest = current.latest;
      const backfill = !older && !latest && !(current.backfill === 'latest' && current.tailCheck) ? current.backfill : undefined;
      current.tailCheck = false;
      const backwards = older || !!backfill;
      current.busy = true; current.request = abort; setBusy(true);
      const element = scroll.current;
      const watching = !backwards && !latest && !follow.current.following;
      try {
        const result = await api.getMessages(selection.targetId, selection.session,
          latest ? undefined : backwards ? current.before : watching ? current.watchAfter ?? current.after : current.after,
          backwards ? 'older' : 'newer', abort.signal);
        if (cancelled) return;
        if ((watching || (!backwards && !latest && !follow.current.following)) && result.source === current.source && result.availability === 'ready' && (!result.reset || result.jumpedToLatest)) {
          // Continue validating the pane owner and drain new events without
          // moving the user's historical viewport. A changed source, rewritten
          // transcript, or ended process still clears the old conversation.
          current.watchAfter = result.after ?? undefined;
          return;
        }
        current.watchAfter = undefined;
        const continueSearch = result.jumpedToLatest && current.source === result.source && current.backfill === 'latest' && !result.messages.length && !latest;
        const searchBefore = current.before;
        const reset = latest || current.source !== result.source || result.reset || result.availability !== 'ready';
        // Capture history anchors after the network wait, at the user's current
        // position. A subsequent wheel/drag/key invalidates the queued adjustment.
        const height = element?.scrollHeight ?? 0;
        const viewportTop = element?.getBoundingClientRect().top ?? 0;
        const firstVisible = [...element?.querySelectorAll<HTMLElement>('[data-reading-id]') ?? []]
          .find(item => item.getBoundingClientRect().bottom > viewportTop);
        const anchor = firstVisible ? { id: firstVisible.dataset.readingId, top: firstVisible.getBoundingClientRect().top } : undefined;
        const layoutIntent = follow.current.revision;
        current.latest = false;
        current.paused = false;
        current.source = result.source;
        if (!backwards || reset) current.after = result.after ?? undefined;
        if (backwards || reset) current.before = result.before ?? undefined;
        if (reset && continueSearch && result.availability === 'ready') current.before = searchBefore;
        if (reset) { current.history = false; current.backfill = undefined; }
        else if (older) current.history = true;
        // Filtering a large tool-only tail can yield an empty bounded scan.
        // Keep moving backwards automatically until recent text is found;
        // the after cursor stays at the tail for subsequent live updates.
        const startBackfill = reset || older;
        if (startBackfill) current.remaining = older && !reset ? 50 : 1;
        if (startBackfill || backfill) {
          current.remaining -= result.messages.length;
          current.backfill = result.availability === 'ready' && result.limited && current.before && current.remaining > 0
            ? (older || backfill === 'history' ? 'history' : 'latest') : undefined;
        }
        if (backfill === 'latest' && current.backfill) current.tailCheck = true;
        if (!backwards && !reset && result.messages.length && current.backfill === 'latest') current.backfill = undefined;
        setData(previous => ({ ...result, oversized: result.oversized || ((!reset || continueSearch) && previous?.oversized) })); setError('');
        if (reset || result.messages.length) {
          const merged = mergeMessages(reset ? [] : retained.current, result.messages, backwards && !reset);
          retained.current = merged.messages; setMessages(merged.messages);
          if (merged.trimmed && backwards) {
            current.after = merged.messages.at(-1)?.after;
            current.history = true;
          } else if (merged.trimmed) current.before = merged.messages[0]?.before ?? undefined;
        }
        requestAnimationFrame(() => {
          if (cancelled || !element || element !== scroll.current || layoutIntent !== follow.current.revision) return;
          if (backwards && !reset && !follow.current.following) {
            const retainedAnchor = anchor && [...element.querySelectorAll<HTMLElement>('[data-reading-id]')]
              .find(item => item.dataset.readingId === anchor.id);
            follow.current.position(element, element.scrollTop + (retainedAnchor ? retainedAnchor.getBoundingClientRect().top - anchor.top : element.scrollHeight - height), layoutIntent);
          }
          else follow.current.follow(element, layoutIntent);
        });
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); current.paused = true; }
      } finally {
        if (current.request === abort) {
          current.busy = false;
          if (!cancelled) {
            setBusy(false);
            if (queued !== undefined) requestAnimationFrame(() => {
              if (cancelled || queued === undefined) return;
              const next = queued; queued = undefined;
              request(next, true);
            });
          }
        }
      }
    };
    const request = (older = false, queuedIntent = false) => {
      if (!queuedIntent && scroll.current) {
        if (older) follow.current.input(-1, scroll.current);
        else { follow.current.latest(scroll.current); follow.current.follow(scroll.current); }
      }
      // React may not have disabled the button when a timer starts a request.
      // Preserve one manual intent; repeated clicks coalesce, latest click wins.
      if (state.current.busy || queued !== undefined) { queued = older; return; }
      if (!older) {
        state.current.paused = false;
        state.current.latest = true;
        state.current.backfill = undefined;
      }
      void run(older);
    };
    runRef.current = request;
    void run();
    const timer = window.setInterval(() => void run(), 3000);
    const show = () => { if (!document.hidden) void run(); };
    document.addEventListener('visibilitychange', show);
    const connected = (event: Event) => {
      if ((event as CustomEvent).detail.targetId === selection.targetId) { state.current.paused = false; void run(); }
    };
    window.addEventListener('tmuxes:target-connected', connected);
    return () => {
      cancelled = true; abort.abort();
      if (state.current.request === abort) { state.current.busy = false; state.current.request = undefined; }
      window.clearInterval(timer); document.removeEventListener('visibilitychange', show); window.removeEventListener('tmuxes:target-connected', connected);
    };
  }, [selection.targetId, selection.session, active]);
  const context = useMemo(() => data?.cwd ? { ...selection, path: `${data.cwd}/.tmuxes-reading.md`, name: '' } : undefined,
    [data?.cwd, selection.targetId, selection.session]);
  return <div className="viewer">
    <div className="viewer-head"><strong>{t.reading}</strong><span>{selection.session}</span><div className="viewer-head-spacer" />
      {state.current.before && <button disabled={busy} onClick={() => runRef.current(true)}>{t.loadEarlier}</button>}
      <button disabled={busy} title={t.refreshReading} onClick={() => runRef.current()}>{t.latestMessages}</button></div>
    <div ref={scroll} className="reading-scroll" tabIndex={0} style={{ fontSize: settings.viewerFontSize }}
      onWheel={e => { if (e.deltaY) follow.current.input(e.deltaY, e.currentTarget); }}
      onPointerDown={e => follow.current.input(0, e.currentTarget)}
      onTouchStart={e => { touchY.current = e.touches[0]?.clientY; }}
      onTouchMove={e => {
        const next = e.touches[0]?.clientY;
        if (next !== undefined && touchY.current !== undefined && next !== touchY.current)
          follow.current.input(touchY.current - next, e.currentTarget);
        touchY.current = next;
      }}
      onKeyDown={e => {
        const up = ['ArrowUp', 'PageUp', 'Home'].includes(e.key) || (e.key === ' ' && e.shiftKey);
        const down = ['ArrowDown', 'PageDown', 'End'].includes(e.key) || (e.key === ' ' && !e.shiftKey);
        if (up || down) follow.current.input(up ? -1 : 1, e.currentTarget);
      }}
      onScroll={e => follow.current.observe(e.currentTarget)}><div ref={content}>
      {error && <div className="viewer-msg error">{error}</div>}
      {data?.availability === 'unavailable' && <div className="viewer-msg">{t.readingUnavailable}</div>}
      {data?.availability === 'unsupported' && <div className="viewer-msg">{t.readingUnsupported}</div>}
      {messages.map(message => <article key={`${data?.source}:${message.id}`} data-reading-id={message.id} className={`reading-message ${message.role}`}>
        <div className="reading-role">{message.role === 'user' ? t.userMessage : t.assistantMessage}</div>
        <MarkdownView text={message.markdown} context={context} onOpenFile={onOpenFile} />
        {message.truncated && <div className="viewer-note">{t.truncatedMessage}</div>}
      </article>)}
      {data?.availability === 'ready' && !messages.length && <div className="viewer-msg">{state.current.backfill ? t.readingScanning : t.readingEmpty}</div>}
      {data?.limited && <div className="viewer-note">{t.readingLimited}</div>}
      {data?.oversized && <div className="viewer-note">{t.readingOversized}</div>}
      {busy && !data && <div className="viewer-msg">{t.loading}</div>}
    </div></div>
  </div>;
}
