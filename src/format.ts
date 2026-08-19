/**
 * 數值 → 人看的字串。
 *
 * 由三個 renderer 共用；瀏覽器端不重寫一份，改由 HTML 內嵌預先算好的標籤，
 * 避免同一套規則在兩處各自演化。
 */

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
export function formatInterval(refetch: Refetch): string {
  if (refetch === 'none') return '不輪詢';

  for (const [unit, label] of [
    [HOUR_MS, '小時'],
    [MINUTE_MS, '分'],
    [SECOND_MS, '秒'],
  ] as const) {
    if (refetch % unit === 0) {
      const n = refetch / unit;
      if (n !== 1) return `每 ${n} ${label}`;
      return label === '小時' ? '每小時' : label === '分' ? '每分鐘' : '每秒';
    }
  }

  return `每 ${refetch} 毫秒`;
}

/** 每小時支數。間隔不整除一小時時會有小數，取一位；整數則不留小數點。 */
export function formatRate(perHour: number): string {
  return Number.isInteger(perHour) ? String(perHour) : perHour.toFixed(1);
}
