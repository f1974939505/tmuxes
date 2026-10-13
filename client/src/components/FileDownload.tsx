import { fileContentUrl } from '../api';
import type { OpenFile } from '../types';
import { useI18n } from '../i18n';

/** A native link preserves the click gesture and streams to disk, without a
 *  preliminary remote read or a whole-file Blob in browser memory. */
export function FileDownload({ file, compact = false }: { file: OpenFile; compact?: boolean }) {
  const { t } = useI18n();
  return <span className="file-download" onClick={e => e.stopPropagation()}>
    <a href={fileContentUrl(file.targetId, file.session, file.path, true)} download={file.name}
      title={t.downloadOriginal} aria-label={`${t.downloadOriginal}: ${file.name}`} draggable={false}>
      {compact ? '↓' : t.download}
    </a>
  </span>;
}
