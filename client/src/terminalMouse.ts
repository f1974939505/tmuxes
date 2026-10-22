import type { Terminal } from '@xterm/xterm';

/** Keep ordinary left drags local even when tmux/TUIs enable mouse reporting.
 * Ctrl/Meta+left and Shift+right route to the application. xterm still owns
 * selection, coordinates and protocol encoding; the wheel is untouched. */
export function attachTerminalMouse(surface: HTMLElement, terminal: Pick<Terminal, 'modes' | 'element' | 'clearSelection'>,
  options: () => { selecting: boolean; rightClickToTerminal: boolean },
  open: (x: number, y: number) => void): () => void {
  const document = surface.ownerDocument;
  const relayed = new WeakSet<Event>();
  let held: EventTarget | null = null;
  let left: { target: EventTarget; select: boolean } | null = null;
  let blockedRight = false;
  const mac = /Mac|iPhone|iPad/.test(document.defaultView?.navigator.platform ?? '');
  const stop = (event: MouseEvent) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const passthrough = (event: MouseEvent) => {
    const state = options();
    return !state.selecting && terminal.modes.mouseTrackingMode !== 'none' && (event.shiftKey || state.rightClickToTerminal);
  };
  const relay = (event: MouseEvent, target: EventTarget, modifiers: Partial<MouseEventInit> = { shiftKey: false }) => {
    stop(event);
    const copy = new MouseEvent(event.type, { bubbles: true, cancelable: true, view: event.view,
      button: event.button, buttons: event.buttons, clientX: event.clientX, clientY: event.clientY,
      screenX: event.screenX, screenY: event.screenY, ctrlKey: event.ctrlKey, altKey: event.altKey,
      metaKey: event.metaKey, shiftKey: event.shiftKey, detail: event.detail, ...modifiers });
    relayed.add(copy);
    target.dispatchEvent(copy);
  };
  const leftModifiers = (select: boolean): Partial<MouseEventInit> => select
    ? (mac ? { altKey: true } : { shiftKey: true })
    : { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
  const down = (event: MouseEvent) => {
    if (relayed.has(event) || !surface.contains(event.target as Node)) return;
    if (event.button === 0 && !options().selecting && terminal.element?.contains(event.target as Node)
        && terminal.modes.mouseTrackingMode !== 'none') {
      left = { target: terminal.element, select: !event.ctrlKey && !event.metaKey };
      if (!left.select) terminal.clearSelection();
      relay(event, left.target, leftModifiers(left.select));
      return;
    }
    if (event.button !== 2) return;
    blockedRight = false;
    if (event.altKey) { blockedRight = true; event.stopImmediatePropagation(); return; }
    if (passthrough(event)) {
      // xterm replaces row/span nodes during output. Keep the stable root so
      // release still bubbles to document if the clicked glyph is redrawn.
      if (event.shiftKey && terminal.element) { held = terminal.element; relay(event, held); }
      return;
    }
    blockedRight = true;
    stop(event);
  };
  const move = (event: MouseEvent) => {
    if (left && !relayed.has(event) && (event.buttons & 1)) { relay(event, left.target, leftModifiers(left.select)); return; }
    if (held && !relayed.has(event) && (event.buttons & 2)) relay(event, held);
  };
  const up = (event: MouseEvent) => {
    if (left && !relayed.has(event) && event.button === 0) {
      const gesture = left; left = null;
      relay(event, gesture.target, leftModifiers(gesture.select));
      return;
    }
    // A concurrent left drag may already have installed xterm's document
    // release listener. Never send an unmatched right release for a UI menu.
    if (event.button === 2 && blockedRight && !relayed.has(event)) { blockedRight = false; stop(event); return; }
    if (!held || relayed.has(event) || event.button !== 2) return;
    const target = held; held = null;
    relay(event, target);
  };
  const context = (event: MouseEvent) => {
    if (event.altKey) return; // xterm prepares its selection for native Copy
    stop(event);
    if (passthrough(event)) return;
    const rect = surface.getBoundingClientRect();
    open(event.clientX || rect.left + 20, event.clientY || rect.top + 20);
  };
  document.addEventListener('mousedown', down, true);
  document.addEventListener('mousemove', move, true);
  document.addEventListener('mouseup', up, true);
  surface.addEventListener('contextmenu', context, true);
  return () => {
    held = null; left = null;
    document.removeEventListener('mousedown', down, true);
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('mouseup', up, true);
    surface.removeEventListener('contextmenu', context, true);
  };
}
