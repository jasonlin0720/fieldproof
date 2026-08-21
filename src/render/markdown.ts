/**
 * 資料 → markdown。
 *
 * 這份 markdown 的讀者是 **LLM 與 code review**：比讀原始 JSON 省 token，且 `git diff` 能
 * 一眼看出「這個欄位的來源從 totals 改成 items 最後一筆」。人要驗收請用同名的 .html。
 */

import type { RenderContext } from '../config.js';

import { GENERATED_MARKER } from '../config.js';
import type { Locale } from '../locales/index.js';
import type { Field, FieldMapPage, Section } from '../schema.js';
import type { FieldMapStats } from '../stats.js';

import { formatInterval, formatRate } from '../format.js';

/** 各刷新間隔的負載明細。只有一種間隔時省略——括號內容會與前面的總數重複。 */
function intervalBreakdown(stats: FieldMapStats, locale: Locale): string {
  if (stats.byInterval.length < 2) return '';

  const parts = stats.byInterval.map((load) =>
    locale.md.intervalPart(
      formatInterval(load.intervalMs, locale),
      load.httpCount,
      formatRate(load.perHour),
    ),
  );
  return locale.md.intervalBreakdown(parts);
}

/** 表格儲存格：`|` 會拆欄、換行會斷表。 */
function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function queryIds(field: Field): string[] {
  if (field.query === undefined) return [];
  return Array.isArray(field.query) ? field.query : [field.query];
}

function queryLabel(field: Field, locale: Locale): string {
  const ids = queryIds(field);
  return ids.length === 0 ? locale.md.placeholder : ids.join(locale.md.join.query);
}

function flagLabel(field: Field, locale: Locale): string {
  if (!field.flags?.length) return '';
  return ' ' + field.flags.map((flag) => locale.flag[flag].icon).join('');
}

function renderQueryTable(page: FieldMapPage, locale: Locale): string[] {
  const lines = [...locale.md.queryTableHead];

  for (const [id, query] of Object.entries(page.queries)) {
    const params = Object.entries(query.params)
      .map(([key, value]) => `\`${key}=${value}\``)
      .join(locale.md.join.params);
    const origin = locale.origin[query.origin ?? 'card'];
    const filter = query.filter === undefined ? locale.md.placeholder : `\`${cell(query.filter)}\``;
    const count =
      locale.md.queryCount(query.httpCount ?? 1) +
      (query.conditional ? locale.md.conditionalSuffix : '');

    lines.push(
      `| **${id}** | \`${cell(query.endpoint)}\` | ${filter} | ${cell(params)} | ` +
        `${formatInterval(query.refetch, locale)} | ${count} | ${origin} |`,
    );
  }

  return lines;
}

function renderQueryNotes(page: FieldMapPage, locale: Locale): string[] {
  const noted = Object.entries(page.queries).filter(([, query]) => query.note || query.filterNote);
  if (noted.length === 0) return [];

  return [
    '',
    locale.md.queryNotesHeading,
    '',
    ...noted.map(([id, query]) =>
      [
        locale.md.queryNoteItem(id),
        query.filterNote ? locale.md.filterNoteLabel(query.filterNote) : '',
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
function renderEnabledWhen(page: FieldMapPage, locale: Locale): string[] {
  const entries = Object.entries(page.queries).filter(([, query]) => query.enabledWhen);
  if (entries.length === 0) return [];

  // 依條件值分組：多數頁面是「大部分查詢共用同一條件」，逐支列出會刷出一整片重複。
  const byCondition = new Map<string, string[]>();
  for (const [id, query] of entries) {
    const condition = String(query.enabledWhen);
    byCondition.set(condition, [...(byCondition.get(condition) ?? []), id]);
  }

  const everyQuery = entries.length === Object.keys(page.queries).length;
  if (everyQuery && byCondition.size === 1) {
    return ['', locale.md.enabledWhenAll([...byCondition.keys()][0] as string)];
  }

  return [
    '',
    locale.md.enabledWhenHeading,
    ...[...byCondition.entries()].map(([condition, ids]) =>
      locale.md.enabledWhenItem(ids, condition),
    ),
  ];
}

function renderSection(section: Section, index: number, locale: Locale): string[] {
  const meta = Object.entries(section.meta ?? {})
    .map(([key, value]) => locale.md.metaPair(key, value))
    .join(locale.md.join.meta);

  const lines = [
    locale.md.sectionHeading(index + 1, section.title, section.key),
    '',
    locale.md.sectionMeta(locale.sectionKind[section.kind], meta),
  ];

  if (section.emptyRule) {
    lines.push('', locale.md.emptyRule(section.emptyRule));
  }

  lines.push('', ...locale.md.fieldTableHead);

  for (const field of section.fields) {
    const resp = field.resp === null ? locale.md.placeholder : `\`${cell(field.resp)}\``;
    lines.push(
      `| ${cell(field.label)}${flagLabel(field, locale)} | ${queryLabel(field, locale)} | ` +
        `${resp} | ${locale.md.fieldRow(locale.source[field.source], cell(field.how))} | ` +
        `${cell(field.display)} |`,
    );
  }

  const withChecks = section.fields.filter((field) => field.checks?.length);
  if (withChecks.length > 0) {
    lines.push('', locale.md.checksHeading, '');
    for (const field of withChecks) {
      lines.push(locale.md.checkGroup(field.label));
      for (const check of field.checks ?? []) {
        lines.push(locale.md.checkItem(cell(check.given), cell(check.expect)));
      }
    }
  }

  const noted = section.fields.filter((field) => field.note || field.flags?.length);
  if (noted.length > 0) {
    lines.push('', locale.md.fieldNotesHeading, '');
    for (const field of noted) {
      const flags = (field.flags ?? [])
        .map((flag) => locale.md.flagWithLabel(locale.flag[flag].icon, locale.flag[flag].label))
        .join(locale.md.join.flags);
      const parts = [flags, field.note].filter(Boolean).join(locale.md.join.flagAndNote);
      lines.push(locale.md.fieldNote(field.label, parts));
    }
  }

  return lines;
}

/**
 * 各 source 的欄位數，如「API 直取 5 ・ 前端聚合 2」。
 *
 * 曾經還有一張「後端算好 vs 前端算的」兩欄速查表，已移除：每個欄位的 `source` 前面的
 * 區塊表格就有了，重印一次佔全文一成三，而且兩欄以索引配對會讓左右列看起來相關——
 * 這份 markdown 的讀者是 LLM，表格列的並置正是它會拿來推論的東西。
 */
function sourceCounts(stats: FieldMapStats, locale: Locale): string {
  return Object.entries(stats.bySource)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => locale.md.sourceCount(locale.source[kind as never], count))
    .join(locale.md.sourceCountJoin);
}

export function renderMarkdown(
  page: FieldMapPage,
  stats: FieldMapStats,
  ctx: RenderContext,
): string {
  const { locale } = ctx;
  const { md } = locale;

  const lines: string[] = [
    `<!-- ${GENERATED_MARKER} -->`,
    '',
    page.route === undefined
      ? md.titleWithoutRoute(page.title)
      : md.titleWithRoute(page.title, page.route),
    '',
    md.generatedBy(ctx.command, `${ctx.dataDir}/${page.page}.json`),
    md.generatedByCont,
    '>',
    md.openHtml(page.page),
    md.audienceNote,
    '>',
    md.auditedAt(page.auditedAt),
    '>',
    md.sourcesHeading,
    ...page.sources.map((source) => md.sourceItem(source)),
    '',
    '---',
    '',
    md.overviewHeading,
    '',
    md.overviewCounts(stats.sectionCount, stats.fieldCount, stats.queryCount),
    md.overviewPolling(stats.pollingQueryCount, stats.pollingHttpCount),
    md.overviewLoad(formatRate(stats.perHour), intervalBreakdown(stats, locale)),
    md.overviewBaseline(stats.baseHttpCount, stats.conditionalHttpCount),
    md.overviewSources(sourceCounts(stats, locale)),
    // 只在有推測的欄位時才印。這份 markdown 的讀者是 LLM 與 code review，
    // 「這頁有幾格是猜的」正是該最先看到的東西，不該只藏在欄位名後面的一個圖示裡。
    ...(stats.unresolvedCount > 0 ? [md.overviewUnresolved(stats.unresolvedCount)] : []),
    '',
    ...md.overviewDerivedNote,
    '',
    '---',
    '',
    md.queriesHeading,
    '',
    ...renderQueryTable(page, locale),
    ...renderQueryNotes(page, locale),
    ...renderEnabledWhen(page, locale),
    '',
    '---',
    '',
  ];

  page.sections.forEach((section, index) => {
    lines.push(...renderSection(section, index, locale), '', '---', '');
  });

  if (page.notes?.length) {
    lines.push(md.notesHeading, '');
    page.notes.forEach((note, index) => {
      lines.push(md.noteItem(index + 1, note.title), '', `   ${note.body}`, '');
    });
  }

  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}
