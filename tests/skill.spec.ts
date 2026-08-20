/**
 * 隨套件發佈的 skill。
 *
 * 這個 skill 教 agent 怎麼寫 fieldproof 的資料檔，所以**它自己不能對 schema 漂移**——
 * 那正是本專案存在的理由，套用在自己身上。schema 新增一個欄位或 enum 值而參考文件
 * 沒跟上，agent 就會產出不合法或缺漏的 JSON，而且沒有任何東西會抱怨。
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  fieldMapPageSchema,
  fieldSchema,
  flagSchema,
  originSchema,
  querySchema,
  sectionKindSchema,
  sectionSchema,
  sourceKindSchema,
} from '../src/schema.js';
import { configSchema } from '../src/config.js';
import { DEFAULT_LOCALE } from '../src/locales/index.js';
import { DEFAULT_SKILL_DEST, installSkill, resolveSkillDest, SKILL_SOURCE } from '../src/skill.js';

const SKILL_MD = readFileSync(join(SKILL_SOURCE, 'SKILL.md'), 'utf8');
const FORMAT_DOC = readFileSync(join(SKILL_SOURCE, 'references/data-format.md'), 'utf8');

const dirs: string[] = [];
const workspace = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'fieldproof-skill-'));
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((dir) => rmSync(dir, { force: true, recursive: true })));

describe('SKILL.md', () => {
  it('有 name 與 description——description 是唯一的觸發機制', () => {
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(SKILL_MD)?.[1];

    expect(frontmatter).toBeDefined();
    expect(frontmatter).toMatch(/^name: fieldproof$/m);
    expect(frontmatter).toMatch(/^description: /m);
  });

  it('指向存在的參考檔案——死連結等於 agent 讀不到格式', () => {
    for (const match of SKILL_MD.matchAll(/`(references\/[\w./-]+)`/g)) {
      const path = match[1] as string;
      expect(existsSync(join(SKILL_SOURCE, path)), path).toBe(true);
    }
  });

  it('教的是套件真的有的指令', () => {
    expect(SKILL_MD).toContain('npx fieldproof build');
  });
});

describe('格式參考不得與 schema 漂移', () => {
  it.each([
    ['config', configSchema],
    ['page', fieldMapPageSchema],
    ['query', querySchema],
    ['section', sectionSchema],
    ['field', fieldSchema],
  ])('%s 的每個欄位都寫進了參考文件', (_name, schema) => {
    const missing = Object.keys(schema.shape).filter((key) => !FORMAT_DOC.includes(`\`${key}\``));
    expect(missing).toEqual([]);
  });

  it.each([
    ['source', sourceKindSchema],
    ['flags', flagSchema],
    ['section.kind', sectionKindSchema],
    ['query.origin', originSchema],
  ])('%s 的每個 enum 值都寫進了參考文件', (_name, schema) => {
    const missing = schema.options.filter((value) => !FORMAT_DOC.includes(`\`${value}\``));
    expect(missing).toEqual([]);
  });

  it('參考文件裡的範例本身是合法資料——範例錯了，抄它的 agent 也會錯', () => {
    const example = /```json\n([\s\S]*?)```/.exec(FORMAT_DOC)?.[1];
    expect(example).toBeDefined();

    const parsed = fieldMapPageSchema.safeParse(JSON.parse(example as string));
    expect(parsed.error?.issues ?? []).toEqual([]);
  });
});

describe('installSkill', () => {
  it('預設裝到專案層級的 .claude/skills/fieldproof', () => {
    const cwd = workspace();
    const { dest } = installSkill(cwd, undefined, DEFAULT_LOCALE);

    expect(dest).toBe(join(cwd, DEFAULT_SKILL_DEST));
    expect(existsSync(join(dest, 'SKILL.md'))).toBe(true);
    expect(existsSync(join(dest, 'references/data-format.md'))).toBe(true);
  });

  it('--to 可指定別的位置，含使用者層級的 ~/.claude/skills', () => {
    const cwd = workspace();
    const { dest } = installSkill(cwd, 'custom/place', DEFAULT_LOCALE);

    expect(dest).toBe(join(cwd, 'custom', 'place'));
    expect(existsSync(join(dest, 'SKILL.md'))).toBe(true);
  });

  it('重跑會覆蓋既有內容——升級套件後重跑即為更新', () => {
    const cwd = workspace();
    const { dest } = installSkill(cwd, undefined, DEFAULT_LOCALE);
    writeFileSync(join(dest, 'SKILL.md'), 'stale', 'utf8');

    installSkill(cwd, undefined, DEFAULT_LOCALE);

    expect(readFileSync(join(dest, 'SKILL.md'), 'utf8')).toBe(SKILL_MD);
  });

  it('resolveSkillDest 不寫檔——`fieldproof skill` 未加 --install 時只是預告', () => {
    const cwd = workspace();
    const dest = resolveSkillDest(cwd, undefined);

    expect(dest).toBe(join(cwd, DEFAULT_SKILL_DEST));
    expect(existsSync(dest)).toBe(false);
  });
});
