/**
 * 語系型別。以 zh-TW 為參考語系推導——新增語系時少一個 key 就編譯不過，
 * 不必另外維護一份 key 清單。
 */

import type { zhTW } from './zh-TW.js';

export type Locale = typeof zhTW;
export type UiStrings = Locale['ui'];
export type UiKey = keyof UiStrings;
