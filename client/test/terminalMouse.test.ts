import { describe, expect, it } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { attachTerminalMouse, ignoreRedundantMouseModes } from '../src/terminalMouse';

describe('live terminal selection and hover input', () => {
  function fixture(mode = 'any') {
    const document = new EventTarget();
    const element = new EventTarget();
    const surface = Object.assign(new EventTarget(), { ownerDocument: document });
    let selected = true, input = 0;
    const terminal = {
      modes: { mouseTrackingMode: mode },
      element: Object.assign(element, { contains: (target: unknown) => target === element }),
      hasSelection: () => selected,
      clearSelection: () => { selected = false; },
    };
    const dispose = attachTerminalMouse(surface as unknown as HTMLElement, terminal as unknown as Terminal,
      () => ({ selecting: false, rightClickToTerminal: false }), () => {});
    // Model the xterm ANY-motion SGR contract: a reported hover is user input,
    // which clears a local selection. The real protocol is also browser-tested.
    document.addEventListener('mousemove', () => {
      if (mode === 'any') { input++; selected = false; }
    });
    return {
      dispose, input: () => input, selected: () => selected, clear: terminal.clearSelection,
      hover(ctrlKey = false, target: EventTarget = element) {
        const event = new Event('mousemove');
        Object.defineProperties(event, { target: { value: target }, buttons: { value: 0 }, ctrlKey: { value: ctrlKey } });
        document.dispatchEvent(event);
      },
    };
  }

  it('keeps released text selected during ordinary and Ctrl+C preparation hover', () => {
    const f = fixture();
    f.hover(); f.hover(true);
    expect(f.input()).toBe(0);
    expect(f.selected()).toBe(true);
    f.dispose();
  });

  it('resumes application hover after a new explicit input clears selection', () => {
    const f = fixture();
    f.hover(); f.clear(); f.hover();
    expect(f.input()).toBe(1);
    f.dispose();
  });

  it('does not swallow motion outside the terminal or after disposal', () => {
    const f = fixture();
    f.hover(false, new EventTarget());
    expect(f.input()).toBe(1);
    f.dispose();
    f.hover();
    expect(f.input()).toBe(2);
  });
});

describe('redundant mouse protocol declarations', () => {
  function handler(mode: string) {
    let registered: (params: (number | number[])[]) => boolean = () => false;
    ignoreRedundantMouseModes({
      modes: { mouseTrackingMode: mode },
      parser: { registerCsiHandler: (id: unknown, callback: typeof registered) => {
        expect(id).toEqual({ prefix: '?', final: 'h' });
        registered = callback;
        return { dispose() {} };
      } },
    } as unknown as Terminal);
    return registered;
  }

  it.each([['x10', 9], ['vt200', 1000], ['drag', 1002], ['any', 1003]] as const)
    ('retains selection when %s mode is declared again', (mode, parameter) => {
      const csi = handler(mode);
      expect(csi([parameter])).toBe(true);
      expect(csi([parameter, parameter])).toBe(true);
    });

  it('leaves real mode changes and all mixed or encoding commands to xterm', () => {
    const any = handler('any');
    for (const params of [[], [1002], [1002, 1003], [1003, 1006], [1003, 25], [[1003]], [1006], [2004]])
      expect(any(params)).toBe(false);
    expect(handler('none')([1003])).toBe(false);
  });
});
