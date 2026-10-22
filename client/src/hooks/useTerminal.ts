import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { fileReference } from '../fileLinks';
import { fileLinkProvider } from '../terminalFileLinks';

export interface TerminalHandle {
  term: Terminal;
  fit: FitAddon;
  /** Measure geometry; apply only before connecting, then wait for ordered server geometry. */
  refit(apply?: boolean): { cols: number; rows: number } | null;
  dispose(): void;
}

const THEME = {
  background: '#000000',
  foreground: '#c0caf5',
  cursor: '#c0caf5',
  selectionBackground: '#33467c',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
};

/** Create + open an xterm Terminal in `container`. Caller owns the lifecycle
 *  and must call dispose() (this is invoked from a single effect with a key, so
 *  React StrictMode's double-mount is handled by clean teardown). */
export function createTerminal(container: HTMLElement, fontSize: number, onOpenPath?: (path: string) => void): TerminalHandle {
  type Link = { kind: 'file' | 'web'; value: string };
  type Click = { x: number; y: number; pointer: number; dragged: boolean };
  let hovered: Link | undefined;
  let pressed: Click | undefined, pending: Click | undefined;
  let clickFrame: number | undefined;
  const reference = (value: string): Link | undefined => {
    const path = onOpenPath && fileReference(value);
    if (path) return { kind: 'file', value: path };
    try { const url = new URL(value); if (url.protocol === 'https:' || url.protocol === 'http:') return { kind: 'web', value: url.href }; } catch { /* invalid URL */ }
    return undefined;
  };
  // Link activation is handled by the complete pointer gesture below. xterm's
  // link mouseup alone cannot distinguish clicking a path from selecting it.
  const activate = () => {};
  const term = new Terminal({
    fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
    fontSize,
    letterSpacing: 0,
    lineHeight: 1.1,
    theme: THEME,
    scrollback: 5000,
    cursorBlink: true,
    allowProposedApi: true,
    macOptionClickForcesSelection: true,
    altClickMovesCursor: false,
    linkHandler: {
      allowNonHttpProtocols: !!onOpenPath,
      activate,
      hover: (_event, value) => { hovered = reference(value); },
      leave: () => { hovered = undefined; },
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = '11';
  term.loadAddon(new WebLinksAddon(activate, {
    hover: (_event, value) => { hovered = reference(value); }, leave: () => { hovered = undefined; },
  }));
  term.open(container);
  const links = onOpenPath ? term.registerLinkProvider(fileLinkProvider(term, activate, path => {
    hovered = path ? { kind: 'file', value: path } : undefined;
  })) : undefined;
  // Observe real pointer events before mouse routing. Never swallow the down:
  // a drag beginning on a path must still start xterm's normal text selection.
  const down = (event: PointerEvent) => {
    pressed = undefined; pending = undefined;
    if (event.button !== 0 || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    pressed = { x: event.clientX, y: event.clientY, pointer: event.pointerId, dragged: false };
  };
  const move = (event: PointerEvent) => {
    if (pressed?.pointer === event.pointerId && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 5) pressed.dragged = true;
    if (pending?.pointer === event.pointerId && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 5) pending = undefined;
  };
  const up = (event: PointerEvent) => {
    const click = pressed; pressed = undefined;
    if (!click || click.dragged || event.pointerId !== click.pointer || event.button !== 0
        || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!container.contains(event.target as Node) || Math.hypot(event.clientX - click.x, event.clientY - click.y) > 5) return;
    pending = click;
    // Providers may resolve hover after the pointer down. Finish after one
    // frame, while the browser still retains this click's user activation.
    window.cancelAnimationFrame(clickFrame ?? 0);
    clickFrame = window.requestAnimationFrame(() => {
      if (pending !== click) return;
      pending = undefined;
      if (hovered?.kind === 'file') onOpenPath?.(hovered.value);
      else if (hovered?.kind === 'web') window.open(hovered.value, '_blank', 'noopener,noreferrer');
    });
  };
  const cancel = () => { pressed = undefined; pending = undefined; };
  container.addEventListener('pointerdown', down, true);
  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', cancel, true);
  window.addEventListener('blur', cancel);

  function refit(apply = true): { cols: number; rows: number } | null {
    if (container.clientWidth === 0 || container.clientHeight === 0) return null;
    try {
      if (!apply) return fit.proposeDimensions() ?? null;
      fit.fit();
    } catch {
      return null;
    }
    return { cols: term.cols, rows: term.rows };
  }

  return {
    term,
    fit,
    refit,
    dispose() {
      cancel(); window.cancelAnimationFrame(clickFrame ?? 0);
      container.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('blur', cancel);
      links?.dispose();
      try {
        term.dispose();
      } catch {
        /* ignore */
      }
    },
  };
}
