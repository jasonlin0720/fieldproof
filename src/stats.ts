/**
 * 從頁面資料推導統計。
 *
 * 這些數字（進頁該出現幾支 request、每小時會再發幾支）過去是手寫維護的，改資料時人得
 * 自己重算。改由本檔推導後，加一支查詢或改一個間隔，數字自己會對。
 */

import type { FieldMapPage, Query, SourceKind } from './schema.js';

const HOUR_MS = 3_600_000;

/** 同一刷新間隔的所有查詢加總。 */
export interface IntervalLoad {
  /** 該間隔的 HTTP 支數（已計入各查詢的 httpCount） */
  httpCount: number;
  intervalMs: number;
  /** 該間隔每小時發出的 HTTP 支數 */
  perHour: number;
  queryCount: number;
}

export interface FieldMapStats {
  /** 進頁一定會發的 HTTP 支數（不含條件性請求）——對帳 Network 面板時的基準值 */
  baseHttpCount: number;
  /** 依刷新間隔分組的輪詢負載，間隔由短到長 */
  byInterval: IntervalLoad[];
  /** 各 source 的欄位數，供「後端合計 vs 前端聚合」速查表 */
  bySource: Record<SourceKind, number>;
  /** 條件性請求的 HTTP 支數（卡片隱藏時不會出現） */
  conditionalHttpCount: number;
  fieldCount: number;
  /** 全部查詢的 HTTP 支數（含不參與輪詢者、含條件性） */
  httpCount: number;
  /**
   * 每小時發出的 HTTP 支數 = Σ (一小時 ÷ 間隔) × 支數。
   * 間隔不整除一小時時會有小數，呈現層自行取位。
   */
  perHour: number;
  /** 單次全量刷新的 HTTP 支數（只算會被輪詢的查詢） */
  pollingHttpCount: number;
  /** 參與輪詢的查詢數（refetch 非 'none'） */
  pollingQueryCount: number;
  queryCount: number;
  sectionCount: number;
  /**
   * 標為 `unresolved` 的欄位數——來源沒追出來、該列是推測。
   *
   * 單獨算一個數而不是泛化成 `byFlag`：另外兩個 flag 是註記，這一個說的是**這份宣告
   * 本身還沒查證**，性質不同。它該在概況裡被看見，其他兩個不必。
   */
  unresolvedCount: number;
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
  let unresolvedCount = 0;
  for (const section of page.sections) {
    fieldCount += section.fields.length;
    for (const field of section.fields) {
      bySource[field.source] += 1;
      if (field.flags?.includes('unresolved')) unresolvedCount += 1;
    }
  }

  const sumWhere = (predicate: (q: Query) => boolean): number =>
    queries.filter(predicate).reduce((sum, q) => sum + httpOf(q), 0);

  const byInterval = groupByInterval(queries);

  return {
    baseHttpCount: sumWhere((q) => !q.conditional),
    byInterval,
    bySource,
    conditionalHttpCount: sumWhere((q) => Boolean(q.conditional)),
    fieldCount,
    httpCount: sumWhere(() => true),
    perHour: byInterval.reduce((sum, load) => sum + load.perHour, 0),
    pollingHttpCount: sumWhere((q) => q.refetch !== 'none'),
    pollingQueryCount: queries.filter((q) => q.refetch !== 'none').length,
    queryCount: queries.length,
    sectionCount: page.sections.length,
    unresolvedCount,
  };
}

/** 把輪詢查詢依間隔歸併，並算出各間隔的每小時支數；間隔由短到長。 */
function groupByInterval(queries: Query[]): IntervalLoad[] {
  const buckets = new Map<number, { httpCount: number; queryCount: number }>();

  for (const query of queries) {
    if (query.refetch === 'none') continue;

    const bucket = buckets.get(query.refetch) ?? { httpCount: 0, queryCount: 0 };
    bucket.httpCount += httpOf(query);
    bucket.queryCount += 1;
    buckets.set(query.refetch, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([intervalMs, bucket]) => ({
      ...bucket,
      intervalMs,
      perHour: (HOUR_MS / intervalMs) * bucket.httpCount,
    }));
}
