interface MarkdownContainer { prefix: string; continuation: string; hasList: boolean }

/** The prefix used by a quote/list and by subsequent lines inside it. */
function markdownContainer(line: string): MarkdownContainer {
  let prefix = '', continuation = '', hasList = false;
  while (prefix.length < line.length) {
    const rest = line.slice(prefix.length);
    const quote = /^ {0,3}>[ \t]?/.exec(rest);
    if (quote) { prefix += quote[0]; continuation += quote[0]; continue; }
    const list = /^[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+/.exec(rest);
    if (list) {
      prefix += list[0]; continuation += list[0].replace(/[^\t]/g, ' '); hasList = true; continue;
    }
    const indent = /^[ \t]+/.exec(rest)?.[0] ?? '';
    prefix += indent; continuation += indent;
    break;
  }
  return { prefix, continuation, hasList };
}

function escapedAt(text: string, offset: number): boolean {
  let slashes = 0;
  while (offset > 0 && text[--offset] === '\\') slashes++;
  return slashes % 2 === 1;
}

function closingDelimiter(text: string, marker: string, start: number): number {
  let end = text.indexOf(marker, start);
  while (end >= 0) {
    const sameRun = marker[0] === '$' && (text[end - 1] === '$' || text[end + marker.length] === '$');
    if (!escapedAt(text, end) && !sameRun) return end;
    end = text.indexOf(marker, end + marker.length);
  }
  return -1;
}

/** Normalize raw TeX before Markdown can consume escapes or math fence metadata. */
export function normalizeMath(text: string): string {
  let out = '', i = 0, listIndent = 0;
  while (i < text.length) {
    if (i === 0 || text[i - 1] === '\n') {
      const lineEnd = text.indexOf('\n', i);
      const end = lineEnd < 0 ? text.length : lineEnd;
      const line = text.slice(i, end);
      const container = markdownContainer(line);
      const unquoted = line.replace(/^(?: {0,3}>[ \t]?)*/, '');
      const indent = /^[ \t]*/.exec(unquoted)![0].replace(/\t/g, '    ').length;
      const previousLine = i > 0 ? text.slice(text.lastIndexOf('\n', i - 2) + 1, i - 1) : '';
      if (listIndent && line.trim() && indent < listIndent && !previousLine.trim() && !container.hasList) listIndent = 0;
      // A four-space code block is literal. Inside a list, count indentation
      // relative to its content rather than treating all nested prose as code.
      if (indent >= listIndent + 4 && line.trim()) {
        out += text.slice(i, end); i = end;
        continue;
      }
      if (container.hasList) listIndent = container.continuation.replace(/(?: {0,3}>[ \t]?)/g, '').replace(/\t/g, '    ').length;
      const fence = /^(`{3,}|~{3,})(.*)$/.exec(line.slice(container.prefix.length).replace(/\r$/, ''));
      if (fence && (fence[1][0] !== '`' || !fence[2].includes('`'))) {
        const close = new RegExp(`^${fence[1][0]}{${fence[1].length},}[ \\t]*$`);
        let cursor = lineEnd < 0 ? text.length : lineEnd + 1;
        while (cursor < text.length) {
          const next = text.indexOf('\n', cursor);
          const candidateEnd = next < 0 ? text.length : next;
          const candidate = text.slice(cursor, candidateEnd);
          const candidatePrefix = markdownContainer(candidate).prefix;
          if (close.test(candidate.slice(candidatePrefix.length).replace(/\r$/, ''))) { cursor = candidateEnd; break; }
          cursor = next < 0 ? text.length : next + 1;
        }
        out += text.slice(i, cursor); i = cursor; continue;
      }
    }
    if (text[i] === '`' && !escapedAt(text, i)) {
      const run = /^`+/.exec(text.slice(i))![0];
      let end = text.indexOf(run, i + run.length);
      while (end >= 0 && (text[end - 1] === '`' || text[end + run.length] === '`')) end = text.indexOf(run, end + run.length);
      if (end >= 0) { end += run.length; out += text.slice(i, end); i = end; continue; }
    }
    const dollar = text[i] === '$' && !escapedAt(text, i) ? /^\$+/.exec(text.slice(i))![0] : '';
    const bracket = text[i] === '\\' && !escapedAt(text, i) && (text[i + 1] === '(' || text[i + 1] === '[');
    if (dollar || bracket) {
      const marker = dollar || text.slice(i, i + 2);
      const display = dollar ? dollar.length >= 2 : text[i + 1] === '[';
      const closing = dollar || (display ? '\\]' : '\\)');
      const end = closingDelimiter(text, closing, i + marker.length);
      if (end >= 0) {
        const body = text.slice(i + marker.length, end);
        if (!display) {
          out += dollar ? text.slice(i, end + closing.length) : `$${body}$`;
          i = end + closing.length; continue;
        }
        const outputLineStart = out.lastIndexOf('\n') + 1;
        const outputLine = out.slice(outputLineStart);
        const container = markdownContainer(outputLine);
        const before = outputLine.slice(container.prefix.length);
        const lines = body.split('\n').map((line, index) => index > 0 && line.startsWith(container.continuation)
          ? line.slice(container.continuation.length) : line);
        while (lines.length && !lines[0].trim()) lines.shift();
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        out = out.slice(0, outputLineStart) + (before.trim()
          ? `${outputLine}\n${container.continuation}\n${container.continuation}` : container.prefix);
        // Dollar fences must be alone: same-line content otherwise becomes
        // inline math or fence metadata, and a closing suffix can swallow the
        // rest of the answer as an unclosed mathematical block.
        out += `$$\n${lines.map(line => container.continuation + line).join('\n')}\n${container.continuation}$$`;
        i = end + closing.length;
        const lineEnd = text.indexOf('\n', i);
        const suffixEnd = lineEnd < 0 ? text.length : lineEnd;
        const suffix = text.slice(i, suffixEnd);
        if (suffix.trim()) {
          out += `\n${container.continuation}\n${container.continuation}`;
          i += /^[ \t]*/.exec(suffix)![0].length;
        } else i = suffixEnd;
        continue;
      }
    }
    out += text[i++];
  }
  return out;
}

export function documentLink(value: string, basePath?: string): { external?: string; path?: string; anchor?: string } {
  if (/^[\x00-\x20]*#/.test(value)) return { anchor: value };
  try {
    const url = new URL(value, `https://tmuxes.invalid${basePath ?? '/'}`);
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return {};
    if (url.hostname === 'tmuxes.invalid' && basePath && !/^https?:/i.test(value) && !value.startsWith('//')) {
      return { path: decodeURIComponent(url.pathname) };
    }
    if (url.hostname !== 'tmuxes.invalid') return { external: url.href };
  } catch { /* malformed or unsafe URL */ }
  return {};
}
