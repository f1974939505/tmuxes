import { describe, expect, it } from 'vitest';
import {
  isSafeBranchName,
  parseGitBranches,
  parseGitCommits,
  parseGitRemotes,
  parseGitStatus,
} from '../src/git.js';

const NUL = String.fromCharCode(0);

describe('parseGitStatus', () => {
  it('parses branch tracking and dirty counts', () => {
    expect(parseGitStatus([
      '## main...origin/main [ahead 2, behind 1]',
      'M  staged.ts',
      ' M modified.ts',
      '?? new.ts',
      'UU conflict.ts',
    ].join('\n'))).toMatchObject({
      branch: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
      counts: {
        staged: 1,
        unstaged: 1,
        untracked: 1,
        conflicted: 1,
      },
      dirty: true,
      files: [
        {
          path: 'staged.ts',
          index: 'M',
          worktree: ' ',
          kind: 'modified',
          staged: true,
          unstaged: false,
          untracked: false,
          conflicted: false,
        },
        {
          path: 'modified.ts',
          index: ' ',
          worktree: 'M',
          kind: 'modified',
          staged: false,
          unstaged: true,
          untracked: false,
          conflicted: false,
        },
        {
          path: 'new.ts',
          index: '?',
          worktree: '?',
          kind: 'untracked',
          staged: false,
          unstaged: false,
          untracked: true,
          conflicted: false,
        },
        {
          path: 'conflict.ts',
          index: 'U',
          worktree: 'U',
          kind: 'conflicted',
          staged: true,
          unstaged: true,
          untracked: false,
          conflicted: true,
        },
      ],
    });
  });

  it('parses clean detached HEAD status', () => {
    expect(parseGitStatus('## HEAD (no branch)\n')).toEqual({
      branch: 'HEAD',
      detached: true,
      ahead: 0,
      behind: 0,
      counts: {
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicted: 0,
      },
      files: [],
      dirty: false,
    });
  });

  it('parses unborn branch status', () => {
    expect(parseGitStatus('## No commits yet on main\n')).toMatchObject({
      branch: 'main',
      ahead: 0,
      behind: 0,
      dirty: false,
    });
  });
});

describe('parseGitBranches', () => {
  it('parses local and remote branch lines', () => {
    const out = [
      ['*', 'main', 'origin/main', '[ahead 1]'].join(NUL),
      ['', 'feature-x', '', ''].join(NUL),
      ['', 'origin/HEAD', '', ''].join(NUL),
    ].join('\n');

    expect(parseGitBranches(out, false)).toEqual([
      {
        name: 'main',
        current: true,
        remote: false,
        upstream: 'origin/main',
        ahead: 1,
      },
      {
        name: 'feature-x',
        current: false,
        remote: false,
      },
    ]);
  });
});

describe('parseGitRemotes', () => {
  it('deduplicates and sorts remotes', () => {
    expect(parseGitRemotes('upstream\norigin\norigin\n')).toEqual(['origin', 'upstream']);
  });
});

describe('parseGitCommits', () => {
  it('parses compact git log lines', () => {
    const out = [
      ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'aaaaaaa', 'Ada', '2026-07-02', 'initial commit'].join(NUL),
      ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'bbbbbbb', 'Bob', '2026-07-03', 'remote fix'].join(NUL),
    ].join('\n');

    expect(parseGitCommits(out, true)).toEqual([
      {
        hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        shortHash: 'aaaaaaa',
        author: 'Ada',
        date: '2026-07-02',
        subject: 'initial commit',
        remote: true,
      },
      {
        hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        shortHash: 'bbbbbbb',
        author: 'Bob',
        date: '2026-07-03',
        subject: 'remote fix',
        remote: true,
      },
    ]);
  });
});

describe('isSafeBranchName', () => {
  it('rejects branch names that would be unsafe as argv command arguments', () => {
    expect(isSafeBranchName('main')).toBe(true);
    expect(isSafeBranchName('origin/feature-x')).toBe(true);
    expect(isSafeBranchName('')).toBe(false);
    expect(isSafeBranchName('-bad')).toBe(false);
    expect(isSafeBranchName('bad\nname')).toBe(false);
    expect(isSafeBranchName(`bad${NUL}name`)).toBe(false);
  });
});
