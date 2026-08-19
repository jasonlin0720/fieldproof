/**
 * 統計推導。
 *
 * 這些數字是使用者拿去跟 DevTools Network 面板對帳的基準——進頁該出現幾支 request、
 * 每小時會再發幾支。算錯的話對帳會一直對不起來，卻很難察覺是文件錯而不是程式錯。
 */

import { describe, expect, it } from 'vitest';

import { computeStats } from '../src/stats.js';
import { makePage } from './helpers.js';

import type { FieldMapPage } from '../src/schema.js';

/** 在最小資料上疊加查詢，專門測負載推導。 */
function pageWithQueries(queries: FieldMapPage['queries']): FieldMapPage {
  const page = makePage();
  page.queries = queries;
  // 欄位只參照 Q1，改動 queries 時一併把參照收斂掉，避免觸發跨參照驗證。
  page.sections[0]!.fields[0]!.query = undefined;
  return page;
}

describe('computeStats', () => {
  it('數出區塊、欄位、查詢與各 source 的分佈', () => {
    const page = makePage();
    const stats = computeStats(page);

    expect(stats.sectionCount).toBe(1);
    expect(stats.fieldCount).toBe(1);
    expect(stats.queryCount).toBe(2);
    expect(stats.bySource).toEqual({
      'backend-agg': 0,
      direct: 1,
      'fe-agg': 0,
      'fe-const': 0,
      'fe-derive': 0,
      'fe-pick': 0,
    });
  });

  it('httpCount 未填時以 1 計', () => {
    const stats = computeStats(
      pageWithQueries({
        Q1: { endpoint: 'GET /a', sdk: 'a', params: {}, filter: '/a', refetch: 3_600_000 },
      }),
    );
    expect(stats.httpCount).toBe(1);
  });

  it('httpCount 有填時以該值計（併發多支的查詢）', () => {
    const stats = computeStats(
      pageWithQueries({
        Q1: {
          endpoint: 'GET /a',
          sdk: 'a',
          params: {},
          filter: '/a',
          httpCount: 4,
          refetch: 3_600_000,
        },
      }),
    );
    expect(stats.httpCount).toBe(4);
    expect(stats.perHour).toBe(4);
  });

  it('refetch: none 不計入輪詢，但仍計入總支數', () => {
    const stats = computeStats(
      pageWithQueries({
        Q1: { endpoint: 'GET /a', sdk: 'a', params: {}, filter: '/a', refetch: 'none' },
        Q2: { endpoint: 'GET /b', sdk: 'b', params: {}, filter: '/b', refetch: 3_600_000 },
      }),
    );
    expect(stats.queryCount).toBe(2);
    expect(stats.httpCount).toBe(2);
    expect(stats.pollingQueryCount).toBe(1);
    expect(stats.pollingHttpCount).toBe(1);
  });

  it('conditional 的查詢不計入進頁基準，另計一欄', () => {
    const stats = computeStats(
      pageWithQueries({
        Q1: { endpoint: 'GET /a', sdk: 'a', params: {}, filter: '/a', refetch: 3_600_000 },
        Q2: {
          conditional: true,
          endpoint: 'GET /b',
          sdk: 'b',
          params: {},
          filter: '/b',
          httpCount: 2,
          refetch: 3_600_000,
        },
      }),
    );
    expect(stats.baseHttpCount).toBe(1);
    expect(stats.conditionalHttpCount).toBe(2);
    expect(stats.httpCount).toBe(3);
  });

  it('perHour 由各間隔的實際速率加總，而非只算最短間隔那一組', () => {
    const stats = computeStats(
      pageWithQueries({
        Q1: {
          endpoint: 'GET /a',
          sdk: 'a',
          params: {},
          filter: '/a',
          httpCount: 5,
          refetch: 60_000,
        },
        Q2: {
          endpoint: 'GET /b',
          sdk: 'b',
          params: {},
          filter: '/b',
          httpCount: 14,
          refetch: 3_600_000,
        },
      }),
    );
    expect(stats.perHour).toBe(5 * 60 + 14);
  });

  it('byInterval 依間隔由短到長列出各組負載', () => {
    const stats = computeStats(
      pageWithQueries({
        Q1: { endpoint: 'GET /a', sdk: 'a', params: {}, filter: '/a', refetch: 3_600_000 },
        Q2: {
          endpoint: 'GET /b',
          sdk: 'b',
          params: {},
          filter: '/b',
          httpCount: 2,
          refetch: 60_000,
        },
        Q3: { endpoint: 'GET /c', sdk: 'c', params: {}, filter: '/c', refetch: 60_000 },
        Q4: { endpoint: 'GET /d', sdk: 'd', params: {}, filter: '/d', refetch: 'none' },
      }),
    );

    expect(stats.byInterval).toEqual([
      { httpCount: 3, intervalMs: 60_000, perHour: 180, queryCount: 2 },
      { httpCount: 1, intervalMs: 3_600_000, perHour: 1, queryCount: 1 },
    ]);
    expect(stats.perHour).toBe(181);
  });

  it('不輪詢的查詢不出現在 byInterval', () => {
    const stats = computeStats(
      pageWithQueries({
        Q1: { endpoint: 'GET /a', sdk: 'a', params: {}, filter: '/a', refetch: 'none' },
      }),
    );
    expect(stats.byInterval).toEqual([]);
    expect(stats.perHour).toBe(0);
  });

  it('間隔不整除一小時時，perHour 為小數而非被抹掉', () => {
    const stats = computeStats(
      pageWithQueries({
        // 7 分鐘：3_600_000 / 420_000 ≈ 8.571 次
        Q1: { endpoint: 'GET /a', sdk: 'a', params: {}, filter: '/a', refetch: 420_000 },
      }),
    );
    expect(stats.perHour).toBeCloseTo(8.571, 3);
  });
});
