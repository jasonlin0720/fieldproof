/**
 * 把隨套件發佈的 skill 落地到消費端。
 *
 * Claude Code 只從 `.claude/skills/`、`~/.claude/skills/` 與 plugin 探尋 skill，不會看
 * `node_modules/`，所以套件裡的檔案得先複製出來。
 *
 * 用複製而非 symlink：symlink 在 Windows 需要額外權限，且 npm 升級套件時 symlink 會
 * 靜默指向新內容——複製至少讓 `git status` 把變更顯示出來，使用者能決定要不要收。
 */

import { cpSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Locale } from './locales/index.js';

/**
 * 套件內的 skill 來源。`skills/` 位於套件根目錄，故 `src/skill.ts` 與 `dist/skill.js`
 * 用同一行相對路徑就都解析得到，不必像 `assets/` 那樣在 build 時複製一份。
 */
export const SKILL_SOURCE = fileURLToPath(new URL('../skills/fieldproof/', import.meta.url));

/** 預設安裝位置：專案層級的 skill 目錄。 */
export const DEFAULT_SKILL_DEST = join('.claude', 'skills', 'fieldproof');

export interface SkillPaths {
  dest: string;
  source: string;
}

/** 解析安裝目的地；`to` 未指定時用專案層級的預設位置。 */
export function resolveSkillDest(cwd: string, to: string | undefined): string {
  return resolve(cwd, to ?? DEFAULT_SKILL_DEST);
}

/** 複製 skill 到目的地，覆蓋既有內容（升級套件後重跑即為更新）。 */
export function installSkill(cwd: string, to: string | undefined, locale: Locale): SkillPaths {
  if (!existsSync(SKILL_SOURCE)) {
    throw new Error(locale.errors.skillSourceMissing(SKILL_SOURCE));
  }

  const dest = resolveSkillDest(cwd, to);
  cpSync(SKILL_SOURCE, dest, { recursive: true });
  return { dest, source: SKILL_SOURCE };
}
