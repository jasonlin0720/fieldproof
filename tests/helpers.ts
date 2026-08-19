/**
 * 測試共用：可變的合法資料工廠 + 臨時資料目錄。
 *
 * 驗證類測試多半是「拿一份合法資料，破壞其中一處，斷言它被擋下來」，
 * 故工廠回傳深拷貝，讓每個 case 能自由改動而不互相污染。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FieldMapPage } from '../src/schema.js';
import type { RenderContext, ResolvedConfig } from '../src/config.js';

import { DEFAULT_LOCALE } from '../src/locales/index.js';

/** 一份最小但合法的頁面資料。 */
export function makePage(): FieldMapPage {
  return structuredClone({
    page: 'demo',
    title: '示範頁',
    route: '/demo',
    auditedAt: '2026-08-19',
    sources: ['src/demo.ts'],
    queries: {
      Q1: {
        endpoint: 'GET /api/a',
        sdk: 'getA',
        params: { Page: '1' },
        filter: '/api/a',
        refetch: 60_000,
      },
      Q2: {
        endpoint: 'GET /api/b',
        sdk: 'getB',
        params: {},
        filter: '/api/b',
        refetch: 'none',
      },
    },
    sections: [
      {
        key: 'sec-one',
        kind: 'card',
        title: '區塊一',
        fields: [
          {
            id: 'f1',
            label: '欄位一',
            query: 'Q1',
            resp: 'totals.x',
            source: 'direct',
            how: '直取',
            display: 'null → —',
          },
        ],
      },
    ],
  }) as FieldMapPage;
}

export const TEST_CONTEXT: RenderContext = {
  command: 'pnpm demo',
  dataDir: 'docs/demo/data',
  locale: DEFAULT_LOCALE,
};

/**
 * 建臨時目錄並寫入資料檔，回傳可直接餵給 `build()` 的設定。
 * 用完請呼叫 `cleanup()`。
 */
export function makeWorkspace(pages: FieldMapPage[]): {
  cleanup: () => void;
  config: ResolvedConfig;
  dir: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'fieldproof-'));
  const dataDir = join(dir, 'data');
  writeDataDir(dataDir, pages);

  return {
    cleanup: () => rmSync(dir, { force: true, recursive: true }),
    config: {
      command: 'pnpm demo',
      dataDir: 'data',
      dataDirAbs: dataDir,
      locale: 'zh-TW',
      outDir: '.',
      outDirAbs: dir,
      outputs: ['html', 'markdown', 'index'],
      rootDir: dir,
    },
    dir,
  };
}

function writeDataDir(dataDir: string, pages: FieldMapPage[]): void {
  mkdirSync(dataDir, { recursive: true });
  for (const page of pages) {
    writeFileSync(join(dataDir, `${page.page}.json`), JSON.stringify(page, null, 2), 'utf8');
  }
}
