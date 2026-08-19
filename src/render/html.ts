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

import { fmt, formatInterval, formatRate } from '../format.js';

const ASSETS_DIR = fileURLToPath(new URL('../assets/', import.meta.url));

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
          <summary class="multi__summary">${escapeHtml(label)} <span class="multi__count" style="display:none"></span></summary>
          <div class="multi__panel"></div>
        </details>`;
}

export function renderHtml(page: FieldMapPage, stats: FieldMapStats, ctx: RenderContext): string {
  const { locale } = ctx;
  const { ui } = locale;

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
      flagMeta: locale.flag,
      // 間隔標籤預先算好注入，瀏覽器端不重寫一套格式化規則。
      intervalLabels: Object.fromEntries(
        stats.byInterval.map((load) => [load.intervalMs, formatInterval(load.intervalMs, locale)]),
      ),
      originLabels: locale.origin,
      refetchLabels: Object.fromEntries(
        Object.entries(page.queries).map(([id, query]) => [
          id,
          formatInterval(query.refetch, locale),
        ]),
      ),
      sectionKindLabels: locale.sectionKind,
      sourceLabels: locale.source,
      stats,
      ui,
    }),
  );

  const meta = [
    page.route === undefined ? '' : `<code>${escapeHtml(page.route)}</code>`,
    fmt(ui.metaSections, { n: stats.sectionCount }),
    fmt(ui.metaFields, { n: stats.fieldCount }),
    fmt(ui.metaQueries, {
      http: stats.pollingHttpCount,
      n: stats.queryCount,
      perHour: formatRate(stats.perHour),
      polling: stats.pollingQueryCount,
    }),
    fmt(ui.metaAudited, { date: escapeHtml(page.auditedAt) }),
  ]
    .filter(Boolean)
    .join(' ・ ');

  const notes = page.notes?.length
    ? `
      <section class="notes">
        <h2>${escapeHtml(ui.notesHeading)}</h2>
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
<html lang="${locale.htmlLang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(fmt(ui.pageTitle, { title: page.title }))}</title>
    <!-- 空 favicon：擋掉瀏覽器對 /favicon.ico 的自動請求，讓 Network 面板保持只有零筆外部請求 -->
    <link rel="icon" href="data:," />
    <!--
      ${fmt(ui.generatedComment, { command: ctx.command, dataPath: `${ctx.dataDir}/${page.page}.json` })}
    -->
    <style>
${css}
    </style>
  </head>
  <body>
    <header class="toolbar">
      <div>
        <h1>${escapeHtml(fmt(ui.heading, { title: page.title }))}</h1>
        <p class="toolbar__meta">
          ${meta}
        </p>
      </div>
      <div class="toolbar__spacer"></div>
      <div class="progress">
        <div class="progress__text">
          <span>${escapeHtml(ui.progressVerified)} <b id="progress-done">0/0</b> <span id="visible-count"></span></span>
          <span id="progress-ng">${escapeHtml(ui.progressNoProblem)}</span>
        </div>
        <div class="progress__bar"><span class="progress__fill" id="progress-fill"></span></div>
      </div>
      <button class="btn" type="button" id="reconcile">${escapeHtml(ui.btnReconcile)}</button>
      <button class="btn" type="button" id="export">${escapeHtml(ui.btnExport)}</button>
      <button class="btn btn--danger" type="button" id="reset">${escapeHtml(ui.btnReset)}</button>
    </header>

    <div class="filters">
      <input class="search" type="search" id="search" placeholder="${escapeHtml(ui.searchPlaceholder)}" aria-label="${escapeHtml(ui.searchAria)}" />

      <span class="filters__label">${escapeHtml(ui.groupLabel)}</span>
      <div class="seg" role="group" aria-label="${escapeHtml(ui.groupAria)}">
        <button type="button" data-group="section" aria-pressed="true">${escapeHtml(ui.groupBySection)}</button>
        <button type="button" data-group="query" aria-pressed="false">${escapeHtml(ui.groupByQuery)}</button>
      </div>
${multiFilter('filter-section', ui.filterSection)}
${multiFilter('filter-query', ui.filterQuery)}
${multiFilter('filter-source', ui.filterSource)}

      <span class="filters__label">${escapeHtml(ui.statusLabel)}</span>
      <div class="seg" role="group" aria-label="${escapeHtml(ui.statusAria)}">
        <button type="button" data-status="all" aria-pressed="true">${escapeHtml(ui.statusAll)}</button>
        <button type="button" data-status="unverified" aria-pressed="false">${escapeHtml(ui.statusUnverified)}</button>
        <button type="button" data-status="problem" aria-pressed="false">${escapeHtml(ui.statusProblem)}</button>
        <button type="button" data-status="stale" aria-pressed="false">${escapeHtml(ui.statusStale)}</button>
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
            <th>${escapeHtml(ui.colField)}</th>
            <th>${escapeHtml(ui.colQuery)}</th>
            <th>${escapeHtml(ui.colResp)}</th>
            <th>${escapeHtml(ui.colExpect)}</th>
            <th class="col-actual">${escapeHtml(ui.colActual)}</th>
            <th>${escapeHtml(ui.colData)}</th>
            <th>${escapeHtml(ui.colDisplay)}</th>
            <th class="col-note">${escapeHtml(ui.colNote)}</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
${notes}
    </main>

    <dialog class="dlg" id="reconcile-dlg">
      <div class="dlg__head">
        <strong>${escapeHtml(ui.reconcileTitle)}</strong>
        <button class="btn" type="button" id="reconcile-close">${escapeHtml(ui.btnClose)}</button>
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
