import { previewKind } from './util';

export interface FileReference { start: number; end: number; text: string; path: string }

/** Only target-side POSIX files supported by the existing viewer. Never turn
 *  an executable URI, web URL, remote file host or Windows drive into a path. */
export function fileReference(value: string): string | undefined {
  let path = value;
  if (/^file:/i.test(path)) {
    try {
      const uri = new URL(path);
      if (uri.protocol !== 'file:' || (uri.hostname && uri.hostname !== 'localhost') || uri.username || uri.password) return;
      path = decodeURIComponent(uri.pathname);
    } catch { return; }
  }
  path = path.replace(/(?::\d+(?::\d+)?|#L\d+(?:C\d+)?)$/, '');
  const name = path.split('/').pop()!, kind = previewKind(name);
  if (!path || path.length > 4096 || /[\x00-\x1f\x7f\\:]/.test(path) ||
      path.startsWith('//') || path.startsWith('~/') ||
      !kind || (kind !== 'text' && !name.includes('.'))) return;
  return path;
}

export function resolveFileReference(value: string, directory?: string): string | undefined {
  const path = fileReference(value);
  if (!path || (!path.startsWith('/') && !directory?.startsWith('/'))) return;
  const parts: string[] = [];
  for (const part of (path.startsWith('/') ? path : `${directory}/${path}`).split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return `/${parts.join('/')}`;
}

/** Quoting preserves spaces. URL tokens are consumed whole so a URL path or
 *  query value can never be misidentified as a target file. */
export function findFileReferences(text: string): FileReference[] {
  const tokens = /\b(?:https?|file):\/\/[^\s"'`<>]+|"[^"\r\n]+"|'[^'\r\n]+'|`[^`\r\n]+`|[^\s"'`<>|=,，。；：！？、【】「」“”‘’\x00-\x1f]+/giu;
  const result: FileReference[] = [];
  for (const match of text.matchAll(tokens)) {
    let value = match[0], start = match.index!;
    if (/^["'`]/.test(value)) { value = value.slice(1, -1); start++; }
    else {
      const leading = /^[([{]+/.exec(value)?.[0].length ?? 0;
      start += leading; value = value.slice(leading).replace(/[.,;!?…\])}]+$/u, '');
      // Printed Markdown often contains [label](path); use only its target.
      const target = value.lastIndexOf('](');
      if (target >= 0) { start += target + 2; value = value.slice(target + 2); }
    }
    const path = fileReference(value);
    if (path) result.push({ start, end: start + value.length, text: value, path });
  }
  return result;
}

/** Markdown hrefs are URL encoded; plain terminal paths are not. */
export function fileReferenceHref(href: string): string | undefined {
  if (/^file:/i.test(href)) return fileReference(href);
  try { return fileReference(decodeURIComponent(href.split(/[?#]/)[0])); } catch { return; }
}

interface PathNode {
  type: string; value?: string; url?: string; children?: PathNode[];
  data?: { hProperties?: Record<string, unknown> };
}
/** Link prose and inline paths without touching math, HTML, images or existing
 *  links. Fenced code keeps its layout and gets clickable path spans later. */
export function remarkFileReferences() {
  return (tree: PathNode) => {
    const visit = (node: PathNode) => {
      if (['link', 'linkReference', 'image', 'imageReference', 'math', 'inlineMath', 'html'].includes(node.type)) return;
      if (node.type === 'code') {
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, 'data-file-paths': true } };
        return;
      }
      if (!node.children) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== 'text' && child.type !== 'inlineCode') { visit(child); return [child]; }
        const value = child.value ?? '';
        const whole = child.type === 'inlineCode' ? fileReference(value) : undefined;
        const matches = whole ? [{ start: 0, end: value.length, text: value, path: whole }] : findFileReferences(value);
        if (!matches.length) return [child];
        const result: PathNode[] = [];
        let offset = 0;
        for (const match of matches) {
          if (match.start > offset) result.push({ type: child.type, value: value.slice(offset, match.start) });
          result.push({ type: 'link', url: match.path.split('/').map(encodeURIComponent).join('/'),
            children: [{ type: child.type, value: match.text }] });
          offset = match.end;
        }
        if (offset < value.length) result.push({ type: child.type, value: value.slice(offset) });
        return result;
      });
    };
    visit(tree);
  };
}
