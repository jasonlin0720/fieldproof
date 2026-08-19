/**
 * 載入 → 驗證 → 渲染 → 寫入（或 `--check` 比對）。
 *
 * 輸出必須為確定性：不得帶入產生時間戳、隨機值或依環境而異的內容。
 * `--check` 的正確性完全依賴此性質。
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { RenderContext, ResolvedConfig } from './config.js';

import { renderHtml } from './render/html.js';
import { renderIndex } from './render/index-page.js';
import { renderMarkdown } from './render/markdown.js';
import { type FieldMapPage, fieldMapPageSchema } from './schema.js';
import { computeStats, type FieldMapStats } from './stats.js';

export interface BuildOutput {
  content: string;
  path: string;
}

export interface BuildResult {
  entries: Array<{ page: FieldMapPage; stats: FieldMapStats }>;
  outputs: BuildOutput[];
  /** `--check` 模式下與磁碟不同步的生成物；非 check 模式為空陣列 */
  stale: BuildOutput[];
}

/** 讀取並驗證資料目錄下的所有頁面；驗證失敗即中止並指出頁 / 區塊 / 欄位路徑。 */
export function loadPages(dataDir: string): FieldMapPage[] {
  if (!existsSync(dataDir)) {
    throw new Error(`資料目錄不存在：${dataDir}`);
  }

  const files = readdirSync(dataDir)
    .filter((name) => name.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    throw new Error(`${dataDir} 下沒有任何 .json 資料檔`);
  }

  return files.map((file) => {
    const raw: unknown = JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
    const parsed = fieldMapPageSchema.safeParse(raw);

    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n');
      throw new Error(`${file} 資料格式不符：\n${detail}`);
    }

    const expectedPage = basename(file, '.json');
    if (parsed.data.page !== expectedPage) {
      throw new Error(`${file} 的 page（${parsed.data.page}）與檔名（${expectedPage}）不一致`);
    }

    assertUniqueIds(file, parsed.data);
    assertQueryRefs(file, parsed.data);
    assertUniqueFilters(file, parsed.data);

    return parsed.data;
  });
}

/** section.key 與 section 內的 field.id 必須唯一——它們是驗收狀態的穩定識別。 */
function assertUniqueIds(file: string, page: FieldMapPage): void {
  const sectionKeys = new Set<string>();

  for (const section of page.sections) {
    if (sectionKeys.has(section.key)) {
      throw new Error(`${file} 的 section.key 重複：${section.key}`);
    }
    sectionKeys.add(section.key);

    const fieldIds = new Set<string>();
    for (const field of section.fields) {
      if (fieldIds.has(field.id)) {
        throw new Error(`${file} 的 ${section.key} 內 field.id 重複：${field.id}`);
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
function assertUniqueFilters(file: string, page: FieldMapPage): void {
  const seen = new Map<string, string>();
  for (const [id, query] of Object.entries(page.queries)) {
    const owner = seen.get(query.filter);
    if (owner !== undefined) {
      throw new Error(
        `${file} 的 ${id} 與 ${owner} 使用了相同的 Network 篩選字串「${query.filter}」——` +
          '兩支查詢在 DevTools 面板中將無法分辨，請改用更精確的片段。',
      );
    }
    seen.set(query.filter, id);
  }
}

/** field.query 參照的 query id 必須存在於 queries。 */
function assertQueryRefs(file: string, page: FieldMapPage): void {
  for (const section of page.sections) {
    for (const field of section.fields) {
      if (field.query === undefined) continue;
      const ids = Array.isArray(field.query) ? field.query : [field.query];
      for (const id of ids) {
        if (!(id in page.queries)) {
          throw new Error(`${file} 的 ${section.key}/${field.id} 參照了不存在的查詢：${id}`);
        }
      }
    }
  }
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
  const pages = loadPages(config.dataDirAbs);
  const entries = pages.map((page) => ({ page, stats: computeStats(page) }));

  const context: RenderContext = {
    command: config.command,
    dataDir: config.dataDir,
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

  if (options.check) {
    return {
      entries,
      outputs,
      stale: outputs.filter((out) => isStale(out.path, out.content)),
    };
  }

  for (const out of outputs) writeFileSync(out.path, out.content, 'utf8');
  return { entries, outputs, stale: [] };
}
