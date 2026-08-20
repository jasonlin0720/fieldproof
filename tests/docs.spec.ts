/**
 * 文檔之間的相對連結必須指得到東西。
 *
 * 死連結在本專案犯過一次：生成物無條件連向同目錄的 `README.md`，而 `examples/` 自己就
 * 沒有那個檔。現在文檔散在四個地方（README、docs/、skills/、AGENTS.md）互相參照，
 * 靠肉眼是守不住的。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** 專案內所有手寫的 markdown。生成物與相依套件不算。 */
function docs(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return ['node_modules', '.git', 'dist', 'examples'].includes(entry.name) ? [] : walk(path);
      }
      return entry.name.endsWith('.md') ? [path] : [];
    });
  return walk(ROOT).filter((path) => !path.includes('__snapshots__'));
}

/** `[文字](路徑)` 裡指向專案內檔案的那些。錨點與外部連結不算。 */
function localLinks(markdown: string): string[] {
  return [...markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
    .map((match) => match[1] as string)
    .filter((href) => !/^(https?:|mailto:|#)/.test(href))
    .map((href) => href.split('#')[0] as string)
    .filter(Boolean);
}

describe('文檔連結', () => {
  const files = docs();

  it('掃得到所有手寫 markdown', () => {
    const names = files.map((path) => path.slice(ROOT.length));
    expect(names).toContain('README.md');
    expect(names).toContain('AGENTS.md');
    expect(names).toContain('docs/workflow.md');
    expect(names).toContain('skills/fieldproof/SKILL.md');
  });

  it.each(docs().map((path) => [path.slice(ROOT.length), path]))(
    '%s 的相對連結都指得到檔案',
    (_name, path) => {
      const broken = localLinks(readFileSync(path, 'utf8')).filter(
        (href) => !existsSync(resolve(dirname(path), href)),
      );

      expect(broken).toEqual([]);
    },
  );
});

describe('發佈內容', () => {
  /** npm 一律收錄的檔案，不必寫進 `files`。 */
  const ALWAYS_PACKED = ['README.md', 'LICENSE', 'package.json'];

  it('README 連到的東西都會被打包——否則從 node_modules 或 npmjs.com 讀就是死連結', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      files: string[];
    };
    const packed = new Set([...pkg.files, ...ALWAYS_PACKED]);

    const missing = localLinks(readFileSync(join(ROOT, 'README.md'), 'utf8'))
      .map((href) => href.split('/')[0] as string)
      .filter((top) => !packed.has(top))
      // examples/ 是給 GitHub 上的讀者看的示範，刻意不進套件
      .filter((top) => top !== 'examples');

    expect([...new Set(missing)]).toEqual([]);
  });
});
