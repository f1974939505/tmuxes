import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

export interface TerminalHandle {
  term: Terminal;
  fit: FitAddon;
  /** Fit to the container and return the resulting geometry (or null if size 0). */
  refit(): { cols: number; rows: number } | null;
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
export function createTerminal(container: HTMLElement, fontSize: number): TerminalHandle {
  const term = new Terminal({
    fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
    fontSize,
    theme: THEME,
    scrollback: 5000,
    cursorBlink: true,
    allowProposedApi: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());
  term.open(container);

  function refit(): { cols: number; rows: number } | null {
    if (container.clientWidth === 0 || container.clientHeight === 0) return null;
    try {
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
      try {
        term.dispose();
      } catch {
        /* ignore */
      }
    },
  };
}
