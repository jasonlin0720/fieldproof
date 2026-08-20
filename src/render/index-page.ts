/**
 * 首頁：已有欄位對照的頁面清單。
 * 隨著其他頁面補上 JSON，本頁自動長出對應項目。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { RenderContext } from '../config.js';
import type { FieldMapPage } from '../schema.js';
import type { FieldMapStats } from '../stats.js';

import { fmt, formatRate } from '../format.js';

const ASSETS_DIR = fileURLToPath(new URL('../assets/', import.meta.url));

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderIndex(
  entries: Array<{ page: FieldMapPage; stats: FieldMapStats }>,
  ctx: RenderContext,
): string {
  const { ui } = ctx.locale;
  const css = readFileSync(join(ASSETS_DIR, 'app.css'), 'utf8');
  const indexSource = fmt(ui.indexSource, {
    command: `<code class="resp">${escapeHtml(ctx.command)}</code>`,
    dataDir: `<code class="resp">${escapeHtml(ctx.dataDir)}</code>`,
  });

  const rows = entries
    .map(
      ({ page, stats }) => `
          <tr class="row">
            <td><a class="index__link" href="./${page.page}.html">${escapeHtml(page.title)}</a></td>
            <td><span class="resp">${page.route === undefined ? ctx.locale.md.placeholder : escapeHtml(page.route)}</span></td>
            <td>${stats.sectionCount}</td>
            <td>${stats.fieldCount}</td>
            <td>${stats.queryCount}（${stats.pollingQueryCount} 輪詢）</td>
            <td>每小時 ${formatRate(stats.perHour)}</td>
            <td>${escapeHtml(page.auditedAt)}</td>
            <td><a class="index__link" href="./${page.page}.md">md</a></td>
          </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${ctx.locale.htmlLang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(ui.indexTitle)}</title>
    <link rel="icon" href="data:," />
    <!-- ${fmt(ui.generatedComment, { command: ctx.command, dataPath: ctx.dataDir })} -->
    <style>
${css}
      .index {
        max-width: 1000px;
        margin: 0 auto;
        padding: 32px 20px 64px;
      }
      .index h1 {
        margin: 0 0 6px;
        font-size: 19px;
      }
      .index p {
        margin: 0 0 22px;
        color: var(--text-muted);
      }
      .index__link {
        color: var(--accent);
        font-weight: 600;
        text-decoration: none;
      }
      .index__link:hover {
        text-decoration: underline;
      }
      .index table {
        table-layout: auto;
      }
      .index thead th {
        position: static;
        top: auto;
      }
      .index td {
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <main class="index">
      <h1>${escapeHtml(ui.indexTitle)}</h1>
      <p>
        ${escapeHtml(ui.indexLead)}<br />
        ${indexSource}
      </p>
      <table>
        <thead>
          <tr>
            <th>頁面</th>
            <th>路由</th>
            <th>區塊</th>
            <th>欄位</th>
            <th>查詢</th>
            <th>輪詢負載（支 HTTP）</th>
            <th>盤點日</th>
            <th>LLM 版</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
    </main>
  </body>
</html>
`;
}
