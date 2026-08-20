/**
 * 漂移提示：`sources` 自 `auditedAt` 之後有沒有被 commit 動過。
 *
 * **這不是漂移偵測**——本工具刻意不判斷 JSON 是否還符合現況程式碼（AGENTS.md §2.5），
 * 那需要靜態分析或 LLM，會把分析工具拖進所有使用者的相依樹。
 *
 * 但雙指紋只擋得住一個方向：「JSON 改了、舊的勾還在」。反方向的「程式碼改了、JSON 還在」
 * 過去沒有任何東西會提醒——`auditedAt` 與 `sources` 記在資料檔裡，卻沒有任何時機會去讀它。
 * 於是 JSON 靜默腐化，而驗收的人照著一份過期的宣告逐欄打勾，比沒有工具更糟。
 *
 * 這裡只補上成本最低的那一半：問 git「這些檔案在那天之後被 commit 動過嗎」。它不需要任何
 * 新相依（消費端必然有 git——生成物要 commit、`--check` 要在 CI 跑），不回答內容對錯，
 * 只回答「該不該回頭重新盤點」。判斷仍然是人的。
 *
 * **輸出不受影響**：這是 CLI 的提示，不進生成物，故 `--check` 的決定性不變（§2.2）。
 */

import { execFileSync } from 'node:child_process';

import type { FieldMapPage } from './schema.js';

export interface DriftReport {
  /** 頁名（＝資料檔檔名） */
  page: string;
  /** 盤點日之後被 commit 動過的來源檔，寫法與資料檔裡宣告的一致 */
  sources: string[];
  /** 該頁的 `auditedAt` */
  since: string;
}

/** 比對用的正規化：分隔符統一、去掉開頭的 `./`。 */
const normalize = (path: string): string => path.replace(/\\/g, '/').replace(/^\.\//, '');

/**
 * 問 git 哪些 `sources` 在 `since` 之後被 commit 動過。
 *
 * 缺 git（沒裝、不在 repo 裡、repo 還沒有任何 commit）時回傳空陣列而非拋錯：
 * 這是可選提示，環境不具備時應該安靜地沒有提示，而不是讓建置失敗。
 */
function changedSince(since: string, sources: string[], rootDir: string): string[] {
  let output: string;
  try {
    output = execFileSync(
      'git',
      ['log', `--since=${since}`, '--name-only', '--relative', '--format=', '--', ...sources],
      { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    return [];
  }

  const changed = new Set(
    output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map(normalize),
  );

  return sources.filter((source) => changed.has(normalize(source)));
}

/**
 * 逐頁檢查來源檔是否在盤點日之後動過；沒有任何來源檔動過的頁面不會出現在結果裡。
 *
 * `sources` 的相對路徑以 `rootDir`（設定檔所在目錄）為基準，與 `dataDir` / `outDir` 一致。
 */
export function findDrift(pages: FieldMapPage[], rootDir: string): DriftReport[] {
  return pages.flatMap((page) => {
    const sources = changedSince(page.auditedAt, page.sources, rootDir);
    return sources.length === 0 ? [] : [{ page: page.page, sources, since: page.auditedAt }];
  });
}
