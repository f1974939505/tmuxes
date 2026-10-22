import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface TerminalMenuAction {
  label: string;
  run: () => void;
  disabled?: boolean;
  checked?: boolean;
}

/** A viewport-clamped menu, outside the terminal's clipped/scrolling surface. */
export function TerminalMenu({ x, y, label, actions, onClose }: {
  x: number; y: number; label: string; actions: TerminalMenuAction[]; onClose: (focus?: boolean) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const element = menu.current!;
    setPosition({ left: Math.max(4, Math.min(x, window.innerWidth - element.offsetWidth - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - element.offsetHeight - 4)) });
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!element.contains(event.target as Node)) onClose(false); };
    const hide = () => onClose(false);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
    };
  }, [x, y, onClose]);
  return createPortal(<div ref={menu} className="terminal-menu" role="menu" aria-label={label}
    style={position} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault(); onClose(); return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>
    {actions.map(action => <button key={action.label} role={action.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={action.checked} disabled={action.disabled} onClick={() => { onClose(); action.run(); }}>
      <span className="terminal-menu-check" aria-hidden="true">{action.checked ? '✓' : ''}</span>{action.label}
    </button>)}
  </div>, document.body);
}
