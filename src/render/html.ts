/**
 * 資料 → 單一自含 HTML（驗收介面）。
 *
 * CSS / JS / 資料全部 inline，零外部請求，雙擊即開。預期使用情境：
 * 一邊是待驗收的頁面加開 DevTools Network，一邊是本頁全螢幕，照著 request 逐欄位對。
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { RenderContext } from '../config.js';
import type { Field, FieldMapPage } from '../schema.js';
import type { FieldMapStats } from '../stats.js';

import { formatInterval, formatRate } from '../format.js';
import { FLAG_META, ORIGIN_LABELS, SOURCE_LABELS } from '../schema.js';

const ASSETS_DIR = fileURLToPath(new URL('../assets/', import.meta.url));

const SECTION_KIND_LABELS = {
  card: '卡片',
  chart: '圖表',
  filter: '篩選',
  form: '表單',
  table: '表格',
} as const;

/**
 * 欄位定義的指紋，用於「上次驗收後定義有沒有改過」。
 *
 * **「資料」與「顯示」兩側各算一份**：JSON 若只改了顯示規則，「資料抓得對不對」的
 * 結論仍然有效，不該一起失效。`checks` 兩側都算——檢查點改了代表驗法變了。
 *
 * 改 `label` / `note` / `flags` 不影響任何一側（不會讓既有標記失效）。
 * sha256 為確定性計算，不影響 `--check`。
 */
function hashOf(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 8);
}

function dataHash(field: Field): string {
  return hashOf([field.query ?? null, field.resp, field.source, field.how, field.checks ?? null]);
}

function displayHash(field: Field): string {
  return hashOf([field.display, field.checks ?? null]);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** inline JSON 需擋掉 `</script>` 提前結束標籤。 */
function escapeJson(value: string): string {
  return value
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function multiFilter(id: string, label: string): string {
  return `
        <details class="multi" id="${id}">
          <summary class="multi__summary">${label} <span class="multi__count" style="display:none"></span></summary>
          <div class="multi__panel"></div>
        </details>`;
}

export function renderHtml(page: FieldMapPage, stats: FieldMapStats, ctx: RenderContext): string {
  const css = readFileSync(join(ASSETS_DIR, 'app.css'), 'utf8');
  const js = readFileSync(join(ASSETS_DIR, 'app.js'), 'utf8');

  const payload = escapeJson(
    JSON.stringify({
      ...page,
      sections: page.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => ({
          ...field,
          dataHash: dataHash(field),
          displayHash: displayHash(field),
        })),
      })),
      flagMeta: FLAG_META,
      // 間隔標籤預先算好注入，瀏覽器端不重寫一套格式化規則。
      intervalLabels: Object.fromEntries(
        stats.byInterval.map((load) => [load.intervalMs, formatInterval(load.intervalMs)]),
      ),
      originLabels: ORIGIN_LABELS,
      refetchLabels: Object.fromEntries(
        Object.entries(page.queries).map(([id, query]) => [id, formatInterval(query.refetch)]),
      ),
      sectionKindLabels: SECTION_KIND_LABELS,
      sourceLabels: SOURCE_LABELS,
      stats,
    }),
  );

  const notes = page.notes?.length
    ? `
      <section class="notes">
        <h2>已知落差 / 注意事項</h2>
        <ol>
${page.notes
  .map(
    (note) =>
      `          <li><b>${escapeHtml(note.title)}</b><span>${escapeHtml(note.body)}</span></li>`,
  )
  .join('\n')}
        </ol>
      </section>`
    : '';

  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(page.title)} 欄位對照 · 驗收</title>
    <!-- 空 favicon：擋掉瀏覽器對 /favicon.ico 的自動請求，讓 Network 面板保持只有零筆外部請求 -->
    <link rel="icon" href="data:," />
    <!--
      本檔由 \`${ctx.command}\` 從 ${ctx.dataDir}/${page.page}.json 生成，請勿手改。
      要改內容請改 JSON 後重跑。
    -->
    <style>
${css}
    </style>
  </head>
  <body>
    <header class="toolbar">
      <div>
        <h1>${escapeHtml(page.title)} 欄位對照</h1>
        <p class="toolbar__meta">
          ${page.route === undefined ? '' : `<code>${escapeHtml(page.route)}</code> ・`}
          ${stats.sectionCount} 區塊 ・ ${stats.fieldCount} 欄位 ・
          ${stats.queryCount} 查詢（${stats.pollingQueryCount} 輪詢，單次全量 ${stats.pollingHttpCount} 支 HTTP；
          每小時 ${formatRate(stats.perHour)} 支）・
          盤點 ${escapeHtml(page.auditedAt)}
        </p>
      </div>
      <div class="toolbar__spacer"></div>
      <div class="progress">
        <div class="progress__text">
          <span>已驗 <b id="progress-done">0/0</b> <span id="visible-count"></span></span>
          <span id="progress-ng">無問題</span>
        </div>
        <div class="progress__bar"><span class="progress__fill" id="progress-fill"></span></div>
      </div>
      <button class="btn" type="button" id="reconcile">Network 對帳</button>
      <button class="btn" type="button" id="export">匯出問題清單</button>
      <button class="btn btn--danger" type="button" id="reset">重置</button>
    </header>

    <div class="filters">
      <input class="search" type="search" id="search" placeholder="搜尋欄位 / response / 取值方式…" aria-label="搜尋" />

      <span class="filters__label">分組</span>
      <div class="seg" role="group" aria-label="分組方式">
        <button type="button" data-group="section" aria-pressed="true">依區塊</button>
        <button type="button" data-group="query" aria-pressed="false">依查詢</button>
      </div>
${multiFilter('filter-section', '區塊')}
${multiFilter('filter-query', '查詢')}
${multiFilter('filter-source', '取得方式')}

      <span class="filters__label">狀態</span>
      <div class="seg" role="group" aria-label="驗收狀態">
        <button type="button" data-status="all" aria-pressed="true">全部</button>
        <button type="button" data-status="unverified" aria-pressed="false">只看未驗</button>
        <button type="button" data-status="problem" aria-pressed="false">只看有問題</button>
        <button type="button" data-status="stale" aria-pressed="false">定義已變更</button>
      </div>
    </div>

    <main class="table-wrap">
      <table>
        <colgroup>
          <col style="width: 34px" />
          <col style="width: 168px" />
          <col style="width: 76px" />
          <col style="width: 258px" />
          <col />
          <col class="col-actual" style="width: 112px" />
          <col style="width: 74px" />
          <col style="width: 74px" />
          <col class="col-note" style="width: 168px" />
        </colgroup>
        <thead>
          <tr>
            <th><span class="sr-only"></span></th>
            <th>UI 欄位</th>
            <th>查詢</th>
            <th>response 欄位</th>
            <th>預期取值 / 顯示</th>
            <th class="col-actual">畫面實際值</th>
            <th>資料</th>
            <th>顯示</th>
            <th class="col-note">備註</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
${notes}
    </main>

    <dialog class="dlg" id="reconcile-dlg">
      <div class="dlg__head">
        <strong>Network 對帳清單</strong>
        <button class="btn" type="button" id="reconcile-close">關閉</button>
      </div>
      <div class="dlg__body" id="reconcile-body"></div>
    </dialog>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>

    <script type="application/json" id="fieldproof-data">${payload}</script>
    <script>
${js}
    </script>
  </body>
</html>
`;
}
