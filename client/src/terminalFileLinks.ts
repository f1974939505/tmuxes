import type { IBufferCellPosition, ILink, ILinkProvider, Terminal } from '@xterm/xterm';
import { findFileReferences } from './fileLinks';

/** Hover-time scan of one logical line, bounded even for giant soft wraps.
 *  Character offsets map through xterm cells (CJK, emoji and combining chars
 *  do not occupy one column per JavaScript character). */
export function terminalFileLinks(term: Pick<Terminal, 'buffer' | 'cols'>, y: number): ILink[] {
  const buffer = term.buffer.active;
  let first = y - 1, last = first;
  const MAX_ROWS = 64, MAX_CHARS = 8192;
  if (!buffer.getLine(first)) return [];
  while (buffer.getLine(first)?.isWrapped) {
    if (first === 0 || last - first >= MAX_ROWS - 1) return [];
    first--;
  }
  while (buffer.getLine(last + 1)?.isWrapped) {
    if (last - first >= MAX_ROWS - 1) return [];
    last++;
  }
  let text = '';
  const starts: IBufferCellPosition[] = [], ends: IBufferCellPosition[] = [];
  for (let row = first; row <= last; row++) {
    const line = buffer.getLine(row)!;
    const columns = Math.min(term.cols, line.length);
    for (let col = 0; col < columns; col++) {
      const cell = line.getCell(col);
      if (!cell?.getWidth()) continue;
      let chars = cell.getChars();
      if (!chars) {
        // Wide glyph wrapping leaves one unused cell at the preceding edge.
        if (col === columns - 1 && row < last && buffer.getLine(row + 1)?.getCell(0)?.getWidth() === 2) continue;
        chars = ' ';
      }
      for (let i = 0; i < chars.length; i++) {
        starts.push({ x: col + 1, y: row + 1 });
        ends.push({ x: col + cell.getWidth(), y: row + 1 });
      }
      text += chars;
      if (text.length > MAX_CHARS) return [];
    }
  }
  return findFileReferences(text).flatMap(match => {
    const start = starts[match.start], end = ends[match.end - 1];
    if (!start || !end || y < start.y || y > end.y) return [];
    return [{ text: match.path, range: { start, end }, activate: () => {} }];
  });
}

export function fileLinkProvider(term: Terminal, activate: (event: MouseEvent, path: string) => void,
  hover: (path?: string) => void): ILinkProvider {
  return { provideLinks: (y, callback) => callback(terminalFileLinks(term, y).map(link => ({ ...link,
    activate, hover: () => hover(link.text), leave: () => hover() }))) };
}
