/**
 * 語系護欄。
 *
 * 這裡防的不是「翻譯錯了」，而是兩種會靜默累積的腐化：
 *
 * 1. **繞過 locale 硬編介面文字** —— 加語系時才會發現輸出中英夾雜。曾經 index-page.ts
 *    有 10 處、app.js 有 15 處。
 * 2. **死鍵** —— locale 裡定義了、程式碼卻沒用（甚至旁邊自己硬編了一份同義字串）。
 *
 * 兩者都用同一個 stub locale：把每個字串換成 `«path»`。硬編的字會留在輸出裡，
 * 沒被用到的 path 則不會出現。
 */

import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { renderHtml } from '../src/render/html.js';
import { renderIndex } from '../src/render/index-page.js';
import { renderMarkdown } from '../src/render/markdown.js';
import { computeStats } from '../src/stats.js';
import { DEFAULT_LOCALE, getLocale, localeIds } from '../src/locales/index.js';
import { localePaths, makeCoveragePage, makeStubLocale, STUB_MARK } from './helpers.js';

import type { FieldMapPage } from '../src/schema.js';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/** 漢字 + 中日韓標點 + 全形字元。`—` `·` `✓` 這類結構性符號不算，它們不帶語言。 */
const CJK = /[　-〿・一-鿿＀-￯]/;

const STUB_CONTEXT = { command: 'cmd', dataDir: 'data', locale: makeStubLocale() };

/** 去掉 script / style：內嵌的 app.js、app.css 另外驗，不混在渲染輸出裡。 */
const stripCode = (html: string): string =>
  html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

/** 註解裡寫中文是慣例（見 AGENTS.md），要抓的是註解**以外**的字串。 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/(?<=[;)}'"`,])[ \t]*\/\/.*$/gm, '');
}

function firstCjkLine(text: string): string {
  const line = text.split('\n').find((candidate) => CJK.test(candidate));
  return line?.trim() ?? '';
}

/**
 * 掃描對象。排除的只有語系**資料**檔（zh-TW.ts 之流）——它們本來就滿是中文，
 * 但同目錄的 index.ts 會用到 `errors.*`，得留著才不會把它們誤判成死鍵。
 */
function srcFiles(): string[] {
  const isLocaleData = (path: string): boolean =>
    path.includes(`${join('src', 'locales')}${sep}`) &&
    !['index.ts', 'types.ts'].includes(basename(path));

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      return entry.name.endsWith('.ts') && !isLocaleData(path) ? [path] : [];
    });
  return walk(SRC);
}

describe('介面文字一律走 locale', () => {
  const page = makeCoveragePage();
  const stats = computeStats(page);

  it('markdown 換成 stub 語系後不留任何 CJK', () => {
    const rendered = renderMarkdown(page, stats, STUB_CONTEXT);
    expect(firstCjkLine(rendered), '這一行有硬編的介面文字').toBe('');
  });

  it('HTML 換成 stub 語系後不留任何 CJK', () => {
    const rendered = stripCode(renderHtml(page, stats, STUB_CONTEXT));
    expect(firstCjkLine(rendered), '這一行有硬編的介面文字').toBe('');
  });

  it('index 換成 stub 語系後不留任何 CJK', () => {
    const rendered = stripCode(renderIndex([{ page, stats }], STUB_CONTEXT));
    expect(firstCjkLine(rendered), '這一行有硬編的介面文字').toBe('');
  });

  it('app.js 的註解以外沒有 CJK——它拿不到 stub locale，只能直接掃原始碼', () => {
    const code = stripComments(readFileSync(join(SRC, 'assets/app.js'), 'utf8'));
    expect(firstCjkLine(code), '這一行有硬編的介面文字').toBe('');
  });

  it.each(srcFiles().map((path) => [path.slice(SRC.length), path]))(
    '%s 的註解以外沒有 CJK',
    (_name, path) => {
      expect(firstCjkLine(stripComments(readFileSync(path, 'utf8')))).toBe('');
    },
  );
});

describe('locale 沒有死鍵', () => {
  /** 渲染多個變體，讓互斥的分支（有 / 無 route、部分 / 全部 enabledWhen）都跑到。 */
  function renderedMarks(): Set<string> {
    const variants: FieldMapPage[] = [makeCoveragePage(), makeCoveragePage(), makeCoveragePage()];
    delete variants[1]!.route;
    for (const query of Object.values(variants[2]!.queries)) query.enabledWhen = 'same condition';

    const marks = new Set<string>();
    for (const variant of variants) {
      const stats = computeStats(variant);
      const output = [
        renderMarkdown(variant, stats, STUB_CONTEXT),
        stripCode(renderHtml(variant, stats, STUB_CONTEXT)),
        stripCode(renderIndex([{ page: variant, stats }], STUB_CONTEXT)),
      ].join('\n');
      for (const match of output.matchAll(STUB_MARK)) marks.add(match[1]!);
    }
    return marks;
  }

  const RENDERED = renderedMarks();
  const SOURCE = [
    ...srcFiles().map((path) => readFileSync(path, 'utf8')),
    readFileSync(join(SRC, 'assets/app.js'), 'utf8'),
  ].join('\n');

  /** `ui` / `cli` / `errors` / `interval` 不經渲染輸出（`ui` 是整包序列化給瀏覽器的） */
  const REFERENCED = (section: string, key: string): boolean => {
    if (section === 'ui') {
      return new RegExp(`\\b(?:T|ui)\\.${key}\\b|\\bt\\(\\s*'${key}'`).test(SOURCE);
    }
    return new RegExp(`\\b${section}\\.${key}\\b`).test(SOURCE);
  };

  const BY_SOURCE_SCAN = new Set(['ui', 'cli', 'errors', 'interval']);
  /** 結構性欄位，不是給人看的文字。 */
  const STRUCTURAL = new Set(['id', 'htmlLang']);

  it('每個 locale key 都真的被用到', () => {
    const dead = localePaths().filter((path) => {
      if (STRUCTURAL.has(path)) return false;

      const [section = '', ...rest] = path.split('.');
      if (!BY_SOURCE_SCAN.has(section)) return !RENDERED.has(path);

      return !REFERENCED(section, rest.join('.'));
    });

    expect(dead).toEqual([]);
  });

  it('覆蓋用資料真的踩到了每個 enum 值——否則上面那條會誤報死鍵', () => {
    for (const kind of ['direct', 'backend-agg', 'fe-pick', 'fe-agg', 'fe-derive', 'fe-const']) {
      expect(RENDERED, `source.${kind}`).toContain(`source.${kind}`);
    }
    for (const kind of ['card', 'chart', 'table', 'filter', 'form']) {
      expect(RENDERED, `sectionKind.${kind}`).toContain(`sectionKind.${kind}`);
    }
    for (const kind of ['card', 'layout', 'component']) {
      expect(RENDERED, `origin.${kind}`).toContain(`origin.${kind}`);
    }
  });
});

describe('每個註冊語系都完整', () => {
  const page = makeCoveragePage();
  const stats = computeStats(page);

  it.each(localeIds())('%s 的 key 集合與參考語系完全一致', (id) => {
    // 型別已擋掉少 key / 多 key；這裡多擋一層陣列長度（`string[]` 型別擋不住）。
    expect(localePaths(getLocale(id))).toEqual(localePaths(DEFAULT_LOCALE));
  });

  it.each(localeIds().filter((id) => id !== DEFAULT_LOCALE.id))(
    '%s 的輸出不含 CJK——漏翻的字串會當場現形',
    (id) => {
      const ctx = { command: 'cmd', dataDir: 'data', locale: getLocale(id) };

      expect(firstCjkLine(renderMarkdown(page, stats, ctx)), 'markdown 有漏翻').toBe('');
      expect(firstCjkLine(stripCode(renderHtml(page, stats, ctx))), 'HTML 有漏翻').toBe('');
      expect(firstCjkLine(stripCode(renderIndex([{ page, stats }], ctx))), 'index 有漏翻').toBe('');
    },
  );

  it.each(localeIds())('%s 沒有殘留未代入的佔位符', (id) => {
    const ctx = { command: 'cmd', dataDir: 'data', locale: getLocale(id) };
    const rendered = [
      renderMarkdown(page, stats, ctx),
      stripCode(renderHtml(page, stats, ctx)),
      stripCode(renderIndex([{ page, stats }], ctx)),
    ].join('\n');

    expect(rendered.match(/\{[a-zA-Z]\w*(\|[^{}]*)?\}/g)).toBeNull();
  });
});
