import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
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
  let hovered: string | undefined;
  let pressed: { path: string; x: number; y: number } | undefined;
  const activate = (event: MouseEvent, value: string) => {
    if (event.shiftKey) return; // preserve forced terminal selection
    const path = fileReference(value);
    if (path && onOpenPath) { event.preventDefault(); event.stopPropagation(); onOpenPath(path); }
  };
  const term = new Terminal({
    fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
    fontSize,
    theme: THEME,
    scrollback: 5000,
    cursorBlink: true,
    allowProposedApi: true,
    linkHandler: onOpenPath ? {
      allowNonHttpProtocols: true,
      activate: (event, value) => {
        if (fileReference(value)) { activate(event, value); return; }
        try { const url = new URL(value); if (url.protocol === 'https:' || url.protocol === 'http:') window.open(url.href, '_blank', 'noopener,noreferrer'); } catch { /* unsafe or invalid scheme */ }
      },
      hover: (_event, value) => { hovered = fileReference(value); },
      leave: () => { hovered = undefined; },
    } : undefined,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());
  term.open(container);
  const links = onOpenPath ? term.registerLinkProvider(fileLinkProvider(term, activate, path => { hovered = path; })) : undefined;
  // Consume a file-link click before xterm's mouse reporting can deliver it
  // to tmux/the TUI. Other clicks, wheel events and Shift selection are intact.
  const down = (event: MouseEvent) => {
    if (event.button !== 0 || event.shiftKey || !hovered) return;
    pressed = { path: hovered, x: event.clientX, y: event.clientY };
    event.preventDefault(); event.stopPropagation();
  };
  const up = (event: MouseEvent) => {
    const click = pressed; pressed = undefined;
    if (!click || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    if (container.contains(event.target as Node) && hovered === click.path && Math.hypot(event.clientX - click.x, event.clientY - click.y) <= 5) activate(event, click.path);
  };
  if (onOpenPath) { container.addEventListener('mousedown', down, true); document.addEventListener('mouseup', up, true); }

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
      container.removeEventListener('mousedown', down, true); document.removeEventListener('mouseup', up, true);
      links?.dispose();
      try {
        term.dispose();
      } catch {
        /* ignore */
      }
    },
  };
}
