/** Normalize TeX delimiters while leaving code and existing dollar math intact. */
export function normalizeMath(text: string): string {
  let out = '', i = 0;
  while (i < text.length) {
    if (i === 0 || text[i - 1] === '\n') {
      const fence = /^( {0,3})(`{3,}|~{3,})[^\n]*\n/.exec(text.slice(i));
      if (fence) {
        const close = new RegExp(`^ {0,3}${fence[2][0]}{${fence[2].length},}[^\\S\\n]*$`, 'm');
        const rest = text.slice(i + fence[0].length);
        const match = close.exec(rest);
        const end = match ? i + fence[0].length + match.index + match[0].length : text.length;
        out += text.slice(i, end); i = end; continue;
      }
    }
    if (text[i] === '`') {
      const run = /^`+/.exec(text.slice(i))![0];
      let end = text.indexOf(run, i + run.length);
      while (end >= 0 && (text[end - 1] === '`' || text[end + run.length] === '`')) end = text.indexOf(run, end + run.length);
      if (end >= 0) { end += run.length; out += text.slice(i, end); i = end; continue; }
    }
    if (text[i] === '$' && text[i - 1] !== '\\') {
      const marker = text[i + 1] === '$' ? '$$' : '$';
      let end = text.indexOf(marker, i + marker.length);
      while (end >= 0 && text[end - 1] === '\\') end = text.indexOf(marker, end + marker.length);
      if (end >= 0) { end += marker.length; out += text.slice(i, end); i = end; continue; }
    }
    if (text[i] === '\\' && text[i - 1] !== '\\' && (text[i + 1] === '(' || text[i + 1] === '[')) {
      const display = text[i + 1] === '[';
      const end = text.indexOf(display ? '\\]' : '\\)', i + 2);
      if (end >= 0) {
        const body = text.slice(i + 2, end);
        out += display ? `\n$$\n${body}\n$$\n` : `$${body}$`;
        i = end + 2; continue;
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
