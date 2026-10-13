import { describe, expect, it } from 'vitest';
import { Terminal as HeadlessTerminal } from '@xterm/headless';
import type { Terminal } from '@xterm/xterm';
import { fileReference, fileReferenceHref, findFileReferences, resolveFileReference } from '../src/fileLinks';
import { terminalFileLinks } from '../src/terminalFileLinks';

describe('file paths reported by agents', () => {
  it('recognizes absolute/relative paths, Unicode, quotes, spaces and printed Markdown destinations', () => {
    const text = 'PDF: /work/paper.pdf. 图片：./figures/实验.png；`notes.md` "figures/my plot (2).JPG" [PDF](/work/result.pdf)';
    const matches = findFileReferences(text);
    expect(matches.map(match => match.path)).toEqual(['/work/paper.pdf', './figures/实验.png', 'notes.md', 'figures/my plot (2).JPG', '/work/result.pdf']);
    for (const match of matches) expect(text.slice(match.start, match.end)).toBe(match.text);
    expect(findFileReferences('https://example.com/remote.pdf?file=local.png')).toEqual([]);
    expect(findFileReferences('PDF and PNG / JPG files.')).toEqual([]);
  });
  it('keeps target files separate from executable protocols, host URLs and Windows paths', () => {
    for (const value of ['javascript:report.pdf', 'data:image.png', 'https://example.com/a.pdf', '//other/a.pdf',
      'file://other/work/a.pdf', 'C:\\work\\a.pdf', '~/a.pdf', '/work/a\u0000.pdf']) expect(fileReference(value)).toBeUndefined();
    expect(fileReference('file:///work/a%20b.pdf')).toBe('/work/a b.pdf');
    expect(fileReference('/work/a.py:20:3')).toBe('/work/a.py');
    expect(fileReferenceHref('figures/a%2520b.png')).toBe('figures/a%20b.png');
    expect(resolveFileReference('../a.pdf', '/work/results')).toBe('/work/a.pdf');
    expect(resolveFileReference('/work/a.pdf')).toBe('/work/a.pdf');
    expect(resolveFileReference('a.pdf')).toBeUndefined();
  });
});

describe('terminal hyperlink cell ranges', () => {
  async function links(text: string, cols: number) {
    const term = new HeadlessTerminal({ cols, rows: 80, allowProposedApi: true, scrollback: 100 });
    await new Promise<void>(resolve => term.write(text, resolve));
    return term;
  }
  it('maps CJK, emoji, combining characters and soft wraps to actual xterm columns', async () => {
    const cases = [
      // The installed xterm Unicode 6 provider gives emoji one cell, whereas
      // supplementary CJK occupies two (UnicodeV6.wcwidth); use those actual
      // renderer conventions, not JavaScript string length or modern wcwidth.
      { text: '图 /p/😀.png', cols: 12, range: { start: { x: 4, y: 1 }, end: { x: 11, y: 1 } } },
      { text: '图 /p/中😀.png', cols: 12, range: { start: { x: 4, y: 1 }, end: { x: 1, y: 2 } } },
      { text: '图 /p/𠀀.png', cols: 12, range: { start: { x: 4, y: 1 }, end: { x: 12, y: 1 } } },
      { text: 'xx /abcd/中文.pdf', cols: 10, range: { start: { x: 4, y: 1 }, end: { x: 8, y: 2 } } },
      { text: '图 /p/e\u0301.png', cols: 12, range: { start: { x: 4, y: 1 }, end: { x: 11, y: 1 } } },
    ];
    for (const item of cases) {
      const term = await links(item.text, item.cols);
      try {
        for (let row = item.range.start.y; row <= item.range.end.y; row++) {
          const found = terminalFileLinks(term as unknown as Pick<Terminal, 'buffer' | 'cols'>, row);
          expect(found).toHaveLength(1);
          expect(found[0].range).toEqual(item.range);
          expect(found[0].text).toBe(item.text.slice(item.text.indexOf('/')));
        }
      } finally { term.dispose(); }
    }
  });
  it('bounds hover work and does not link a fragment of a huge wrapped line', async () => {
    const term = await links('x'.repeat(1000) + ' /work/a.pdf', 12);
    try { expect(terminalFileLinks(term as unknown as Pick<Terminal, 'buffer' | 'cols'>, 83)).toEqual([]); }
    finally { term.dispose(); }
  });
});
