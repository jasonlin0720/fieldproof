/**
 * 載入 → 驗證 → 渲染 → 寫入（或 `--check` 比對）。
 *
 * 輸出必須為確定性：不得帶入產生時間戳、隨機值或依環境而異的內容。
 * `--check` 的正確性完全依賴此性質。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { RenderContext, ResolvedConfig } from './config.js';

import { GENERATED_MARKER } from './config.js';
import type { Locale } from './locales/index.js';

import { renderHtml } from './render/html.js';
import { renderIndex } from './render/index-page.js';
import { renderMarkdown } from './render/markdown.js';
import { type FieldMapPage, fieldMapPageSchema } from './schema.js';
import { DEFAULT_LOCALE, getLocale } from './locales/index.js';
import { computeStats, type FieldMapStats } from './stats.js';

export interface BuildOutput {
  content: string;
  path: string;
}

export interface BuildResult {
  entries: Array<{ page: FieldMapPage; stats: FieldMapStats }>;
  /** outDir 裡由本工具產出、但已無對應資料檔的檔案 */
  orphans: string[];
  outputs: BuildOutput[];
  /** `--check` 模式下與磁碟不同步的生成物；非 check 模式為空陣列 */
  stale: BuildOutput[];
}

/** 讀取並驗證資料目錄下的所有頁面；驗證失敗即中止並指出頁 / 區塊 / 欄位路徑。 */
export function loadPages(dataDir: string, locale: Locale = DEFAULT_LOCALE): FieldMapPage[] {
  if (!existsSync(dataDir)) {
    throw new Error(locale.errors.dataDirMissing(dataDir));
  }

  const files = readdirSync(dataDir)
    .filter((name) => name.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    throw new Error(locale.errors.noDataFiles(dataDir));
  }

  return files.map((file) => {
    const raw: unknown = JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
    const parsed = fieldMapPageSchema.safeParse(raw);

    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n');
      throw new Error(locale.errors.invalidPage(file, detail));
    }

    const expectedPage = basename(file, '.json');
    if (parsed.data.page !== expectedPage) {
      throw new Error(locale.errors.pageNameMismatch(file, parsed.data.page, expectedPage));
    }

    assertUniqueIds(file, parsed.data, locale);
    assertQueryRefs(file, parsed.data, locale);
    assertUniqueFilters(file, parsed.data, locale);

    return parsed.data;
  });
}

/** section.key 與 section 內的 field.id 必須唯一——它們是驗收狀態的穩定識別。 */
function assertUniqueIds(file: string, page: FieldMapPage, locale: Locale): void {
  const sectionKeys = new Set<string>();

  for (const section of page.sections) {
    if (sectionKeys.has(section.key)) {
      throw new Error(locale.errors.duplicateSectionKey(file, section.key));
    }
    sectionKeys.add(section.key);

    const fieldIds = new Set<string>();
    for (const field of section.fields) {
      if (fieldIds.has(field.id)) {
        throw new Error(locale.errors.duplicateFieldId(file, section.key, field.id));
      }
      fieldIds.add(field.id);
    }
  }
}

/**
 * Network 篩選字串必須互不相同——重複代表兩支查詢無法在 DevTools 面板中分辨，
 * 那這個欄位就失去意義。真的無法唯一者（如只差日期的兩支），請讓其中一支帶更精確的
 * 片段，另一支以 `filterNote` 說明會一併匹配到誰、怎麼排除。
 */
function assertUniqueFilters(file: string, page: FieldMapPage, locale: Locale): void {
  const seen = new Map<string, string>();
  for (const [id, query] of Object.entries(page.queries)) {
    if (query.filter === undefined) continue;
    const owner = seen.get(query.filter);
    if (owner !== undefined) {
      throw new Error(locale.errors.duplicateFilter(file, id, owner, query.filter));
    }
    seen.set(query.filter, id);
  }
}

/** field.query 參照的 query id 必須存在於 queries。 */
function assertQueryRefs(file: string, page: FieldMapPage, locale: Locale): void {
  for (const section of page.sections) {
    for (const field of section.fields) {
      if (field.query === undefined) continue;
      const ids = Array.isArray(field.query) ? field.query : [field.query];
      for (const id of ids) {
        if (!(id in page.queries)) {
          throw new Error(locale.errors.unknownQueryRef(file, section.key, field.id, id));
        }
      }
    }
  }
}

/**
 * outDir 裡看起來是本工具產出、但這次不會再產出的檔案。
 *
 * 資料檔刪掉之後，舊的生成物會原地留著，而且 `--check` 不會抱怨——有人開了那份 HTML
 * 就會對著一個已經不存在的頁面逐欄打勾。
 *
 * 只認帶有 `GENERATED_MARKER` 的檔案：使用者放在同一個 outDir 的文件不該被我們認領。
 */
function findOrphans(outDirAbs: string, outputs: BuildOutput[]): string[] {
  if (!existsSync(outDirAbs)) return [];

  const expected = new Set(outputs.map((out) => out.path));
  return readdirSync(outDirAbs)
    .filter((name) => name.endsWith('.html') || name.endsWith('.md'))
    .map((name) => join(outDirAbs, name))
    .filter((path) => !expected.has(path))
    .filter((path) => readFileSync(path, 'utf8').includes(GENERATED_MARKER))
    .sort();
}

/** 比對將產生的內容與磁碟現有檔案是否一致。 */
function isStale(path: string, content: string): boolean {
  if (!existsSync(path)) return true;
  return readFileSync(path, 'utf8') !== content;
}

/**
 * 執行一次建置。`check` 為真時只比對不寫入，結果放在 `BuildResult.stale`。
 */
export function build(config: ResolvedConfig, options: { check?: boolean } = {}): BuildResult {
  const locale = getLocale(config.locale);
  const pages = loadPages(config.dataDirAbs, locale);
  const entries = pages.map((page) => ({ page, stats: computeStats(page) }));

  const context: RenderContext = {
    command: config.command,
    dataDir: config.dataDir,
    locale,
    namespace: config.namespace,
  };
  const wants = (kind: (typeof config.outputs)[number]): boolean => config.outputs.includes(kind);

  const outputs: BuildOutput[] = [];
  for (const { page, stats } of entries) {
    if (wants('markdown')) {
      outputs.push({
        content: renderMarkdown(page, stats, context),
        path: join(config.outDirAbs, `${page.page}.md`),
      });
    }
    if (wants('html')) {
      outputs.push({
        content: renderHtml(page, stats, context),
        path: join(config.outDirAbs, `${page.page}.html`),
      });
    }
  }
  if (wants('index')) {
    outputs.push({
      content: renderIndex(entries, context),
      path: join(config.outDirAbs, 'index.html'),
    });
  }

  const orphans = findOrphans(config.outDirAbs, outputs);

  if (options.check) {
    return {
      entries,
      orphans,
      outputs,
      stale: outputs.filter((out) => isStale(out.path, out.content)),
    };
  }

  // 輸出目錄多半尚未存在（消費端第一次跑、或 outDir 被 .gitignore 掉）。
  mkdirSync(config.outDirAbs, { recursive: true });
  for (const out of outputs) writeFileSync(out.path, out.content, 'utf8');

  // 刻意不自動刪除：那些檔案多半已經 commit 進 git，該不該刪是使用者的決定。
  return { entries, orphans, outputs, stale: [] };
}
