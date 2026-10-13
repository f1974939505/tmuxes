import { describe, expect, it } from 'vitest';
import { documentLink, normalizeMath } from '../src/markdown';
import { previewKind } from '../src/util';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownView } from '../src/components/MarkdownView';
import { SettingsProvider } from '../src/settings';

describe('document rendering inputs', () => {
  it('links prose, inline/fenced paths and existing links while leaving math untouched', () => {
    const text = 'PDF: /project/a.pdf.\n\n`figures/a b.PNG`\n\n$$\\text{not-a-link.pdf}$$\n\n```text\n/project/b.pdf\n```\n\n[one](figures/c.png)';
    const html = renderToStaticMarkup(createElement(SettingsProvider, null, createElement(MarkdownView, {
      text, context: { targetId: 'target', session: 'original', path: '/project/readme.md', name: 'readme.md' }, onOpenFile: () => {},
    })));
    expect(html.match(/<a /g)).toHaveLength(4);
    expect(html).toContain('<pre><code class="language-text">');
    expect(html).toContain('figures/a b.PNG');
    expect(html).not.toContain('<a href="#" title="在 tmuxes 中打开文件: not-a-link.pdf');
    const readonly = renderToStaticMarkup(createElement(SettingsProvider, null, createElement(MarkdownView, { text: '/project/a.pdf' })));
    expect(readonly).not.toContain('<a ');
    const formats = renderToStaticMarkup(createElement(SettingsProvider, null, createElement(MarkdownView, {
      text: 'PDF / PNG / JPG', source: { targetId: 'target', session: 'original' }, onOpenFile: () => {},
    })));
    expect(formats).not.toContain('<a ');
  });
  it('renders formulas and tables but does not execute HTML or fetch external images', () => {
    const text = '# 中文\n\n$x^2$\n\n$$\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}$$\n\n|a|b|\n|-|-|\n|1|2|\n\n<script>alert(1)</script>\n\n![external](https://example.com/image.png)\n\n$\\unknowncommand$';
    const html = renderToStaticMarkup(createElement(SettingsProvider, null, createElement(MarkdownView, { text })));
    expect(html).toContain('katex'); expect(html).toContain('<table>'); expect(html).toContain('katex-error');
    expect(html).not.toContain('<script>'); expect(html).not.toContain('<img'); expect(html).toContain('加载外部图片');
  });
  it('normalizes TeX delimiters without changing code or dollar formulas', () => {
    expect(normalizeMath('a \\(x^2\\) b \\[y\\]')).toBe('a $x^2$ b \n$$\ny\n$$\n');
    const code = '```python\nprint("\\(x\\)")\n```\n`\\[y\\]` $\\(z\\)$';
    expect(normalizeMath(code)).toBe(code);
    expect(normalizeMath('~~~\n\\(x\\)\n~~~')).toBe('~~~\n\\(x\\)\n~~~');
  });
  it('resolves relative assets while refusing executable URL schemes', () => {
    expect(documentLink('../figures/a.png', '/project/docs/readme.md')).toEqual({ path: '/project/figures/a.png' });
    for (const value of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) expect(documentLink(value, '/project/a.md')).toEqual({});
    expect(documentLink('https://example.com/a.png')).toEqual({ external: 'https://example.com/a.png' });
    expect(previewKind('X.PNG')).toBe('image'); expect(previewKind('paper.PDF')).toBe('pdf');
  });
});
