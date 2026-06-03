/** Mirror of the server's session-name allowlist (no '.'/':' — tmux delimiters). */
export const SESSION_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidSessionName(name: string): boolean {
  return SESSION_NAME_RE.test(name);
}

// ---------- POSIX-ish path helpers (targets are always unix-like) ----------

export function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? dir + name : `${dir}/${name}`;
}

export function parentPath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  if (idx <= 0) return '/';
  return trimmed.slice(0, idx);
}

export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1) || '/';
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'text', 'md', 'markdown', 'rst', 'log', 'csv', 'tsv',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'json', 'jsonc', 'map',
  'py', 'pyi', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'clj', 'cljs',
  'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'cs', 'm', 'mm', 'swift',
  'php', 'pl', 'pm', 'lua', 'r', 'jl', 'dart', 'ex', 'exs', 'erl', 'hrl', 'hs', 'ml', 'mli',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'html', 'htm', 'xml', 'svg', 'css', 'scss', 'sass', 'less', 'vue', 'svelte',
  'sql', 'graphql', 'gql', 'proto',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'properties', 'lock',
  'gitignore', 'gitattributes', 'dockerignore', 'editorconfig', 'diff', 'patch',
]);

const TEXT_FILENAMES = new Set([
  'dockerfile', 'makefile', 'readme', 'license', 'licence', 'changelog',
  'authors', 'notice', 'copying', 'procfile', '.gitignore', '.env',
  '.bashrc', '.zshrc', '.profile', '.vimrc', '.editorconfig',
]);

/** Heuristic: is this filename openable as text/code in the viewer? */
export function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (TEXT_FILENAMES.has(lower)) return true;
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return false; // no extension and not a known name → treat as non-text
  return TEXT_EXTENSIONS.has(lower.slice(dot + 1));
}

/** Compact relative time, e.g. "just now", "5m", "3h", "2d". */
export function ago(epochSeconds: number, nowMs: number): string {
  if (!epochSeconds) return '';
  const sec = Math.max(0, Math.floor(nowMs / 1000 - epochSeconds));
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}
