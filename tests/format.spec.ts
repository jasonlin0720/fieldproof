/**
 * 間隔與速率的呈現規則。
 *
 * 這些字串會出現在生成物頁首與查詢表格，是使用者判斷「這支多久刷一次」的唯一依據。
 */

import { describe, expect, it } from 'vitest';

import { fmt, formatInterval, formatRate } from '../src/format.js';
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

describe('fmt 的複數形態', () => {
  it('n 為 1 取單數', () => {
    expect(fmt('{n} {n|section|sections}', { n: 1 })).toBe('1 section');
  });

  it('n 非 1 取複數——不規則變化也行，因為兩形態都寫在字串裡', () => {
    expect(fmt('{n} {n|query|queries}', { n: 3 })).toBe('3 queries');
    expect(fmt('{n} {n|query|queries}', { n: 0 })).toBe('0 queries');
  });

  it('同一變數可同時作為數值與形態選擇', () => {
    expect(fmt('{n} {n|item|items}', { n: 2 })).toBe('2 items');
  });

  it('未提供的變數整段代為空字串，不留下形態語法', () => {
    expect(fmt('[{n|item|items}]')).toBe('[]');
  });

  it('空的形態是合法的——中文之類無複數變化的語系用得到', () => {
    expect(fmt('{n} 個{n||}', { n: 5 })).toBe('5 個');
  });
});
