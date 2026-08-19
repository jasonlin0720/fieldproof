/**
 * 語系契約。
 *
 * `ui` 會被 JSON.stringify 進 HTML 供瀏覽器讀取——一旦有人在裡面放函式，
 * 序列化時會靜默消失，介面就會出現空字串而非報錯。這條必須測。
 */

import { describe, expect, it } from 'vitest';

import { fmt } from '../src/format.js';
import { DEFAULT_LOCALE, getLocale, localeIds } from '../src/locales/index.js';

describe('語系註冊表', () => {
  it('可依 id 取得語系', () => {
    expect(getLocale('zh-TW').id).toBe('zh-TW');
  });

  it('未知語系時列出可用選項', () => {
    expect(() => getLocale('kl-KL')).toThrow(/kl-KL/);
    expect(() => getLocale('kl-KL')).toThrow(/zh-TW/);
  });

  it('預設語系在註冊表內', () => {
    expect(localeIds()).toContain(DEFAULT_LOCALE.id);
  });
});

describe('ui 區段', () => {
  it('全部為字串——放進函式會在序列化時靜默消失', () => {
    for (const [key, value] of Object.entries(DEFAULT_LOCALE.ui)) {
      expect(typeof value, `ui.${key}`).toBe('string');
    }
  });

  it('JSON 往返後內容不變', () => {
    const roundTripped: unknown = JSON.parse(JSON.stringify(DEFAULT_LOCALE.ui));
    expect(roundTripped).toEqual(DEFAULT_LOCALE.ui);
  });

  it('沒有空字串——漏填的 key 會讓介面出現空白而非報錯', () => {
    const empty = Object.entries(DEFAULT_LOCALE.ui)
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });
});

describe('fmt', () => {
  it('代入具名佔位符', () => {
    expect(fmt('{a} 與 {b}', { a: '甲', b: '乙' })).toBe('甲 與 乙');
  });

  it('數字自動轉字串', () => {
    expect(fmt('共 {n} 支', { n: 3 })).toBe('共 3 支');
  });

  it('同一佔位符可重複出現', () => {
    expect(fmt('{x}-{x}', { x: 'a' })).toBe('a-a');
  });

  it('未提供的佔位符代為空字串，不留下 {name} 字樣', () => {
    expect(fmt('{a}{b}', { a: '甲' })).toBe('甲');
  });

  it('值為空字串時不會被當成未提供', () => {
    expect(fmt('[{a}]', { a: '' })).toBe('[]');
  });

  it('沒有佔位符時原樣回傳', () => {
    expect(fmt('純文字')).toBe('純文字');
  });
});
