/**
 * 間隔與速率的呈現規則。
 *
 * 這些字串會出現在生成物頁首與查詢表格，是使用者判斷「這支多久刷一次」的唯一依據。
 */

import { describe, expect, it } from 'vitest';

import { formatInterval, formatRate } from '../src/format.js';
import { DEFAULT_LOCALE as L } from '../src/locales/index.js';

describe('formatInterval', () => {
  it('不輪詢', () => {
    expect(formatInterval('none', L)).toBe('不輪詢');
  });

  it('整小時、整分、整秒各用自己的單位', () => {
    expect(formatInterval(3_600_000, L)).toBe('每小時');
    expect(formatInterval(60_000, L)).toBe('每分鐘');
    expect(formatInterval(1_000, L)).toBe('每秒');
  });

  it('倍數帶上數量', () => {
    expect(formatInterval(7_200_000, L)).toBe('每 2 小時');
    expect(formatInterval(1_800_000, L)).toBe('每 30 分');
    expect(formatInterval(5_000, L)).toBe('每 5 秒');
  });

  it('選用得下的最大單位——1800000 是 30 分而非 1800 秒', () => {
    expect(formatInterval(1_800_000, L)).toBe('每 30 分');
    expect(formatInterval(90_000, L)).toBe('每 90 秒');
  });

  it('無法整除到秒時退回毫秒', () => {
    expect(formatInterval(1_500, L)).toBe('每 1500 毫秒');
  });
});

describe('formatRate', () => {
  it('整數不留小數點', () => {
    expect(formatRate(314)).toBe('314');
    expect(formatRate(0)).toBe('0');
  });

  it('小數取一位', () => {
    expect(formatRate(8.5714)).toBe('8.6');
  });
});
