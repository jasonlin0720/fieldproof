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
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { FieldMapPage } from './schema.js';

export interface DriftReport {
  /** 盤點日之後被 commit 動過的來源檔，寫法與資料檔裡宣告的一致 */
  changed: string[];
  /**
   * 宣告了、但在磁碟上找不到的來源檔。
   *
   * 兩種可能，都需要人回頭看：檔案被改名 / 刪除（該重新盤點），或 `sources` 的路徑基準
   * 寫錯了（它以設定檔所在目錄為基準）。**找不到的檔案比對不了**，所以這些頁面即使程式碼
   * 改過也不會有變動提示——沒有提示不等於沒有變動，這一點必須說出來。
   */
  missing: string[];
  /** 頁名（＝資料檔檔名） */
  page: string;
  /**
   * 比較基準：資料檔最後一次 commit（短 sha + 日期）。
   *
   * **不用 `auditedAt`。** 它只有「日」的精度，而 `git log --since` 比的是時間戳，於是
   * 同一天稍早的 commit 也會被算進去——而「改程式碼 → 更新欄位對照」是標準流程，
   * 結果就是**剛做完盤點的那天必定誤報**。誤報會訓練人忽略提示，那比沒有提示更糟。
   *
   * 改用 commit 範圍 `<資料檔最後 commit>..HEAD` 之後兩邊都由 git 定義，沒有精度落差：
   * 來源檔與資料檔在同一個 commit 裡一起改的情形也正確地不報。
   *
   * 資料檔尚未 commit（新頁面）時沒有基準，不做變動比對。
   */
  since?: { date: string; sha: string };
}

/** 比對用的正規化：分隔符統一、去掉開頭的 `./`。 */
const normalize = (path: string): string => path.replace(/\\/g, '/').replace(/^\.\//, '');

/**
 * 問 git 哪些 `sources` 在 `since` 之後被 commit 動過。
 *
 * 缺 git（沒裝、不在 repo 裡、repo 還沒有任何 commit）時回傳空陣列而非拋錯：
 * 這是可選提示，環境不具備時應該安靜地沒有提示，而不是讓建置失敗。
 */
/** 跑 git，失敗（沒裝、不在 repo、沒有 commit）時回傳 undefined 而非拋錯。 */
function git(args: string[], rootDir: string): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
}

/** 資料檔最後一次 commit 的短 sha 與日期，作為比較基準。尚未 commit 時為 undefined。 */
function baselineOf(
  dataFile: string,
  rootDir: string,
): { date: string; full: string; sha: string } | undefined {
  const output = git(['log', '--format=%H %h %ad', '--date=short', '-1', '--', dataFile], rootDir);
  const [full, sha, date] = (output ?? '').trim().split(' ');

  return full && sha && date ? { date, full, sha } : undefined;
}

/**
 * `<基準 commit>..HEAD` 之間，哪些宣告的來源被改過。
 *
 * 目錄型的 `sources` 要用前綴比對：`--name-only` 回報的是目錄**底下的檔案路徑**，
 * 與宣告的目錄字串永遠不相等，逐字比對會讓整個目錄的變動靜靜地漏掉。
 */
function changedSince(sha: string, sources: string[], rootDir: string): string[] {
  // 空的 pathspec 會讓 git 回報整個 repo 的變動——那不是這裡要問的問題。
  if (sources.length === 0) return [];

  const output = git(
    ['log', `${sha}..HEAD`, '--name-only', '--relative', '--format=', '--', ...sources],
    rootDir,
  );
  if (output === undefined) return [];

  const changed = output
    .split('\n')
    .map((line) => normalize(line.trim()))
    .filter(Boolean);

  const isDirectory = (source: string): boolean => {
    try {
      return statSync(resolve(rootDir, source)).isDirectory();
    } catch {
      return false;
    }
  };

  return sources.filter((source) => {
    const norm = normalize(source);
    if (!isDirectory(source)) return changed.includes(norm);

    const prefix = norm.endsWith('/') ? norm : `${norm}/`;
    return changed.some((path) => path.startsWith(prefix));
  });
}

/**
 * 逐頁檢查來源檔是否在盤點日之後動過；沒有任何來源檔動過的頁面不會出現在結果裡。
 *
 * `sources` 的相對路徑以 `rootDir`（設定檔所在目錄）為基準，與 `dataDir` / `outDir` 一致。
 */
export function findDrift(
  pages: FieldMapPage[],
  rootDir: string,
  dataDirAbs: string,
): DriftReport[] {
  return pages.flatMap((page) => {
    const missing = page.sources.filter((source) => !existsSync(resolve(rootDir, source)));
    const present = page.sources.filter((source) => !missing.includes(source));

    // 檔名恆等於 page（loadPages 驗證過），故資料檔路徑推導得出來。
    const baseline = baselineOf(join(dataDirAbs, `${page.page}.json`), rootDir);
    const changed = baseline ? changedSince(baseline.full, present, rootDir) : [];

    if (changed.length === 0 && missing.length === 0) return [];
    const since = baseline && { date: baseline.date, sha: baseline.sha };
    return [{ changed, missing, page: page.page, ...(since ? { since } : {}) }];
  });
}
