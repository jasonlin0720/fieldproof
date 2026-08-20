/**
 * 漂移提示：`sources` 自 `auditedAt` 之後有沒有被 commit 動過。
 *
 * 這裡**不**判斷 JSON 內容是否還符合程式碼（那是刻意的邊界，見 AGENTS.md §2.5），
 * 只回答 git 已經知道的事實：該不該回頭重新盤點。
 *
 * 缺了 git（沒裝、不在 repo 裡）時一律靜默略過——這是可選提示，不該讓建置失敗。
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { findDrift } from '../src/drift.js';
import { makePage } from './helpers.js';

interface Repo {
  cleanup: () => void;
  /** 以指定日期建立一筆 commit（committer / author date 皆為該日 12:00 UTC） */
  commit: (file: string, content: string, date: string) => void;
  dir: string;
}

function makeRepo(): Repo {
  const dir = mkdtempSync(join(tmpdir(), 'fieldproof-git-'));
  const git = (args: string[], date?: string): void => {
    execFileSync('git', args, {
      cwd: dir,
      env: date ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : process.env,
      stdio: 'ignore',
    });
  };

  git(['init', '-q', '-b', 'main']);

  return {
    cleanup: () => rmSync(dir, { force: true, recursive: true }),
    commit: (file, content, date) => {
      const path = join(dir, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, 'utf8');
      git(['add', file]);
      git(
        ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', file],
        `${date}T12:00:00Z`,
      );
    },
    dir,
  };
}

let repo: Repo | undefined;

afterEach(() => {
  repo?.cleanup();
  repo = undefined;
});

describe('findDrift', () => {
  it('回報 auditedAt 之後被 commit 動過的來源檔', () => {
    repo = makeRepo();
    repo.commit('src/demo.ts', 'v1', '2026-08-10');
    repo.commit('src/demo.ts', 'v2', '2026-08-25');

    // makePage 的 auditedAt 為 2026-08-19、sources 為 ['src/demo.ts']
    expect(findDrift([makePage()], repo.dir)).toEqual([
      { page: 'demo', since: '2026-08-19', sources: ['src/demo.ts'] },
    ]);
  });

  it('來源檔只在 auditedAt 之前動過時，該頁不出現在結果裡', () => {
    repo = makeRepo();
    repo.commit('src/demo.ts', 'v1', '2026-08-10');

    expect(findDrift([makePage()], repo.dir)).toEqual([]);
  });

  it('只列出真的動過的來源檔，沒動的不列', () => {
    repo = makeRepo();
    repo.commit('src/demo.ts', 'v1', '2026-08-10');
    repo.commit('src/other.ts', 'v1', '2026-08-10');
    repo.commit('src/other.ts', 'v2', '2026-08-25');

    const page = makePage();
    page.sources = ['src/demo.ts', 'src/other.ts'];

    expect(findDrift([page], repo.dir)?.[0]?.sources).toEqual(['src/other.ts']);
  });

  it('不在 git repo 裡時回傳空陣列，不拋錯——提示是可選的', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fieldproof-nogit-'));
    try {
      expect(findDrift([makePage()], dir)).toEqual([]);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('尚未有任何 commit 的 repo 也不拋錯', () => {
    repo = makeRepo();

    expect(findDrift([makePage()], repo.dir)).toEqual([]);
  });
});
