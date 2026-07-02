import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type {
  GitBranch,
  GitCommit,
  GitFileChange,
  GitOperationResult,
  GitState,
  OpenTextPreview,
  Selection,
} from '../types';
import { useI18n } from '../i18n';

interface Props {
  selection: Selection | null;
  enabled: boolean;
  onOpenText: (preview: OpenTextPreview) => void;
}

type BusyAction =
  | 'refresh'
  | 'fetch'
  | 'pull'
  | 'push'
  | 'sync'
  | 'checkout'
  | 'commit'
  | 'diff'
  | 'detail'
  | null;

function branchLabel(b: GitBranch): string {
  const track = [b.ahead ? `+${b.ahead}` : '', b.behind ? `-${b.behind}` : '']
    .filter(Boolean)
    .join(' ');
  return track ? `${b.name} ${track}` : b.name;
}

function operationText(result: GitOperationResult, pushSkipped: string, done: string): string {
  if (result.steps) {
    const lines = result.steps.map((s) => {
      if (s.skipped) return `${s.name}: ${pushSkipped}`;
      return `${s.name}: ${s.output || done}`;
    });
    return lines.join('\n');
  }
  return result.output || done;
}

function changeCode(change: GitFileChange): string {
  if (change.untracked) return '??';
  return `${change.index}${change.worktree}`.trim() || 'M';
}

function changeLabel(change: GitFileChange, t: ReturnType<typeof useI18n>['t']): string {
  if (change.conflicted) return t.gitConflict;
  if (change.untracked) return t.gitUntracked;
  if (change.staged && change.unstaged) return `${t.gitStaged}+${t.gitUnstaged}`;
  if (change.staged) return t.gitStaged;
  return t.gitUnstaged;
}

export function GitPanel({ selection, enabled, onOpenText }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<GitState | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');

  const targetId = selection?.targetId;
  const session = selection?.session;

  useEffect(() => {
    setState(null);
    setError(null);
    setMessage(null);
    setCommitMessage('');
  }, [targetId, session]);

  const refresh = useCallback(async () => {
    if (!targetId || !session || !enabled) return;
    setBusy('refresh');
    try {
      const next = await api.getGitState(targetId, session);
      setState(next);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.gitOperationFailed);
    } finally {
      setBusy(null);
    }
  }, [targetId, session, enabled, t.gitOperationFailed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (
    action: Exclude<BusyAction, 'refresh' | 'checkout' | null>,
    fn: () => Promise<GitOperationResult>,
    confirmText?: string,
  ) => {
    if (!targetId || !session) return;
    if (confirmText && !confirm(confirmText)) return;
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const result = await fn();
      setState(result.state);
      setMessage(operationText(result, t.gitPushSkipped, t.gitOperationDone));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.gitOperationFailed);
    } finally {
      setBusy(null);
    }
  };

  const checkout = async (branch: string) => {
    if (!targetId || !session || !branch || branch === state?.branch) return;
    if (state?.dirty && !confirm(t.gitCheckoutDirtyConfirm(branch))) return;
    setBusy('checkout');
    setError(null);
    setMessage(null);
    try {
      const result = await api.gitCheckout(targetId, session, branch);
      setState(result.state);
      setMessage(operationText(result, t.gitPushSkipped, t.gitOperationDone));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.gitOperationFailed);
    } finally {
      setBusy(null);
    }
  };

  const commitAll = async () => {
    if (!targetId || !session) return;
    const msg = commitMessage.trim();
    if (!msg) return;
    if (!confirm(t.gitCommitAllConfirm)) return;
    setBusy('commit');
    setError(null);
    setMessage(null);
    try {
      const result = await api.gitCommit(targetId, session, msg);
      setState(result.state);
      setCommitMessage('');
      setMessage(operationText(result, t.gitPushSkipped, t.gitOperationDone));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.gitOperationFailed);
    } finally {
      setBusy(null);
    }
  };

  const showDiff = async (change: GitFileChange) => {
    if (!targetId || !session) return;
    setBusy('diff');
    setError(null);
    setMessage(null);
    const staged = change.staged && !change.unstaged;
    try {
      const result = await api.getGitDiff(targetId, session, change.path, staged);
      onOpenText({
        title: `${change.path} · ${staged ? t.gitStaged : t.gitUnstaged}`,
        subtitle: t.gitShowDiff,
        content: result.diff || t.gitDiffUnavailable,
        mode: 'diff',
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.gitOperationFailed);
    } finally {
      setBusy(null);
    }
  };

  const showCommit = async (commit: GitCommit) => {
    if (!targetId || !session) return;
    setBusy('detail');
    setError(null);
    setMessage(null);
    try {
      const result = await api.getGitCommit(targetId, session, commit.hash);
      onOpenText({
        title: `${commit.shortHash} · ${commit.subject}`,
        subtitle: commit.hash,
        content: result.output || t.gitDiffUnavailable,
        mode: 'text',
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.gitOperationFailed);
    } finally {
      setBusy(null);
    }
  };

  if (!selection) {
    return (
      <div className="git-panel">
        <div className="explorer-empty">{t.selectSessionForGit}</div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="git-panel">
        <div className="explorer-empty">{t.gitUnavailable}</div>
      </div>
    );
  }

  const available = !!state?.available;
  const canAct = !!targetId && !!session && available && busy === null;
  const localBranches = state?.branches.filter((b) => !b.remote) ?? [];
  const remoteBranches = state?.branches.filter((b) => b.remote) ?? [];
  const currentBranch =
    !state?.detached && state?.branch && localBranches.some((b) => b.name === state.branch)
      ? state.branch
      : '';
  const counts = state?.counts;
  const dirtyText = counts
    ? t.gitDirtyCounts(counts.staged, counts.unstaged, counts.untracked, counts.conflicted)
    : '';
  const canCommit = canAct && !!state?.dirty && state.counts.conflicted === 0 && commitMessage.trim().length > 0;

  return (
    <div className="git-panel">
      <div className="git-head">
        <div className="git-branch-line">
          <span className="git-label">{t.gitBranch}</span>
          <span className="git-current" title={state?.root ?? state?.cwd ?? ''}>
            {state?.detached ? t.gitDetached : state?.branch ?? '...'}
          </span>
        </div>
        <button title={t.gitRefresh} disabled={busy !== null} onClick={() => void refresh()}>
          ⟳
        </button>
      </div>

      {busy === 'refresh' && !state && <div className="explorer-empty">{t.loading}</div>}
      {error && <div className="error-line"><span>{error}</span></div>}

      {state && !state.available && (
        <div className="explorer-empty">
          {state.error || t.gitNotRepository}
        </div>
      )}

      {available && state && (
        <>
          <div className="git-status">
            <span className={state.dirty ? 'git-state dirty' : 'git-state clean'}>
              {state.counts.conflicted > 0 ? t.gitConflicts : state.dirty ? t.gitWorkingTreeDirty : t.gitClean}
            </span>
            <span className="git-muted">{dirtyText}</span>
            <span className="git-muted">
              {state.upstream ? `${state.upstream} · ${t.gitAheadBehind(state.ahead, state.behind)}` : t.gitNoUpstream}
            </span>
          </div>

          <div className="git-actions">
            <button disabled={!canAct} onClick={() => void run('fetch', () => api.gitFetch(targetId!, session!))}>
              {t.gitFetch}
            </button>
            <button disabled={!canAct} onClick={() => void run('pull', () => api.gitPull(targetId!, session!), t.gitConfirmPull)}>
              {t.gitPull}
            </button>
            <button disabled={!canAct} onClick={() => void run('push', () => api.gitPush(targetId!, session!), t.gitConfirmPush)}>
              {t.gitPush}
            </button>
            <button className="primary" disabled={!canAct} onClick={() => void run('sync', () => api.gitSync(targetId!, session!), t.gitConfirmSync)}>
              {t.gitSync}
            </button>
          </div>

          <div className="git-checkout">
            <select
              value={currentBranch}
              disabled={!canAct || state.branches.length === 0}
              title={t.gitCheckout}
              onChange={(e) => void checkout(e.target.value)}
            >
              {currentBranch === '' && <option value="">{t.gitDetached}</option>}
              {localBranches.length > 0 && <optgroup label={t.gitLocalBranches}>
                {localBranches.map((b) => (
                  <option key={`local:${b.name}`} value={b.name}>
                    {branchLabel(b)}
                  </option>
                ))}
              </optgroup>}
              {remoteBranches.length > 0 && <optgroup label={t.gitRemoteBranches}>
                {remoteBranches.map((b) => (
                  <option key={`remote:${b.name}`} value={b.name}>
                    {branchLabel(b)}
                  </option>
                ))}
              </optgroup>}
              {state.branches.length === 0 && <option value="">{t.gitNoBranches}</option>}
            </select>
          </div>

          <div className="git-scroll">
            <div className="git-section">
              <div className="git-section-head">
                <span>{t.gitChangesTitle}</span>
                <span className="git-count">{state.files.length}</span>
              </div>
              <div className="git-commit-box">
                <textarea
                  value={commitMessage}
                  placeholder={t.gitCommitPlaceholder}
                  rows={2}
                  onChange={(e) => setCommitMessage(e.target.value)}
                />
                <button className="primary" disabled={!canCommit} onClick={() => void commitAll()}>
                  {busy === 'commit' ? t.loading : t.gitCommit}
                </button>
              </div>
              <div className="git-list">
                {state.files.map((change) => (
                  <button
                    key={`${change.index}${change.worktree}:${change.path}`}
                    className={`git-row ${change.conflicted ? 'conflict' : ''}`}
                    title={`${t.gitShowDiff}: ${change.path}`}
                    onClick={() => void showDiff(change)}
                  >
                    <span className="git-code">{changeCode(change)}</span>
                    <span className="git-path">{change.path}</span>
                    <span className="git-chip">{changeLabel(change, t)}</span>
                  </button>
                ))}
                {state.files.length === 0 && <div className="explorer-empty">{t.gitNoChanges}</div>}
              </div>
            </div>

            <div className="git-section">
              <div className="git-section-head">
                <span>{t.gitIncomingTitle}</span>
                <span className="git-count">{state.remoteCommits.length}</span>
              </div>
              <CommitList commits={state.remoteCommits} empty={t.gitNoIncoming} title={t.gitShowCommit} onSelect={showCommit} />
            </div>

            <div className="git-section">
              <div className="git-section-head">
                <span>{t.gitHistoryTitle}</span>
                <span className="git-count">{state.commits.length}</span>
              </div>
              <CommitList commits={state.commits} empty={t.gitNoCommits} title={t.gitShowCommit} onSelect={showCommit} />
            </div>

            {message && (
              <div className="git-detail">
                <pre className="git-output">{message}</pre>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CommitList({
  commits,
  empty,
  title,
  onSelect,
}: {
  commits: GitCommit[];
  empty: string;
  title: string;
  onSelect: (commit: GitCommit) => void;
}) {
  if (commits.length === 0) return <div className="explorer-empty">{empty}</div>;
  return (
    <div className="git-list">
      {commits.map((commit) => (
        <button
          key={commit.hash}
          className={`git-row commit ${commit.remote ? 'remote' : ''}`}
          title={`${title}: ${commit.hash}`}
          onClick={() => void onSelect(commit)}
        >
          <span className="git-code">{commit.shortHash}</span>
          <span className="git-path">{commit.subject}</span>
          <span className="git-date">{commit.date}</span>
        </button>
      ))}
    </div>
  );
}
