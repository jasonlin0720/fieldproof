/**
 * 資料 → markdown。
 *
 * 這份 markdown 的讀者是 **LLM 與 code review**：比讀原始 JSON 省 token，且 `git diff` 能
 * 一眼看出「這個欄位的來源從 totals 改成 items 最後一筆」。人要驗收請用同名的 .html。
 */

import type { RenderContext } from '../config.js';
import type { Field, FieldMapPage, Section } from '../schema.js';
import type { FieldMapStats } from '../stats.js';

import { FLAG_META, ORIGIN_LABELS, SOURCE_LABELS } from '../schema.js';

const REFETCH_LABELS = {
  hourly: '每整點',
  minutely: '每整分',
  none: '不輪詢',
} as const;

const SECTION_KIND_LABELS = {
  card: '卡片',
  chart: '圖表',
  filter: '篩選',
  form: '表單',
  table: '表格',
} as const;

/** 表格儲存格：`|` 會拆欄、換行會斷表。 */
function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function queryIds(field: Field): string[] {
  if (field.query === undefined) return [];
  return Array.isArray(field.query) ? field.query : [field.query];
}

function queryLabel(field: Field): string {
  const ids = queryIds(field);
  return ids.length === 0 ? '—' : ids.join(' ＋ ');
}

function flagLabel(field: Field): string {
  if (!field.flags?.length) return '';
  return ' ' + field.flags.map((flag) => FLAG_META[flag].icon).join('');
}

function renderQueryTable(page: FieldMapPage): string[] {
  const lines = [
    '| #   | 端點 | Network 篩選 | 關鍵參數 | 刷新 | 支數 | 來源 |',
    '| --- | ---- | ------------ | -------- | ---- | ---- | ---- |',
  ];

  for (const [id, query] of Object.entries(page.queries)) {
    const params = Object.entries(query.params)
      .map(([key, value]) => `\`${key}=${value}\``)
      .join('、');
    const origin = ORIGIN_LABELS[query.origin ?? 'card'];
    const filter = query.filter === undefined ? '—' : `\`${cell(query.filter)}\``;
    lines.push(
      `| **${id}** | \`${cell(query.endpoint)}\` | ${filter} | ${cell(params)} | ${
        REFETCH_LABELS[query.refetch]
      } | ${query.httpCount ?? 1} 支${query.conditional ? '（條件性）' : ''} | ${origin} |`,
    );
  }

  return lines;
}

function renderQueryNotes(page: FieldMapPage): string[] {
  const noted = Object.entries(page.queries).filter(([, query]) => query.note || query.filterNote);
  if (noted.length === 0) return [];

  return [
    '',
    '**查詢註記**',
    '',
    ...noted.map(([id, query]) =>
      [
        `- **${id}**：`,
        query.filterNote ? `**篩選提醒：**${query.filterNote}` : '',
        query.note ?? '',
      ]
        .filter(Boolean)
        .join(' '),
    ),
  ];
}

/**
 * 啟用條件。獨立於查詢註記之外——沒有任何查詢帶 `note` 時，啟用條件仍該印出來。
 *
 * 只有在「每一支查詢都有、且條件完全相同」時才敢寫「全部查詢的」；否則逐支列出。
 * 一律當成共通條件會謊報：多數頁面只有部分查詢帶條件。
 */
function renderEnabledWhen(page: FieldMapPage): string[] {
  const entries = Object.entries(page.queries).filter(([, query]) => query.enabledWhen);
  if (entries.length === 0) return [];

  const values = new Set(entries.map(([, query]) => query.enabledWhen));
  const everyQuery = entries.length === Object.keys(page.queries).length;

  if (everyQuery && values.size === 1) {
    return ['', `> 全部查詢的 \`enabledWhen\`：${[...values][0]}——不成立時查詢停用。`];
  }

  return [
    '',
    '> `enabledWhen`（不成立時該支查詢停用）：',
    ...entries.map(([id, query]) => `> - **${id}**：${query.enabledWhen}`),
  ];
}

function renderSection(section: Section, index: number): string[] {
  const meta = Object.entries(section.meta ?? {})
    .map(([key, value]) => `${key} ${value}`)
    .join(' ・ ');

  const lines = [
    `## ${index + 1}. ${section.title} \`${section.key}\``,
    '',
    `${SECTION_KIND_LABELS[section.kind]}${meta ? ' ・ ' + meta : ''}`,
  ];

  if (section.emptyRule) {
    lines.push('', `**空狀態**：${section.emptyRule}`);
  }

  lines.push(
    '',
    '| UI 欄位 | 查詢 | response 欄位 | 取得方式 | 顯示層 |',
    '| ------- | ---- | ------------- | -------- | ------ |',
  );

  for (const field of section.fields) {
    const resp = field.resp === '—' ? '—' : `\`${cell(field.resp)}\``;
    lines.push(
      `| ${cell(field.label)}${flagLabel(field)} | ${queryLabel(field)} | ${resp} | ` +
        `**${SOURCE_LABELS[field.source]}**：${cell(field.how)} | ${cell(field.display)} |`,
    );
  }

  const withChecks = section.fields.filter((field) => field.checks?.length);
  if (withChecks.length > 0) {
    lines.push('', '**驗證檢查點**', '');
    for (const field of withChecks) {
      lines.push(`- **${field.label}**`);
      for (const check of field.checks ?? []) {
        lines.push(`  - \`${cell(check.given)}\` → ${cell(check.expect)}`);
      }
    }
  }

  const noted = section.fields.filter((field) => field.note || field.flags?.length);
  if (noted.length > 0) {
    lines.push('', '**欄位註記**', '');
    for (const field of noted) {
      const flags = (field.flags ?? [])
        .map((flag) => `${FLAG_META[flag].icon} ${FLAG_META[flag].label}`)
        .join('；');
      const parts = [flags, field.note].filter(Boolean).join(' —— ');
      lines.push(`- **${field.label}**：${parts}`);
    }
  }

  return lines;
}

/** 依 source 分兩欄：後端算好的（改不了）vs 前端算的（改得了）。 */
function renderSourceSummary(page: FieldMapPage, stats: FieldMapStats): string[] {
  const backendKinds = new Set(['backend-agg', 'direct']);
  const rows: Array<{ backend: string; frontend: string }> = [];

  const backend: string[] = [];
  const frontend: string[] = [];

  for (const section of page.sections) {
    for (const field of section.fields) {
      const entry = `${section.title}・${field.label}（\`${cell(field.resp)}\`）`;
      if (backendKinds.has(field.source)) backend.push(entry);
      else frontend.push(entry);
    }
  }

  const rowCount = Math.max(backend.length, frontend.length);
  for (let i = 0; i < rowCount; i += 1) {
    rows.push({ backend: backend[i] ?? '—', frontend: frontend[i] ?? '—' });
  }

  const counts = Object.entries(stats.bySource)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${SOURCE_LABELS[kind as keyof typeof SOURCE_LABELS]} ${count}`)
    .join(' ・ ');

  return [
    '## 「後端算好」vs「前端算的」速查',
    '',
    '要改動取值邏輯時先看這張表——左欄改不了（要找後端），右欄改得了（在前端）。',
    '',
    `欄位分佈：${counts}`,
    '',
    '| 後端算好、前端直取 | 前端自己算 |',
    '| ------------------ | ---------- |',
    ...rows.map((row) => `| ${row.backend} | ${row.frontend} |`),
  ];
}

export function renderMarkdown(
  page: FieldMapPage,
  stats: FieldMapStats,
  ctx: RenderContext,
): string {
  const lines: string[] = [
    page.route === undefined
      ? `# ${page.title} 欄位對照`
      : `# ${page.title}（\`${page.route}\`）欄位對照`,
    '',
    `> ⚠️ **本檔由 \`${ctx.command}\` 從 \`${ctx.dataDir}/${page.page}.json\` 生成，請勿手改**`,
    `> ——任何手動編輯都會在下次重跑時被覆蓋。要改內容請改 JSON 後重跑。`,
    '>',
    `> **人要驗收請開 [\`${page.page}.html\`](./${page.page}.html)**（可勾選、可篩選、可匯出問題清單）；`,
    '> 本 markdown 是給 LLM 讀與 `git diff` 審閱用的。',
    '>',
    '> 跨頁通用規則（回應 envelope、空值退場、數字格式、刷新機制等）見同目錄',
    '> [README.md](./README.md)，本檔不重述。',
    '>',
    `> 盤點日期：**${page.auditedAt}**（「對過程式碼」的日期，不是「驗收過」的日期）`,
    '>',
    '> 盤點時讀過的原始碼：',
    ...page.sources.map((source) => `> - \`${source}\``),
    '',
    '---',
    '',
    '## 概況',
    '',
    `- **${stats.sectionCount} 個區塊、${stats.fieldCount} 個欄位**，由 **${stats.queryCount} 個查詢**組成`,
    `- 其中 **${stats.pollingQueryCount} 個查詢參與輪詢**，單次全量刷新 = **${stats.pollingHttpCount} 支 HTTP**`,
    `- 輪詢負載：每分鐘 **${stats.perMinute} 支**、每小時 **${stats.perHour} 支**`,
    `- **Network 對帳基準：進頁應出現 ${stats.baseHttpCount} 支 request**` +
      (stats.conditionalHttpCount
        ? `，另有 ${stats.conditionalHttpCount} 支條件性請求（卡片隱藏時不會出現）`
        : ''),
    '',
    '> 以上數字由查詢定義推導，非手寫——加一支查詢或改一個刷新間隔，數字自己會對。',
    '> 若分頁常駐且背景仍刷新，實際負載需再乘上同時在線的分頁數。',
    '',
    '---',
    '',
    '## 查詢清單',
    '',
    ...renderQueryTable(page),
    ...renderQueryNotes(page),
    ...renderEnabledWhen(page),
    '',
    '---',
    '',
  ];

  page.sections.forEach((section, index) => {
    lines.push(...renderSection(section, index), '', '---', '');
  });

  lines.push(...renderSourceSummary(page, stats), '');

  if (page.notes?.length) {
    lines.push('---', '', '## 已知落差 / 注意事項', '');
    page.notes.forEach((note, index) => {
      lines.push(`${index + 1}. **${note.title}**`, '', `   ${note.body}`, '');
    });
  }

  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}
