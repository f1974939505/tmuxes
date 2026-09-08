import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Terminal } from '@xterm/xterm';
import { useI18n } from '../i18n';
import { useSettings } from '../settings';
import { isCopyShortcut, terminalSnapshot, writeClipboard } from '../terminalCopy';

interface Props {
  terminal: Terminal | null;
  actions: ReactNode;
  overlay: ReactNode;
  children: ReactNode;
  fontSize: number;
}

export function TerminalClipboard({ terminal, actions, overlay, children, fontSize }: Props) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [feedback, setFeedback] = useState<'copied' | 'copyFailed' | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const feedbackTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(false);
  const copyOnSelect = useRef(settings.copyOnSelect);
  copyOnSelect.current = settings.copyOnSelect;
  const selecting = snapshot !== null;

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
    if (!terminal) return;
    const selection = terminal.onSelectionChange(() => {
      if (!textRef.current) setHasSelection(terminal.hasSelection());
    });
    terminal.attachCustomKeyEventHandler((event) => {
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
    document.addEventListener('mousedown', down);
    document.addEventListener('mouseup', up);
    return () => {
      selection.dispose();
      terminal.attachCustomKeyEventHandler(() => true);
      document.removeEventListener('mousedown', down);
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
        <span className={`copy-feedback${feedback === 'copyFailed' ? ' copy-error' : ''}`} role="status">
          {feedback ? t[feedback] : ''}
        </span>
        <div className="agent-toolbar">{actions}</div>
      </div>
      <div className="selection-hint" title={selecting ? t.snapshotHint : t.interactHint}>
        {selecting ? t.snapshotHint : t.interactHint}
      </div>
      <div className="terminal-surface">
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
    </div>
  );
}
