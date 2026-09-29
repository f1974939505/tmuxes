import headless, { type ITerminalAddon } from '@xterm/headless';
import serialize from '@xterm/addon-serialize';

export interface ScreenSnapshot { cols: number; rows: number; data: string }

/** A terminal is a state machine, not a tail of a log file. */
export class TerminalScreen {
  private term: headless.Terminal;
  private serializer = new serialize.SerializeAddon();
  private disposed = false;
  private pendingBytes = 0;
  private waiting = new Set<() => void>();

  constructor(cols: number, rows: number) {
    this.term = new headless.Terminal({ cols, rows, scrollback: 1000, allowProposedApi: true });
    this.term.loadAddon(this.serializer as unknown as ITerminalAddon);
    // Never wire onData back to the PTY: only the real browser answers queries.
  }

  write(data: string, forward: () => void): boolean {
    if (this.disposed) return false;
    const bytes = Buffer.byteLength(data);
    if (this.pendingBytes + bytes > 4 * 1024 * 1024) return false;
    this.pendingBytes += bytes;
    this.term.write(data, () => {
      this.pendingBytes -= bytes;
      if (this.disposed) return;
      forward();
      for (const check of [...this.waiting]) check();
    });
    return true;
  }

  resize(cols: number, rows: number, applied: () => void): void {
    this.term.write('', () => {
      if (this.disposed) return;
      this.term.resize(cols, rows);
      applied();
    });
  }

  snapshot(callback: (screen: ScreenSnapshot | null) => void): void {
    // These details are not covered by SerializeAddon (notably SGR mouse and
    // scroll margins). Keep private API usage here, pin xterm, and round-trip test.
    const core = (this.term as unknown as { _core: {
      _inputHandler: { _parser: { currentState: number } };
      coreMouseService: { activeEncoding: string };
      coreService: { isCursorHidden: boolean };
      _bufferService: { buffer: { scrollTop: number; scrollBottom: number } };
    } })._core;
    let armed = false, finished = false;
    const finish = (value: ScreenSnapshot | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); this.waiting.delete(check); callback(value);
    };
    const check = () => {
      if (this.disposed) { finish(null); return; }
      if (!armed) return;
      // Do not split a CSI/OSC/DCS sequence between a snapshot and live bytes.
      if (core._inputHandler._parser.currentState !== 0) return;
      const buffer = this.term.buffer.active;
      const margins = core._bufferService.buffer;
      let data = '\x1bc' + this.serializer.serialize();
      data += `\x1b[?1006${core.coreMouseService.activeEncoding === 'SGR' ? 'h' : 'l'}`;
      data += `\x1b[?25${core.coreService.isCursorHidden ? 'l' : 'h'}`;
      if (margins.scrollTop !== 0 || margins.scrollBottom !== this.term.rows - 1) {
        data += `\x1b[${margins.scrollTop + 1};${margins.scrollBottom + 1}r`;
        const row = buffer.cursorY - (this.term.modes.originMode ? margins.scrollTop : 0) + 1;
        data += `\x1b[${row};${buffer.cursorX + 1}H`;
      }
      finish({ cols: this.term.cols, rows: this.term.rows, data });
    };
    const timer = setTimeout(() => finish(null), 3000);
    this.waiting.add(check);
    this.term.write('', () => { armed = true; check(); });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const check of [...this.waiting]) check();
    this.term.dispose();
  }
}
