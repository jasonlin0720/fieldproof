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
  const css = readFileSync(join(ASSETS_DIR, 'app.css'), 'utf8');

  const rows = entries
    .map(
      ({ page, stats }) => `
          <tr class="row">
            <td><a class="index__link" href="./${page.page}.html">${escapeHtml(page.title)}</a></td>
            <td><span class="resp">${escapeHtml(page.route)}</span></td>
            <td>${stats.sectionCount}</td>
            <td>${stats.fieldCount}</td>
            <td>${stats.queryCount}（${stats.pollingQueryCount} 輪詢）</td>
            <td>每分 ${stats.perMinute} ・ 每時 ${stats.perHour}</td>
            <td>${escapeHtml(page.auditedAt)}</td>
            <td><a class="index__link" href="./${page.page}.md">md</a></td>
          </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>欄位對照</title>
    <link rel="icon" href="data:," />
    <!-- 本檔由 \`${ctx.command}\` 生成，請勿手改。 -->
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
      <h1>欄位對照</h1>
      <p>
        每個畫面上的數字，是哪支 API、什麼粒度、response 哪個欄位、直取還是前端算的。<br />
        資料來源為 <code class="resp">${escapeHtml(ctx.dataDir)}/*.json</code>，本頁與各頁 HTML / markdown
        皆由 <code class="resp">${escapeHtml(ctx.command)}</code> 生成。通用規則見
        <a class="index__link" href="./README.md">README.md</a>。
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
