import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Terminal } from '@xterm/xterm';
import { useI18n } from '../i18n';
import { useSettings } from '../settings';
import { isCopyShortcut, terminalSnapshot, writeClipboard } from '../terminalCopy';
import { TerminalMenu } from './TerminalMenu';
import { attachTerminalMouse } from '../terminalMouse';

interface Props {
  terminal: Terminal | null;
  actions: ReactNode;
  overlay: ReactNode;
  children: ReactNode;
  fontSize: number;
  onRead: () => void;
  onRender: (text: string) => void;
  connected: boolean;
}

export function TerminalClipboard({ terminal, actions, overlay, children, fontSize, onRead, onRender, connected }: Props) {
  const { t } = useI18n();
  const { settings, setSetting } = useSettings();
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [feedback, setFeedback] = useState<'copied' | 'copyFailed' | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const feedbackTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(false);
  const copyOnSelect = useRef(settings.copyOnSelect);
  copyOnSelect.current = settings.copyOnSelect;
  const selecting = snapshot !== null;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const mouseState = useRef({ selecting, rightClickToTerminal: settings.rightClickToTerminal });
  mouseState.current = { selecting, rightClickToTerminal: settings.rightClickToTerminal };
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false), [pasteText, setPasteText] = useState('');
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const live = useRef({ terminal, connected });
  live.current = { terminal, connected };
  const closeMenu = useCallback((focus = true) => {
    setMenu(null);
    if (focus) (textRef.current ?? live.current.terminal?.textarea)?.focus({ preventScroll: true });
  }, []);
  const paste = async () => {
    const target = terminal;
    if (!target || !connected) return;
    // Keep the read in this user gesture. Never append Enter; xterm preserves
    // the application's bracketed-paste mode and newline normalization.
    try {
      if (!navigator.clipboard?.readText) throw new Error('Clipboard unavailable');
      const text = await navigator.clipboard.readText();
      if (!mounted.current || live.current.terminal !== target || !live.current.connected) return;
      target.paste(text); target.focus();
    } catch {
      if (mounted.current && live.current.terminal === target) { setPasteText(''); setPasteOpen(true); }
    }
  };
  useEffect(() => { if (pasteOpen) pasteRef.current?.focus(); }, [pasteOpen]);

  const copy = useCallback((text: string) => {
    if (!text) return;
    // Start the clipboard request synchronously inside the click/key/mouseup.
    void writeClipboard(text).then(() => report('copied'), () => report('copyFailed'));
    function report(result: 'copied' | 'copyFailed') {
      if (!mounted.current) return;
      window.clearTimeout(feedbackTimer.current);
      setFeedback(result);
      feedbackTimer.current = window.setTimeout(() => setFeedback(null), 4000);
    }
  }, []);

  const selectedText = () => {
    const input = textRef.current;
    return input ? input.value.slice(input.selectionStart, input.selectionEnd) : terminal?.getSelection() ?? '';
  };

  useEffect(() => {
    if (!terminal || !surfaceRef.current) return;
    return attachTerminalMouse(surfaceRef.current, terminal, () => mouseState.current, (x, y) => {
      const input = textRef.current;
      setMenu({ x, y, text: input ? input.value.slice(input.selectionStart, input.selectionEnd) : terminal.getSelection() });
    });
  }, [terminal]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(feedbackTimer.current);
    };
  }, []);

  useEffect(() => {
    setSnapshot(null);
    setHasSelection(false);
    setFeedback(null);
    setMenu(null); setPasteOpen(false);
    if (!terminal) return;
    const selection = terminal.onSelectionChange(() => {
      if (!textRef.current) setHasSelection(terminal.hasSelection());
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
        event.preventDefault();
        if (event.type === 'keydown' && !event.repeat) {
          const rect = terminal.element?.getBoundingClientRect();
          setMenu({ x: (rect?.left ?? 0) + 20, y: (rect?.top ?? 0) + 20, text: terminal.getSelection() });
        }
        return false;
      }
      if (!isCopyShortcut(event, terminal.hasSelection())) return true;
      event.preventDefault();
      if (event.type === 'keydown' && !event.repeat) copy(terminal.getSelection());
      return false;
    });
    // Copy on mouse release, never on every selection-change/PTY output event.
    let before: string | null = null;
    const currentSelection = () => {
      const input = textRef.current;
      return input ? input.value.slice(input.selectionStart, input.selectionEnd) : terminal.getSelection();
    };
    const down = (event: MouseEvent) => {
      before = event.button === 0 && (event.target === textRef.current || terminal.element?.contains(event.target as Node))
        ? currentSelection() : null;
    };
    const up = (event: MouseEvent) => {
      const text = currentSelection();
      if (event.button === 0 && before !== null && text !== before && copyOnSelect.current) copy(text);
      before = null;
    };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('mouseup', up);
    return () => {
      selection.dispose();
      terminal.attachCustomKeyEventHandler(() => true);
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('mouseup', up);
    };
  }, [terminal, copy]);

  useEffect(() => {
    if (!selecting) {
      terminal?.focus();
      return;
    }
    if (!textRef.current) return;
    const input = textRef.current;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
    input.scrollTop = input.scrollHeight;
  }, [selecting, terminal]);

  const toggleSelection = () => {
    setFeedback(null);
    if (selecting) {
      setSnapshot(null);
      setHasSelection(terminal?.hasSelection() ?? false);
    } else if (terminal) {
      setSnapshot(terminalSnapshot(terminal));
      setHasSelection(false);
    }
  };

  return (
    <div className="terminal-content">
      <div className="terminal-toolbar" role="toolbar" aria-label={t.terminal}>
        <button disabled={!terminal} aria-pressed={selecting} onClick={toggleSelection} title={t.selectTextHint}>
          {selecting ? t.returnToTerminal : t.selectText}
        </button>
        <button disabled={!hasSelection} onMouseDown={(event) => event.preventDefault()}
          onClick={() => copy(selectedText())} title={t.copyShortcut}>
          {t.copy}
        </button>
        <button disabled={!terminal || !connected || selecting} onClick={() => void paste()} title={t.pasteHint}>{t.paste}</button>
        <button disabled={!terminal} aria-haspopup="menu" aria-expanded={menu !== null} onMouseDown={e => e.preventDefault()}
          onClick={e => { const rect = e.currentTarget.getBoundingClientRect(); setMenu({ x: rect.left, y: rect.bottom, text: selectedText() }); }}>
          {t.terminalMenu}
        </button>
        <span className={`copy-feedback${feedback === 'copyFailed' ? ' copy-error' : ''}`} role="status">
          {feedback ? t[feedback] : ''}
        </span>
        <button onClick={onRead}>{t.reading}</button>
        <button disabled={!hasSelection} onMouseDown={e => e.preventDefault()} onClick={() => onRender(selectedText())}>{t.renderSelection}</button>
        <div className="agent-toolbar">{actions}</div>
      </div>
      <div className="selection-hint" title={selecting ? t.snapshotHint : settings.rightClickToTerminal ? t.interactApplicationHint : t.interactHint}>
        {selecting ? t.snapshotHint : settings.rightClickToTerminal ? t.interactApplicationHint : t.interactHint}
      </div>
      <div className="terminal-surface" ref={surfaceRef}>
        <div className={selecting ? 'terminal-live terminal-live-hidden' : 'terminal-live'} aria-hidden={selecting}>
          {children}
        </div>
        {selecting && (
          <textarea ref={textRef} className="terminal-snapshot" aria-label={t.selectText}
            style={{ fontSize }} value={snapshot} readOnly wrap="off" spellCheck={false}
            onSelect={() => setHasSelection(selectedText().length > 0)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                toggleSelection();
              } else if (isCopyShortcut(event, selectedText().length > 0)) {
                event.preventDefault();
                if (!event.repeat) copy(selectedText());
              }
            }}
          />
        )}
        {overlay}
      </div>
      {menu && <TerminalMenu x={menu.x} y={menu.y} label={t.terminalMenu} onClose={closeMenu} actions={[
        { label: t.copy, disabled: !menu.text, run: () => copy(menu.text) },
        { label: t.paste, disabled: !terminal || !connected || selecting, run: () => void paste() },
        { label: t.selectAll, disabled: !terminal, run: () => {
          if (textRef.current) { textRef.current.focus(); textRef.current.select(); setHasSelection(true); }
          else { terminal?.selectAll(); terminal?.focus(); }
        } },
        { label: t.renderSelection, disabled: !menu.text, run: () => onRender(menu.text) },
        { label: t.reading, run: onRead },
        { label: t.scrollToTop, run: () => { if (textRef.current) textRef.current.scrollTop = 0; else terminal?.scrollToTop(); } },
        { label: t.scrollToBottom, run: () => { if (textRef.current) textRef.current.scrollTop = textRef.current.scrollHeight; else terminal?.scrollToBottom(); } },
        { label: t.redrawTerminal, disabled: !terminal || !connected || selecting, run: () => terminal?.input('\x0c', true) },
        { label: t.rightClickToTerminal, checked: settings.rightClickToTerminal,
          run: () => setSetting('rightClickToTerminal', !settings.rightClickToTerminal) },
      ]} />}
      {pasteOpen && <div className="terminal-paste-backdrop" onMouseDown={event => {
        if (event.target === event.currentTarget) { setPasteOpen(false); terminal?.focus(); }
      }}><div className="terminal-paste" role="dialog" aria-modal="true" aria-label={t.paste} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); setPasteOpen(false); terminal?.focus(); }
        if (event.key === 'Tab') {
          const items = [...event.currentTarget.querySelectorAll<HTMLElement>('textarea, button:not(:disabled)')];
          if ((!event.shiftKey && document.activeElement === items.at(-1)) || (event.shiftKey && document.activeElement === items[0])) {
            event.preventDefault(); (event.shiftKey ? items.at(-1) : items[0])?.focus();
          }
        }
      }}>
        <strong>{t.paste}</strong><p>{t.pasteFallback}</p>
        <textarea ref={pasteRef} value={pasteText} onChange={e => setPasteText(e.target.value)} aria-label={t.paste} />
        <div><button onClick={() => { setPasteOpen(false); terminal?.focus(); }}>{t.cancel}</button>
          <button disabled={!connected || !pasteText} onClick={() => {
            if (connected) terminal?.paste(pasteText);
            setPasteOpen(false); setPasteText(''); terminal?.focus();
          }}>{t.paste}</button></div>
      </div></div>}
    </div>
  );
}
