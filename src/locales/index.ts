/** 語系註冊表。新增語系時在此加一筆即可——型別由參考語系 zh-TW 推導，少一個 key 就編譯不過。 */

import type { Locale } from './types.js';

import { en } from './en.js';
import { zhTW } from './zh-TW.js';

export type { Locale, UiKey, UiStrings } from './types.js';

/** 找不到設定語系時的退路，也是 config 讀取失敗前（尚不知語系）所用。 */
export const DEFAULT_LOCALE: Locale = zhTW;

const LOCALES: Record<string, Locale> = { [zhTW.id]: zhTW, [en.id]: en };

export function getLocale(id: string): Locale {
  const locale = LOCALES[id];
  if (locale === undefined) {
    throw new Error(DEFAULT_LOCALE.errors.unknownLocale(id, Object.keys(LOCALES)));
  }
  return locale;
}

export function localeIds(): string[] {
  return Object.keys(LOCALES);
}
