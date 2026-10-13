import { useEffect, useState, type RefObject } from 'react';
import { offscreenAttention, type AttentionMarker } from '../offscreenAttention';

export function useOffscreenAttention(viewportRef: RefObject<HTMLDivElement | null>, contentRef: RefObject<HTMLDivElement | null>) {
  const [hints, setHints] = useState(() => offscreenAttention<HTMLElement>([], { top: 0, bottom: 0 }));
  useEffect(() => {
    const viewport = viewportRef.current, content = contentRef.current;
    if (!viewport || !content) return;
    let frame: number | undefined;
    const measure = () => {
      frame = undefined;
      const rect = viewport.getBoundingClientRect();
      const markers: AttentionMarker<HTMLElement>[] = [];
      for (const element of content.querySelectorAll<HTMLElement>('[data-attention]')) {
        const reason = element.dataset.attention;
        if (reason !== 'done' && reason !== 'decision' && reason !== 'error') continue;
        if (!element.getClientRects().length) continue;
        const box = element.getBoundingClientRect();
        const count = Number(element.dataset.attentionCount ?? 1);
        if (!Number.isSafeInteger(count) || count < 1) continue;
        const name = element.dataset.attentionLabel ?? '';
        const group = element.closest<HTMLElement>('.target-group')?.dataset.targetLabel;
        markers.push({ top: box.top, bottom: box.bottom, count, reason, target: element,
          label: group && group !== name ? `${group} / ${name}` : name });
      }
      const next = offscreenAttention(markers, { top: rect.top, bottom: rect.bottom });
      setHints(previous => ['above', 'below'].every(key => {
        const old = previous[key as 'above' | 'below'], value = next[key as 'above' | 'below'];
        return old.count === value.count && old.reason === value.reason && old.target === value.target && old.labels === value.labels;
      }) ? previous : next);
    };
    const schedule = () => { frame ??= requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    resize.observe(viewport); resize.observe(content);
    const mutations = new MutationObserver(schedule);
    mutations.observe(content, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-attention', 'data-attention-count', 'data-attention-label', 'data-target-label', 'class', 'style'] });
    viewport.addEventListener('scroll', schedule, { passive: true });
    schedule();
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect(); viewport.removeEventListener('scroll', schedule); };
  }, [viewportRef, contentRef]);
  const reveal = (direction: 'above' | 'below') => {
    const viewport = viewportRef.current, target = hints[direction].target;
    if (!viewport || !target?.isConnected) return;
    const rect = viewport.getBoundingClientRect(), box = target.getBoundingClientRect();
    viewport.scrollTop += box.top - rect.top - (viewport.clientHeight - box.height) / 2;
  };
  return { ...hints, reveal };
}
