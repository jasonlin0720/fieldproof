/**
 * 數值 → 人看的字串。
 *
 * 由三個 renderer 共用；瀏覽器端不重寫一份，改由 HTML 內嵌預先算好的標籤，
 * 避免同一套規則在兩處各自演化。
 */

import type { Locale } from './locales/index.js';
import type { Refetch } from './schema.js';

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

/**
 * 刷新間隔標籤。`60000` → 「每分鐘」、`1800000` → 「每 30 分」、`'none'` → 「不輪詢」。
 *
 * 只描述頻率，不描述對齊方式——「對齊整點」與「掛載後每小時」在負載上等價，
 * 需要說明對齊行為請寫在該查詢的 `note`。
 */
export function formatInterval(refetch: Refetch, locale: Locale): string {
  const { interval } = locale;
  if (refetch === 'none') return interval.none;

  const units = [
    { ms: HOUR_MS, one: interval.hour, many: interval.hours },
    { ms: MINUTE_MS, one: interval.minute, many: interval.minutes },
    { ms: SECOND_MS, one: interval.second, many: interval.seconds },
  ];

  for (const unit of units) {
    if (refetch % unit.ms === 0) {
      const n = refetch / unit.ms;
      return n === 1 ? unit.one : unit.many(n);
    }
  }

  return interval.ms(refetch);
}

/** 每小時支數。間隔不整除一小時時會有小數，取一位；整數則不留小數點。 */
export function formatRate(perHour: number): string {
  return Number.isInteger(perHour) ? String(perHour) : perHour.toFixed(1);
}

/**
 * `{name}` 佔位符代入。`ui` 區段的字串會被序列化進瀏覽器，不能用函式，故以此為替代。
 * app.js 有一份同規則的實作。
 */
export function fmt(template: string, vars: Record<string, number | string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : '',
  );
}
