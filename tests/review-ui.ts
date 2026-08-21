/**
 * 在 happy-dom 裡開啟生成的驗收介面，供行為測試用。
 *
 * 刻意載入 `renderHtml()` 的**真實輸出**，而不是另拼一份簡化 DOM——後者會讓測試通過
 * 但生成物壞掉，正好漏掉這個介面唯一的交付形式。
 *
 * happy-dom 的 `document.write` 會建出 DOM 但不執行內嵌 `<script>`，所以自己 eval 一次。
 * 附帶好處是不必等非同步載入，測試是同步且決定性的。
 */

import { Window } from 'happy-dom';

import type { Document, Element, HTMLElement } from 'happy-dom';

import type { RenderContext } from '../src/config.js';
import type { FieldMapPage } from '../src/schema.js';

import { renderHtml } from '../src/render/html.js';
import { computeStats } from '../src/stats.js';
import { makeCoveragePage, TEST_CONTEXT } from './helpers.js';

export type MarkKind = 'data' | 'display';
export type MarkValue = 'ng' | 'ok';

export interface ReviewUi {
  close: () => Promise<void>;
  /** 該列的驗收標記存放位置，用來跨開啟延續狀態。 */
  storageKey: string;
  detailOf: (id: string) => Element | null;
  doc: Document;
  expandOf: (id: string) => HTMLElement;
  /** 該列所有能觸發展開的元素——展開鈕，以及帶 tooltip 的 chip / tag。 */
  expandTriggersOf: (id: string) => HTMLElement[];
  markOf: (id: string, kind: MarkKind, value: MarkValue) => HTMLElement;
  noteInputOf: (id: string) => HTMLElement;
  /** 目前網址的 query string，用來驗證篩選狀態有沒有同步出去。 */
  queryString: () => string;
  searchEl: () => HTMLElement;
  rowIds: () => string[];
  rowOf: (id: string) => HTMLElement;
  win: Window;
}

export interface OpenOptions {
  /** 覆寫渲染脈絡，例如 namespace。 */
  context?: Partial<RenderContext>;
  /** 預先寫進 localStorage 的內容，用來模擬「上次驗收過」。 */
  storage?: Record<string, string>;
  /** 開啟時的網址，用來模擬「別人分享過來的篩選狀態」。 */
  url?: string;
}

export function openReviewUi(
  page: FieldMapPage = makeCoveragePage(),
  options: OpenOptions = {},
): ReviewUi {
  const ctx: RenderContext = { ...TEST_CONTEXT, ...options.context };
  const win = new Window({ url: options.url ?? 'http://localhost/' });
  const doc: Document = win.document;

  for (const [key, value] of Object.entries(options.storage ?? {})) {
    win.localStorage.setItem(key, value);
  }

  win.document.write(renderHtml(page, computeStats(page), ctx));
  const script = win.document.querySelectorAll('script')[1]?.textContent;
  if (!script) throw new Error('生成的 HTML 裡找不到內嵌的 app.js');
  win.eval(script);

  const need = <T>(value: T | null | undefined, what: string): T => {
    if (value === null || value === undefined) throw new Error(`找不到 ${what}`);
    return value;
  };

  const rowOf = (id: string): HTMLElement =>
    need(doc.querySelector(`tr.row[data-id="${id}"]`), `列 ${id}`) as HTMLElement;

  return {
    close: () => win.happyDOM.close(),
    doc,
    storageKey: `fieldproof:v1:${ctx.namespace ? `${ctx.namespace}:` : ''}${page.page}`,
    win,

    rowOf,
    rowIds: () =>
      [...doc.querySelectorAll('tr.row')].map((row) => row.getAttribute('data-id') ?? ''),

    expandOf: (id) => need(rowOf(id).querySelector('.expand'), `${id} 的展開鈕`) as HTMLElement,

    expandTriggersOf: (id) => [...rowOf(id).querySelectorAll('[data-expand]')] as HTMLElement[],

    queryString: () => win.location.search,

    searchEl: () => need(doc.getElementById('search'), '搜尋框') as HTMLElement,

    markOf: (id, kind, value) =>
      need(
        rowOf(id).querySelector(`.mark[data-kind="${kind}"][data-mark="${value}"]`),
        `${id} 的 ${kind}/${value} 標記鈕`,
      ) as HTMLElement,

    noteInputOf: (id) =>
      need(rowOf(id).querySelector('[data-input="note"]'), `${id} 的備註欄`) as HTMLElement,

    /** 明細列緊接在該列之後；未展開時沒有這一列。 */
    detailOf: (id) => {
      const next = rowOf(id).nextElementSibling;
      return next?.classList.contains('detail') ? next : null;
    },
  };
}
