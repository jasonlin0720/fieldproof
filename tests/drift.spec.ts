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
  /** 把資料檔 commit 進去，作為漂移比對的基準 */
  commitDataFile: (date: string) => void;
  /** 一次 commit 多個檔案，用來測「來源與資料檔同一個 commit」 */
  commitWith: (files: Record<string, string>, date: string) => void;
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
    commitWith: (files, date) => {
      for (const [file, content] of Object.entries(files)) {
        const path = join(dir, file);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, 'utf8');
        git(['add', file]);
      }
      git(
        ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'batch'],
        `${date}T12:00:00Z`,
      );
    },
    commitDataFile: (date) => {
      const page = makePage();
      mkdirSync(join(dir, 'data'), { recursive: true });
      writeFileSync(join(dir, 'data/demo.json'), JSON.stringify(page, null, 2), 'utf8');
      git(['add', 'data/demo.json']);
      git(
        ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'data'],
        `${date}T12:00:00Z`,
      );
    },
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

/** findDrift 需要資料目錄才能推導出資料檔路徑（檔名恆等於 page）。 */
const drift = (page = makePage(), dir = repo!.dir) => findDrift([page], dir, join(dir, 'data'));

describe('比較基準是資料檔最後一次 commit，不是 auditedAt', () => {
  it('資料檔 commit 之後來源檔又被改過 → 回報', () => {
    repo = makeRepo();
    repo.commit('src/demo.ts', 'v1', '2026-08-10');
    repo.commitDataFile('2026-08-11');
    repo.commit('src/demo.ts', 'v2', '2026-08-25');

    expect(drift()).toEqual([
      {
        changed: ['src/demo.ts'],
        missing: [],
        page: 'demo',
        since: { date: expect.any(String), sha: expect.any(String) },
      },
    ]);
  });

  it('來源檔只在資料檔 commit 之前改過 → 不報', () => {
    repo = makeRepo();
    repo.commit('src/demo.ts', 'v1', '2026-08-10');
    repo.commitDataFile('2026-08-11');

    expect(drift()).toEqual([]);
  });

  it('同一天、資料檔 commit 在後 → 不報', () => {
    // 真實情境的回歸：某個專案裡「改程式碼」與「同步欄位對照」兩個 commit 相距 12 秒。
    // 舊做法用 `--since=auditedAt`，日精度對上時間戳，於是**剛做完盤點的當天必定誤報**。
    repo = makeRepo();
    repo.commit('src/demo.ts', 'v2', '2026-08-19');
    repo.commitDataFile('2026-08-19');

    expect(drift()).toEqual([]);
  });

  it('來源檔與資料檔在同一個 commit 裡一起改 → 不報', () => {
    // 「改程式碼、同時更新欄位對照」是標準流程，不該因此被提醒重新盤點。
    repo = makeRepo();
    repo.commit('src/demo.ts', 'v1', '2026-08-10');
    repo.commitDataFile('2026-08-11');

    const synced = makePage();
    synced.title = '同步後的標題';
    repo.commitWith(
      { 'data/demo.json': JSON.stringify(synced, null, 2), 'src/demo.ts': 'v2' },
      '2026-08-25',
    );

    expect(drift()).toEqual([]);
  });

  it('資料檔尚未 commit 時不做變動比對——沒有基準可比', () => {
    repo = makeRepo();
    repo.commit('src/demo.ts', 'v2', '2026-08-25');

    expect(drift()).toEqual([]);
  });

  it('只列出真的動過的來源檔，沒動的不列', () => {
    repo = makeRepo();
    repo.commit('src/demo.ts', 'v1', '2026-08-10');
    repo.commit('src/other.ts', 'v1', '2026-08-10');
    repo.commitDataFile('2026-08-11');
    repo.commit('src/other.ts', 'v2', '2026-08-25');

    const page = makePage();
    page.sources = ['src/demo.ts', 'src/other.ts'];

    expect(drift(page)[0]?.changed).toEqual(['src/other.ts']);
  });
});

describe('目錄型的 sources', () => {
  /**
   * `--name-only` 回報的是目錄**底下的檔案路徑**，與宣告的目錄字串永遠不相等。
   * 逐字比對會讓整個目錄的變動靜靜地漏掉——實際使用時 12 個 sources 就有一個是目錄，
   * 而且正是最常改的元件目錄。
   */
  it('底下的檔案被改時，回報該目錄', () => {
    repo = makeRepo();
    repo.commit('src/widgets/a.vue', 'v1', '2026-08-10');
    repo.commitDataFile('2026-08-11');
    repo.commit('src/widgets/b.vue', 'v1', '2026-08-25');

    const page = makePage();
    page.sources = ['src/widgets/'];

    expect(drift(page)[0]?.changed).toEqual(['src/widgets/']);
  });

  it('沒有尾斜線的目錄寫法也認得', () => {
    repo = makeRepo();
    repo.commit('src/widgets/a.vue', 'v1', '2026-08-10');
    repo.commitDataFile('2026-08-11');
    repo.commit('src/widgets/a.vue', 'v2', '2026-08-25');

    const page = makePage();
    page.sources = ['src/widgets'];

    expect(drift(page)[0]?.changed).toEqual(['src/widgets']);
  });

  it('目錄底下沒動時不報', () => {
    repo = makeRepo();
    repo.commit('src/widgets/a.vue', 'v1', '2026-08-10');
    repo.commit('src/elsewhere.ts', 'v1', '2026-08-10');
    repo.commitDataFile('2026-08-11');
    repo.commit('src/elsewhere.ts', 'v2', '2026-08-25');

    const page = makePage();
    page.sources = ['src/widgets/'];

    expect(drift(page)).toEqual([]);
  });
});

describe('找不到的來源檔', () => {
  /**
   * 這是這個提示最重要的一半。`sources` 以設定檔所在目錄為基準；基準寫錯時 git 查不到
   * 任何東西，於是**沒有提示**——而讀的人會把沒有提示讀成「沒有變動」。
   */
  it('宣告了卻不存在的來源檔要被指名', () => {
    repo = makeRepo();
    repo.commit('src/demo.ts', 'v1', '2026-08-10');
    repo.commitDataFile('2026-08-11');

    const page = makePage();
    page.sources = ['src/demo.ts', 'src/gone.ts'];

    expect(drift(page)[0]?.missing).toEqual(['src/gone.ts']);
  });

  it('路徑基準寫錯時整頁都報找不到，而不是安靜地沒有提示', () => {
    repo = makeRepo();
    repo.commit('src/demo.ts', 'v2', '2026-08-25');
    repo.commitDataFile('2026-08-11');
    mkdirSync(join(repo.dir, 'docs/fields'), { recursive: true });

    const sub = join(repo.dir, 'docs/fields');
    expect(findDrift([makePage()], sub, join(sub, 'data'))[0]?.missing).toEqual(['src/demo.ts']);
  });

  it('找不到的檔案不參與變動比對——它本來就比不了', () => {
    repo = makeRepo();
    repo.commit('src/demo.ts', 'v1', '2026-08-10');
    repo.commitDataFile('2026-08-11');
    repo.commit('src/demo.ts', 'v2', '2026-08-25');

    const page = makePage();
    page.sources = ['src/demo.ts', 'src/gone.ts'];
    const report = drift(page)[0];

    expect(report?.changed).toEqual(['src/demo.ts']);
    expect(report?.missing).toEqual(['src/gone.ts']);
  });
});

describe('環境不具備時安靜略過', () => {
  it('不在 git repo 裡時不拋錯——提示是可選的', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fieldproof-nogit-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src/demo.ts'), 'v1', 'utf8');

    try {
      expect(findDrift([makePage()], dir, join(dir, 'data'))).toEqual([]);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('尚未有任何 commit 的 repo 也不拋錯', () => {
    repo = makeRepo();
    mkdirSync(join(repo.dir, 'src'), { recursive: true });
    writeFileSync(join(repo.dir, 'src/demo.ts'), 'v1', 'utf8');

    expect(drift()).toEqual([]);
  });
});
