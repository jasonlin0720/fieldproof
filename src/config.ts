/**
 * 設定檔的定義、探尋與解析。
 *
 * 設定為 JSON 而非 `.ts`，是為了免去執行期載入 TypeScript 的相依（jiti / tsx）——
 * 本套件的設定面很小，不值得為它背一個載入器。
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';

import type { Locale } from './locales/index.js';

import { DEFAULT_LOCALE } from './locales/index.js';

export const CONFIG_FILENAME = 'fieldproof.config.json';

export const outputKindSchema = z.enum(['html', 'markdown', 'index']);

export const configSchema = z.object({
  /** 資料檔（`*.json`）所在目錄，相對於設定檔 */
  dataDir: z.string().min(1),
  /** 生成物輸出目錄，相對於設定檔 */
  outDir: z.string().min(1),
  /** 介面語系。v1 僅 `zh-TW` */
  locale: z.string().min(1).default('zh-TW'),
  /**
   * 生成物頁首顯示的重生指令。消費端多半是包過一層的 npm script
   * （如 `pnpm fields`），故可覆寫。
   */
  command: z.string().min(1).default('fieldproof build'),
  /** 要產出哪些格式 */
  outputs: z.array(outputKindSchema).min(1).default(['html', 'markdown', 'index']),
});

export type FieldproofConfig = z.infer<typeof configSchema>;
export type OutputKind = z.infer<typeof outputKindSchema>;

export interface ResolvedConfig extends FieldproofConfig {
  /** 設定檔所在目錄；所有相對路徑以此為基準 */
  rootDir: string;
  dataDirAbs: string;
  outDirAbs: string;
}

/**
 * 渲染生成物時需要知道的「消費端脈絡」。
 *
 * 生成物會告訴讀者「這是生成的、要改請改哪裡、怎麼重生」，這些字串因專案而異，
 * 故由此傳入而非寫死在 renderer 裡。
 */
export interface RenderContext {
  /** 重生指令，顯示於生成物頁首，如 `pnpm fields` */
  command: string;
  /** 資料目錄的顯示路徑，如 `docs/fields/data` */
  dataDir: string;
  locale: Locale;
}

/** 自 `from` 向上探尋設定檔；找不到回傳 undefined。 */
export function findConfig(from: string): string | undefined {
  let dir = resolve(from);

  for (;;) {
    const candidate = resolve(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;

    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * 載入並驗證設定檔。`explicitPath` 為 `--config` 指定值；未指定時自 `cwd` 向上探尋。
 */
export function loadConfig(explicitPath: string | undefined, cwd: string): ResolvedConfig {
  const path = explicitPath ? resolve(cwd, explicitPath) : findConfig(cwd);

  if (path === undefined) {
    throw new Error(DEFAULT_LOCALE.errors.configNotFound(CONFIG_FILENAME, cwd));
  }
  if (!existsSync(path)) {
    throw new Error(DEFAULT_LOCALE.errors.configMissing(path));
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(
      DEFAULT_LOCALE.errors.configNotJson(
        path,
        error instanceof Error ? error.message : String(error),
      ),
    );
  }

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(DEFAULT_LOCALE.errors.configInvalid(path, detail));
  }

  const rootDir = dirname(path);
  const absolutize = (value: string): string =>
    isAbsolute(value) ? value : resolve(rootDir, value);

  return {
    ...parsed.data,
    rootDir,
    dataDirAbs: absolutize(parsed.data.dataDir),
    outDirAbs: absolutize(parsed.data.outDir),
  };
}
