import type { OpenTextPreview } from '../types';
import { useSettings } from '../settings';
import { useI18n } from '../i18n';

interface Props {
  preview: OpenTextPreview;
  onClose: () => void;
}

interface DiffLine {
  no: number | '';
  text: string;
}

type DiffRow =
  | { kind: 'meta' | 'hunk' | 'note'; text: string }
  | {
      kind: 'context' | 'remove' | 'add' | 'change';
      left?: DiffLine;
      right?: DiffLine;
    };

function parseHunkStart(line: string): { left: number; right: number } | null {
  const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
  if (!m) return null;
  return { left: Number(m[1]), right: Number(m[2]) };
}

function parseUnifiedDiff(text: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let leftNo = 0;
  let rightNo = 0;
  let removals: DiffLine[] = [];
  let additions: DiffLine[] = [];

  const flush = () => {
    const n = Math.max(removals.length, additions.length);
    for (let i = 0; i < n; i += 1) {
      const left = removals[i];
      const right = additions[i];
      rows.push({
        kind: left && right ? 'change' : left ? 'remove' : 'add',
        left,
        right,
      });
    }
    removals = [];
    additions = [];
  };

  for (const line of text.split('\n')) {
    if (line.startsWith('@@ ')) {
      flush();
      const hunk = parseHunkStart(line);
      if (hunk) {
        leftNo = hunk.left;
        rightNo = hunk.right;
      }
      rows.push({ kind: 'hunk', text: line });
    } else if (line.startsWith('diff --git ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      flush();
      rows.push({ kind: 'meta', text: line });
    } else if (line.startsWith('\\ No newline')) {
      flush();
      rows.push({ kind: 'note', text: line });
    } else if (line.startsWith('-')) {
      removals.push({ no: leftNo, text: line.slice(1) });
      leftNo += 1;
    } else if (line.startsWith('+')) {
      additions.push({ no: rightNo, text: line.slice(1) });
      rightNo += 1;
    } else {
      flush();
      const body = line.startsWith(' ') ? line.slice(1) : line;
      rows.push({
        kind: 'context',
        left: { no: leftNo || '', text: body },
        right: { no: rightNo || '', text: body },
      });
      if (leftNo) leftNo += 1;
      if (rightNo) rightNo += 1;
    }
  }
  flush();
  return rows;
}

function SideBySideDiff({ content }: { content: string }) {
  const rows = parseUnifiedDiff(content);
  return (
    <div className="diff-viewer">
      {rows.map((row, i) => {
        if ('text' in row) {
          return (
            <div key={i} className={`diff-row ${row.kind}`}>
              <div className="diff-meta">{row.text}</div>
            </div>
          );
        }
        return (
          <div key={i} className={`diff-row ${row.kind}`}>
            <div className="diff-no left">{row.left?.no ?? ''}</div>
            <div className="diff-cell left">{row.left?.text ?? ''}</div>
            <div className="diff-no right">{row.right?.no ?? ''}</div>
            <div className="diff-cell right">{row.right?.text ?? ''}</div>
          </div>
        );
      })}
    </div>
  );
}

export function TextViewer({ preview, onClose }: Props) {
  const { settings } = useSettings();
  const { t } = useI18n();

  return (
    <div className="viewer">
      <div className="viewer-head">
        <span className="viewer-name" title={preview.title}>
          {preview.title}
        </span>
        {preview.subtitle && <span className="viewer-path">{preview.subtitle}</span>}
        <div className="viewer-head-spacer" />
        <button onClick={onClose} title={t.closeFile}>
          x
        </button>
      </div>
      <div className="viewer-body">
        {preview.mode === 'diff' ? (
          <div style={{ fontSize: settings.viewerFontSize }}>
            <SideBySideDiff content={preview.content} />
          </div>
        ) : (
          <pre className="viewer-pre" style={{ fontSize: settings.viewerFontSize }}>
            {preview.content}
          </pre>
        )}
      </div>
    </div>
  );
}
