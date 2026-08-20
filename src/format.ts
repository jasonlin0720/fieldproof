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
 * `{name}` 佔位符，另支援 `{name|單數|複數}` 二選一。
 *
 * `ui` 區段的字串會被序列化進瀏覽器，不能放函式（放了會在序列化時靜默消失），所以複數
 * 規則只能寫進字串本身。其餘區段跑在 Node，直接用函式判斷即可，不必走這裡。
 *
 * **刻意不用 `Intl.PluralRules`**：它的輸出綁在 Node 內建的 ICU 版本上，跨版本可能變動，
 * 而本專案的生成物要逐位元組比對（見 AGENTS.md §2.2）。兩形態的規則簡單到不值得為它
 * 賭掉決定性；真的遇到需要三形態以上的語系再說。
 *
 * app.js 有一份同規則的實作。
 */
const SLOT = /\{(\w+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g;

export function fmt(template: string, vars: Record<string, number | string> = {}): string {
  return template.replace(SLOT, (_, key: string, one?: string, other?: string) => {
    if (!Object.hasOwn(vars, key)) return '';
    if (one === undefined || other === undefined) return String(vars[key]);
    return Number(vars[key]) === 1 ? one : other;
  });
}
