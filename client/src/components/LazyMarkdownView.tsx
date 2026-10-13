import { lazy, Suspense } from 'react';
import type { MarkdownProps } from './MarkdownView';
import { useI18n } from '../i18n';

const Renderer = lazy(() => import('./MarkdownView').then(module => ({ default: module.MarkdownView })));
export function MarkdownView(props: MarkdownProps) {
  const { t } = useI18n();
  return <Suspense fallback={<div className="viewer-msg">{t.loading}</div>}><Renderer {...props} /></Suspense>;
}
