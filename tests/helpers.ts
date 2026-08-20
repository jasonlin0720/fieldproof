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
import type { Locale } from '../src/locales/index.js';

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

/**
 * 覆蓋用資料：**刻意全 ASCII**，且把每個 enum 值與每個可選欄位都用過一遍。
 *
 * 全 ASCII 是為了讓「渲染輸出裡出現任何 CJK 字元」直接等價於「有人硬編了介面文字」，
 * 不必再分辨那個字是資料還是介面。
 */
export function makeCoveragePage(): FieldMapPage {
  return structuredClone({
    page: 'coverage',
    title: 'Coverage',
    route: '/coverage/:id',
    auditedAt: '2026-08-19',
    sources: ['src/a.ts', 'src/b.ts'],
    notes: [{ title: 'Known gap', body: 'Backend has no total yet.' }],
    queries: {
      // 兩個參數 → join.params；有 note / filterNote / enabledWhen；origin 預設 card
      Q1: {
        endpoint: 'GET /api/alpha',
        sdk: 'getAlpha',
        params: { Page: '1', Size: '20' },
        filter: '/api/alpha',
        refetch: 60_000,
        note: 'Fired twice on mount.',
        filterNote: 'Also matches Q4.',
        enabledWhen: 'id is a valid number',
      },
      // conditional + httpCount>1 + origin layout + 另一種間隔 → byInterval 兩組
      Q2: {
        endpoint: 'GET /api/beta',
        sdk: 'getBeta',
        params: { Mode: 'sum' },
        filter: '/api/beta',
        refetch: 3_600_000,
        origin: 'layout',
        httpCount: 3,
        conditional: true,
      },
      // 無 filter → 查詢表的破折號；origin component；不輪詢
      Q3: {
        endpoint: 'GET /api/gamma',
        sdk: 'getGamma',
        params: {},
        refetch: 'none',
        origin: 'component',
      },
      Q4: {
        endpoint: 'GET /api/delta',
        sdk: 'getDelta',
        params: { Id: '7' },
        filter: '/api/delta',
        refetch: 60_000,
      },
    },
    sections: [
      {
        key: 'sec-card',
        kind: 'card',
        title: 'Card section',
        meta: { Placement: 'top-left', Badge: 'live' },
        emptyRule: 'Collapses when there is no data.',
        fields: [
          {
            id: 'f-direct',
            label: 'Direct field',
            query: 'Q1',
            resp: 'totals.amount',
            source: 'direct',
            how: 'Taken as-is',
            display: 'null -> dash',
            checks: [{ given: 'response = null', expect: 'dash' }],
            flags: ['exception', 'fragile'],
            note: 'Deliberate deviation.',
          },
          {
            id: 'f-backend',
            label: 'Backend agg field',
            query: 'Q1',
            resp: 'totals.count',
            source: 'backend-agg',
            how: 'Summed by the backend',
            display: 'Thousands separator',
          },
        ],
      },
      {
        key: 'sec-chart',
        kind: 'chart',
        title: 'Chart section',
        fields: [
          {
            id: 'f-pick',
            label: 'Pick field',
            query: 'Q2',
            resp: 'items[].value',
            source: 'fe-pick',
            how: 'Takes the last item',
            display: 'Suffix %',
          },
          {
            id: 'f-agg',
            label: 'Agg field',
            query: 'Q2',
            resp: 'items[].value',
            source: 'fe-agg',
            how: 'Summed on the frontend',
            display: 'Integer',
          },
        ],
      },
      {
        key: 'sec-table',
        kind: 'table',
        title: 'Table section',
        fields: [
          {
            id: 'f-derive',
            label: 'Derived field',
            query: ['Q1', 'Q3'],
            resp: 'items[].code',
            source: 'fe-derive',
            how: 'Looks up Q3 by the Q1 code',
            display: 'Falls back to the raw code',
            flags: ['unresolved'],
            note: 'Could not find where the lookup table is built.',
          },
          {
            id: 'f-const',
            label: 'Constant field',
            resp: null,
            source: 'fe-const',
            how: 'Hardcoded on the frontend',
            display: 'Fixed text',
          },
        ],
      },
      {
        key: 'sec-filter',
        kind: 'filter',
        title: 'Filter section',
        fields: [
          {
            id: 'f-filter',
            label: 'Filter field',
            query: 'Q3',
            resp: 'options[].label',
            source: 'direct',
            how: 'Rendered as options',
            display: 'Sorted by label',
            flags: ['backend-pending'],
          },
        ],
      },
      {
        key: 'sec-form',
        kind: 'form',
        title: 'Form section',
        fields: [
          {
            id: 'f-form',
            label: 'Form field',
            query: 'Q4',
            resp: 'draft.name',
            source: 'direct',
            how: 'Bound to the input',
            display: 'Trimmed',
          },
        ],
      },
    ],
  }) as FieldMapPage;
}

/** 從 stub locale 的標記中取出 key path，巢狀標記（函式參數裡又有標記）也一併取出。 */
export const STUB_MARK = /«([A-Za-z0-9_.[\]-]+)(?=[(»])/g;

/**
 * 把 locale 的每個字串換成 `«path»`、每個函式換成回傳 `«path(args)»` 的函式。
 *
 * 兩個用途：
 * - 渲染後輸出裡若還有 CJK，就是有人繞過 locale 硬編了介面文字。
 * - 反過來，沒出現在輸出裡的 path 就是沒人用的死鍵。
 */
export function makeStubLocale(): Locale {
  return stub(DEFAULT_LOCALE, '') as Locale;
}

function stub(value: unknown, path: string): unknown {
  if (typeof value === 'string') return `«${path}»`;
  if (typeof value === 'function') {
    return (...args: unknown[]) => `«${path}(${args.map((arg) => String(arg)).join(',')})»`;
  }
  if (Array.isArray(value)) return value.map((item, i) => stub(item, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, stub(item, path ? `${path}.${key}` : key)]),
    );
  }
  return value;
}

/** locale 樹裡所有的葉節點 path，與 `stub()` 產生的 path 同規則。 */
export function localePaths(value: unknown = DEFAULT_LOCALE, path = ''): string[] {
  if (typeof value === 'string' || typeof value === 'function') return [path];
  if (Array.isArray(value)) return value.flatMap((item, i) => localePaths(item, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      localePaths(item, path ? `${path}.${key}` : key),
    );
  }
  return [];
}
