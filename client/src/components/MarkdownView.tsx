import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { documentLink, normalizeMath } from '../markdown';
import { fileContentUrl, linkedFile } from '../api';
import type { OpenFile, Selection } from '../types';
import { useI18n } from '../i18n';
import { parentPath, previewKind } from '../util';
import { fileReferenceHref, findFileReferences, remarkFileReferences } from '../fileLinks';

export interface MarkdownProps { text: string; context?: OpenFile; source?: Selection; onOpenFile?: (file: OpenFile) => void }
interface MathNode { type: string; value?: string; children?: MathNode[]; data?: { hName: string; hProperties: Record<string, string> } }
function validateMath({ prefix }: { prefix: string }) {
  return (tree: MathNode) => {
    const visit = (node: MathNode) => {
      if (node.type === 'math' || node.type === 'inlineMath') {
        try { katex.renderToString(node.value ?? '', { trust: false, throwOnError: true, maxExpand: 1000, maxSize: 20 }); }
        catch (error) {
          const display = node.type === 'math';
          const source = node.value ?? '';
          node.type = display ? 'paragraph' : 'text';
          node.value = `${prefix} ${source}`;
          if (display) node.children = [{ type: 'text', value: node.value }];
          node.data = { hName: display ? 'div' : 'span', hProperties: { className: 'katex-error', title: String(error).slice(0, 1000) } };
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
function PreviewImage({ src, alt, external }: { src: string; alt?: string; external: boolean }) {
  const { t } = useI18n();
  const [allowed, setAllowed] = useState(!external);
  const [failed, setFailed] = useState(false);
  if (!allowed) return <button onClick={() => setAllowed(true)}>{t.loadExternalImage}: {alt || src}</button>;
  return failed ? <span role="alert">{t.imageFailed}</span> : <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

export const MarkdownView = memo(function MarkdownView({ text, context, source, onOpenFile }: MarkdownProps) {
  const { t } = useI18n();
  const normalized = useMemo(() => normalizeMath(text), [text]);
  const origin = context ?? source;
  const canLink = !!origin && !!onOpenFile;
  const request = useRef<AbortController | null>(null);
  const [linkError, setLinkError] = useState('');
  useEffect(() => () => request.current?.abort(), [origin?.targetId, origin?.session, context?.path]);
  const openPath = (value: string) => {
    if (!origin || !onOpenFile) return;
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    setLinkError('');
    void linkedFile(origin, value, context ? parentPath(context.path) : undefined, abort.signal).then(file => {
      if (!abort.signal.aborted) onOpenFile(file);
    }).catch(error => { if (!abort.signal.aborted) setLinkError(`${t.failedOpenLinkedFile} ${error instanceof Error ? error.message : ''}`); });
  };
  const linkedText = (value: string) => {
    const result: ReactNode[] = [];
    let offset = 0;
    for (const match of findFileReferences(value)) {
      result.push(value.slice(offset, match.start), <a key={match.start} href="#" title={t.openLinkedFile}
        onClick={e => { e.preventDefault(); openPath(match.path); }}>{match.text}</a>);
      offset = match.end;
    }
    result.push(value.slice(offset));
    return result;
  };
  return <div className="markdown-body">{linkError && <div className="viewer-msg error" role="alert">{linkError}</div>}<Markdown skipHtml
    remarkPlugins={[remarkGfm, remarkMath, ...(canLink ? [remarkFileReferences] : []), [validateMath, { prefix: t.invalidFormula }]]} rehypePlugins={[[rehypeKatex, { trust: false, strict: 'warn', maxExpand: 1000, maxSize: 20 }]]}
    urlTransform={value => value}
    components={{
      a: ({ href = '', children }) => {
        const link = documentLink(href, context?.path);
        const path = fileReferenceHref(href);
        if (path && canLink) {
          return <a href="#" title={`${t.openLinkedFile}: ${path}`} onClick={e => { e.preventDefault(); openPath(path); }}>{children}</a>;
        }
        if (link.external) return <a href={link.external} target="_blank" rel="noreferrer noopener">{children}</a>;
        if (link.anchor) return <a href={link.anchor}>{children}</a>;
        return <span>{children}</span>;
      },
      code: ({ node, children, className }) => <code className={className}>
        {canLink && node?.properties['data-file-paths'] && typeof children === 'string' ? linkedText(children) : children}
      </code>,
      img: ({ src = '', alt }) => {
        const link = documentLink(typeof src === 'string' ? src : '', context?.path);
        if (link.path && context && previewKind(link.path) === 'image') {
          const url = fileContentUrl(context.targetId, context.session, link.path);
          return <PreviewImage key={url} src={url} alt={alt} external={false} />;
        }
        if (link.external && /^https?:/.test(link.external)) return <PreviewImage key={link.external} src={link.external} alt={alt} external />;
        return <span>{alt}</span>;
      },
    }}>{normalized}</Markdown></div>;
});
