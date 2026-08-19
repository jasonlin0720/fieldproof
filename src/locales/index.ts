/** 語系註冊表。v1 僅 zh-TW；新增語系時在此加一筆即可。 */

import type { Locale } from './types.js';

import { zhTW } from './zh-TW.js';

export type { Locale, UiKey, UiStrings } from './types.js';

/** 找不到設定語系時的退路，也是 config 讀取失敗前（尚不知語系）所用。 */
export const DEFAULT_LOCALE: Locale = zhTW;

const LOCALES: Record<string, Locale> = { [zhTW.id]: zhTW };

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
