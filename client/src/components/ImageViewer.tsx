import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

export function ImageViewer({ url }: { url: string }) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [error, setError] = useState('');
  useEffect(() => setError(''), [url]);
  return <div className="media-viewer">
    <div className="media-toolbar">
      <button onClick={() => setZoom(null)}>{t.fit}</button>
      <button onClick={() => setZoom(1)}>{t.originalSize}</button>
      <button onClick={() => setZoom(z => Math.max(0.05, (z ?? 1) / 1.25))}>−</button>
      <button onClick={() => setZoom(z => Math.min(8, (z ?? 1) * 1.25))}>+</button>
      <span>{zoom === null ? t.fit : `${Math.round(zoom * 100)}%`} · {size.width} × {size.height}</span>
    </div>
    <div className="image-surface" ref={host} tabIndex={0} aria-label={t.preview}
      onPointerDown={e => {
        if (e.button !== 0 || !host.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, left: host.current.scrollLeft, top: host.current.scrollTop };
      }} onPointerMove={e => {
        if (!drag.current || !host.current) return;
        host.current.scrollLeft = drag.current.left + drag.current.x - e.clientX;
        host.current.scrollTop = drag.current.top + drag.current.y - e.clientY;
      }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {error ? <div className="viewer-msg error">{error}</div> : <img src={url} alt="" draggable={false}
        className={zoom === null ? 'image-fit' : ''} style={zoom !== null && size.width ? { width: size.width * zoom, maxWidth: 'none' } : undefined}
        onLoad={e => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
        onError={() => setError(t.imageFailed)} />}
    </div>
  </div>;
}
