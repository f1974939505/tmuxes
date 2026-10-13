import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy, type PDFDocumentLoadingTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import { useI18n } from '../i18n';

GlobalWorkerOptions.workerSrc = workerUrl;
// Build/start scripts copy CMaps/fonts/wasm beside the app, never to a CDN.

function Page({ doc, number, scale, width, root }: { doc: PDFDocumentProxy; number: number; scale: number | null; width: number; root: HTMLElement | null }) {
  const ref = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), text = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false), [height, setHeight] = useState(1000), [error, setError] = useState('');
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting), { root, rootMargin: '600px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [root]);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void doc.getPage(number).then(page => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: scale ?? Math.max(0.1, (width - 32) / page.getViewport({ scale: 1 }).width) });
      setHeight(viewport.height);
    }).catch(e => { if (!cancelled) setError(String(e?.message ?? e)); });
    return () => { cancelled = true; };
  }, [doc, number, scale, width, visible]);
  useEffect(() => {
    if (!visible || !canvas.current || !text.current) return;
    let cancelled = false;
    let rendering: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    let layer: TextLayer | undefined;
    const cv = canvas.current, container = text.current;
    setError('');
    void (async () => {
      const page = await doc.getPage(number);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: scale ?? Math.max(0.1, (width - 32) / page.getViewport({ scale: 1 }).width) });
      const ratio = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(16_000_000 / (viewport.width * viewport.height)));
      cv.width = Math.ceil(viewport.width * ratio); cv.height = Math.ceil(viewport.height * ratio);
      cv.style.width = `${viewport.width}px`; cv.style.height = `${viewport.height}px`;
      container.style.setProperty('--scale-factor', String(viewport.scale));
      container.style.setProperty('--total-scale-factor', String(viewport.scale));
      container.style.width = `${viewport.width}px`; container.style.height = `${viewport.height}px`;
      rendering = page.render({ canvas: cv, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      await rendering.promise;
      if (cancelled) return;
      layer = new TextLayer({ textContentSource: await page.getTextContent(), container, viewport });
      await layer.render();
    })().catch(e => { if (!cancelled) setError(String(e?.message ?? e)); });
    return () => { cancelled = true; rendering?.cancel(); layer?.cancel(); container.replaceChildren(); cv.width = cv.height = 0; };
  }, [doc, number, visible, scale, width]);
  return <div ref={ref} className="pdf-page" data-page={number} style={{ height, minHeight: 50 }}>
    {visible && <><canvas ref={canvas} /><div ref={text} className="textLayer" /></>}
    {error && <div className="viewer-msg error">{error}</div>}
  </div>;
}

export default function PdfViewer({ url }: { url: string }) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null), [error, setError] = useState('');
  const [scale, setScale] = useState<number | null>(null), [page, setPage] = useState(1), [width, setWidth] = useState(600);
  const [inverted, setInverted] = useState(() => {
    try { return localStorage.getItem('tmuxes.pdfInverted') === 'true'; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem('tmuxes.pdfInverted', String(inverted)); } catch { /* storage disabled */ } }, [inverted]);
  useEffect(() => {
    let cancelled = false;
    let loading: PDFDocumentLoadingTask | undefined;
    const abort = new AbortController();
    void (async () => {
      const header = await fetch(url, { method: 'HEAD', signal: abort.signal });
      if (!header.ok) throw new Error(header.status === 413 ? 'PDF preview limit: 256 MiB.' : `${header.status} ${header.statusText}`);
      if (cancelled) return;
      const etag = header.headers.get('etag');
      loading = getDocument({ url, httpHeaders: etag ? { 'If-Range': etag } : undefined,
        rangeChunkSize: 512 * 1024, disableStream: true, disableAutoFetch: true,
        cMapUrl: '/pdf-assets/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdf-assets/standard_fonts/', wasmUrl: '/pdf-assets/wasm/' });
      loading.onPassword = (update: (password: string) => void) => {
        const password = prompt(t.pdfPassword);
        if (password === null) { void loading?.destroy(); setError(t.pdfPassword); }
        else update(password);
      };
      const document = await loading.promise;
      if (!cancelled) setDoc(document);
    })().catch(e => { if (!cancelled) setError(String(e?.message ?? e)); });
    return () => { cancelled = true; abort.abort(); void loading?.destroy(); };
  }, [url, t.pdfPassword]);
  useEffect(() => {
    const observer = new ResizeObserver(entries => { if (entries[0].contentRect.width) setWidth(entries[0].contentRect.width); });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const jump = () => host.current?.querySelector(`[data-page="${Math.max(1, Math.min(doc?.numPages ?? 1, page))}"]`)?.scrollIntoView({ block: 'start' });
  return <div className="media-viewer">
    <div className="media-toolbar">
      <button aria-pressed={inverted} onClick={() => setInverted(value => !value)}>{t.pdfInvert}</button>
      <button onClick={() => setScale(null)}>{t.fit}</button>
      <button onClick={() => setScale(s => Math.max(0.25, (s ?? 1) / 1.25))}>−</button>
      <button onClick={() => setScale(s => Math.min(4, (s ?? 1) * 1.25))}>+</button>
      <span>{scale === null ? t.fit : `${Math.round(scale * 100)}%`}</span>
      <label>{t.pageNumber} <input type="number" min={1} max={doc?.numPages ?? 1} value={page} onChange={e => setPage(Number(e.target.value))} onKeyDown={e => { if (e.key === 'Enter') jump(); }} /></label>
      <button onClick={jump}>↵</button><span>/ {doc?.numPages ?? '…'}</span>
    </div>
    <div className={`pdf-surface${inverted ? ' inverted' : ''}`} ref={host}>
      {error && <div className="viewer-msg error">{error}</div>}
      {!doc && !error && <div className="viewer-msg">{t.loading}</div>}
      {doc && Array.from({ length: doc.numPages }, (_, i) => <Page key={i} doc={doc} number={i + 1} scale={scale} width={width} root={host.current} />)}
    </div>
  </div>;
}
