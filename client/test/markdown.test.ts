import { describe, expect, it } from 'vitest';
import { documentLink, normalizeMath } from '../src/markdown';
import { previewKind } from '../src/util';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownView } from '../src/components/MarkdownView';
import { SettingsProvider } from '../src/settings';

const renderMarkdown = (text: string) => renderToStaticMarkup(createElement(SettingsProvider, null, createElement(MarkdownView, { text })));

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
    expect(normalizeMath('a \\(x^2\\) b \\[y\\]')).toBe('a $x^2$ b \n\n$$\ny\n$$');
    const code = '```python\nprint("\\(x\\)")\n```\n`\\[y\\]` $\\(z\\)$';
    expect(normalizeMath(code)).toBe(code);
    expect(normalizeMath('~~~\n\\(x\\)\n~~~')).toBe('~~~\n\\(x\\)\n~~~');
  });
  it('keeps both lines of a display formula and the Markdown following it', () => {
    const text = String.raw`## Matrix response

$$-G^{-1}(q)=\begin{pmatrix}a&b\\b&a\end{pmatrix},\qquad
-T G(q)=\frac{T}{x(x+2b)}\begin{pmatrix}x+b&-b\\-b&x+b\end{pmatrix}$$

## Interpretation

This paragraph remains ordinary Markdown with $x>0$.

| before | after |
| --- | --- |
| one | two |`;
    const html = renderMarkdown(text);
    expect(html).not.toContain('katex-error');
    expect(html.match(/class="katex-display"/g)).toHaveLength(1);
    expect(html.match(/class="katex"/g)).toHaveLength(2);
    expect(html).toContain('-G^{-1}(q)');
    expect(html).toContain('-T G(q)');
    expect(html).toContain('<h2>Interpretation</h2>');
    expect(html).toContain('<table>');
  });
  it.each([
    String.raw`$$a=b\tag{1}$$`,
    String.raw`Before $$a=b\tag{1}$$ after.`,
    String.raw`$$a=
b\tag{1}$$`,
    String.raw`$$
a=b\tag{1}
$$`,
    String.raw`\[a=b\tag{1}\]`,
    String.raw`- $$a=b\tag{1}$$`,
    String.raw`1. Formula: $$a=b\tag{1}$$ after.`,
    String.raw`> \[
> a=b\tag{1}
> \]`,
    String.raw`> - \[a=b\tag{1}\]`,
  ])('renders display fences in display mode: %s', text => {
    const html = renderMarkdown(text);
    expect(html).not.toContain('katex-error');
    expect(html.match(/class="katex-display"/g)).toHaveLength(1);
    expect(html).toContain('encoding="application/x-tex"');
    if (text.startsWith('>')) expect(html).toContain('<blockquote>');
    if (/^(?:> )?(?:-|1\.) /.test(text)) expect(html).toContain('<li>');
  });
  it('keeps inline TeX, display matrices, row spacing and multiple blocks distinct', () => {
    const text = String.raw`Inline \(a_i\) then $$\begin{aligned}a&=b\\[6pt]c&=d\end{aligned}$$ followed by \[\begin{cases}x&x>0\\0&x\le0\end{cases}\] end.`;
    const html = renderMarkdown(text);
    expect(html).not.toContain('katex-error');
    expect(html.match(/class="katex-display"/g)).toHaveLength(2);
    expect(html.match(/class="katex"/g)).toHaveLength(3);
    expect(html).toContain('\\\\[6pt]');
    expect(html).toContain('end.');
  });
  it('leaves fenced, nested fenced, indented and inline code unchanged', () => {
    const blocks = [
      '```tex\n$$x=1$$\n\\[x\\]\n```',
      '> ```tex\n> \\[x\\]\n> ```',
      '- Example:\n\n  ~~~tex\n  $$x=1$$\n  ~~~',
      '```tex\r\n\\[x\\]\r\n```\r\n',
      '    \\(x\\)\n    $$x$$',
      '`\\[x\\]` and ``$$x$$``',
    ];
    for (const code of blocks) expect(normalizeMath(code)).toBe(code);
    const html = renderMarkdown(blocks[0] + '\n\n$$y=2$$');
    expect(html.match(/class="katex-display"/g)).toHaveLength(1);
    expect(html).toContain('\\[x\\]');
    const windows = renderMarkdown('```tex\r\n\\[x\\]\r\n```\r\n\r\n$$y=2$$\r\n\r\n## After code\r\n');
    expect(windows.match(/class="katex-display"/g)).toHaveLength(1);
    expect(windows).not.toContain('katex-error');
    expect(windows).toContain('<h2>After code</h2>');
  });
  it('leaves incomplete formula delimiters readable and isolates invalid math', () => {
    expect(normalizeMath(String.raw`unfinished \[x`)).toBe(String.raw`unfinished \[x`);
    const html = renderMarkdown(String.raw`$$\unknowncommand$$

## Still readable

$$x=1$$`);
    expect(html).toContain('katex-error');
    expect(html).toContain('<h2>Still readable</h2>');
    expect(html.match(/class="katex-display"/g)).toHaveLength(1);
  });
  it('resolves relative assets while refusing executable URL schemes', () => {
    expect(documentLink('../figures/a.png', '/project/docs/readme.md')).toEqual({ path: '/project/figures/a.png' });
    for (const value of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) expect(documentLink(value, '/project/a.md')).toEqual({});
    expect(documentLink('https://example.com/a.png')).toEqual({ external: 'https://example.com/a.png' });
    expect(previewKind('X.PNG')).toBe('image'); expect(previewKind('paper.PDF')).toBe('pdf');
  });
});
