/**
 * 從頁面資料推導統計。
 *
 * 這些數字（每分鐘 / 每小時幾支 HTTP、單次全量刷新幾支）過去是手寫維護的，改資料時人得自己
 * 重算。改由本檔推導後，加一支查詢或改一個粒度，數字自己會對。
 */

import type { FieldMapPage, Query, SourceKind } from './schema.js';

export interface FieldMapStats {
  /** 各 source 的欄位數，供「後端合計 vs 前端聚合」速查表 */
  bySource: Record<SourceKind, number>;
  fieldCount: number;
  /** 進頁一定會發的 HTTP 支數（不含條件性請求）——對帳 Network 面板時的基準值 */
  baseHttpCount: number;
  /** 條件性請求的 HTTP 支數（卡片隱藏時不會出現） */
  conditionalHttpCount: number;
  /** 全部查詢的 HTTP 支數（含不參與輪詢者、含條件性） */
  httpCount: number;
  /** 每小時發出的 HTTP 支數 = 每分鐘 × 60 ＋ 每整點的支數 */
  perHour: number;
  /** 每分鐘發出的 HTTP 支數 */
  perMinute: number;
  /** 單次全量刷新的 HTTP 支數（只算會被輪詢的查詢） */
  pollingHttpCount: number;
  /** 參與輪詢的查詢數（refetch !== 'none'） */
  pollingQueryCount: number;
  queryCount: number;
  sectionCount: number;
}

const httpOf = (query: Query): number => query.httpCount ?? 1;

export function computeStats(page: FieldMapPage): FieldMapStats {
  const queries = Object.values(page.queries);

  const bySource = {
    'backend-agg': 0,
    direct: 0,
    'fe-agg': 0,
    'fe-const': 0,
    'fe-derive': 0,
    'fe-pick': 0,
  } satisfies Record<SourceKind, number>;

  let fieldCount = 0;
  for (const section of page.sections) {
    fieldCount += section.fields.length;
    for (const field of section.fields) bySource[field.source] += 1;
  }

  const sumWhere = (predicate: (q: Query) => boolean): number =>
    queries.filter(predicate).reduce((sum, q) => sum + httpOf(q), 0);

  const perMinute = sumWhere((q) => q.refetch === 'minutely');
  const hourlyOnly = sumWhere((q) => q.refetch === 'hourly');

  return {
    baseHttpCount: sumWhere((q) => !q.conditional),
    bySource,
    conditionalHttpCount: sumWhere((q) => Boolean(q.conditional)),
    fieldCount,
    httpCount: sumWhere(() => true),
    perHour: perMinute * 60 + hourlyOnly,
    perMinute,
    pollingHttpCount: sumWhere((q) => q.refetch !== 'none'),
    pollingQueryCount: queries.filter((q) => q.refetch !== 'none').length,
    queryCount: queries.length,
    sectionCount: page.sections.length,
  };
}
