import type { Terminal } from '@xterm/xterm';

/** A text snapshot of the active buffer, not a transcript of the remote session.
 * Join soft-wrapped rows without losing spaces at their boundaries. */
export function terminalSnapshot(term: Pick<Terminal, 'buffer'>): string {
  const buffer = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    if (!line) continue;
    const nextWrapped = buffer.getLine(i + 1)?.isWrapped ?? false;
    const text = line.translateToString(!nextWrapped);
    if (line.isWrapped && lines.length) lines[lines.length - 1] += text;
    else lines.push(text);
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/** Reserve explicit copy shortcuts even without a selection (no DevTools).
 * Plain Ctrl+C without a selection must still reach the running program. */
export function isCopyShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, hasSelection: boolean): boolean {
  if (event.altKey || event.key.toLowerCase() !== 'c') return false;
  return (event.ctrlKey && (event.shiftKey || hasSelection)) || event.metaKey;
}

export async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Legacy browsers: copy inside the initiating user gesture, then restore focus.
  const focused = document.activeElement as HTMLElement | null;
  const input = document.createElement('textarea');
  input.value = text;
  input.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.append(input);
  try {
    input.select();
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
  } finally {
    input.remove();
    focused?.focus({ preventScroll: true });
  }
}
