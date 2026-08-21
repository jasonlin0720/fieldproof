/**
 * CLI 參數解析。
 *
 * 選項打錯時要當場報錯，而不是靜默忽略後跑出一個「看起來成功」的結果——
 * `--chekc` 打錯字卻照常寫檔，是最容易讓人誤信生成物已驗過的情境。
 */

import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { isEntryPoint, parseArgs } from '../src/cli.js';

describe('parseArgs', () => {
  it('無參數時不指定任何指令', () => {
    expect(parseArgs([])).toEqual({
      check: false,
      command: undefined,
      config: undefined,
      help: false,
      install: false,
      to: undefined,
      version: false,
    });
  });

  it('認得 build 指令', () => {
    expect(parseArgs(['build']).command).toBe('build');
  });

  it('認得 --check', () => {
    expect(parseArgs(['build', '--check']).check).toBe(true);
  });

  it('認得 --config 及其值', () => {
    expect(parseArgs(['build', '--config', 'a/b.json']).config).toBe('a/b.json');
  });

  it('--config 後面沒接值時報錯', () => {
    expect(() => parseArgs(['build', '--config'])).toThrow(/--config 後面要接一個值/);
  });

  it('--config 後面接的是另一個選項時報錯', () => {
    expect(() => parseArgs(['build', '--config', '--check'])).toThrow(/--config 後面要接一個值/);
  });

  it('認得 -h 與 --help', () => {
    expect(parseArgs(['-h']).help).toBe(true);
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('未知選項報錯而非靜默忽略', () => {
    expect(() => parseArgs(['build', '--chekc'])).toThrow(/未知選項：--chekc/);
  });

  it('多餘的位置參數報錯', () => {
    expect(() => parseArgs(['build', 'extra'])).toThrow(/多餘的參數：extra/);
  });

  it('選項順序不影響結果', () => {
    expect(parseArgs(['--check', '--config', 'x.json', 'build'])).toEqual({
      check: true,
      command: 'build',
      config: 'x.json',
      help: false,
      install: false,
      to: undefined,
      version: false,
    });
  });

  it('認得 skill 指令與其選項', () => {
    expect(parseArgs(['skill', '--install', '--to', 'a/b'])).toEqual({
      check: false,
      command: 'skill',
      config: undefined,
      help: false,
      install: true,
      to: 'a/b',
      version: false,
    });
  });

  it('--to 後面沒接值時報錯', () => {
    expect(() => parseArgs(['skill', '--to'])).toThrow(/--to 後面要接一個值/);
  });

  it('選項存在但不屬於這個指令時報錯，而非靜默忽略', () => {
    // `build --install` 靜默通過的話，使用者會以為 skill 裝好了，其實只是重跑了建置。
    expect(() => parseArgs(['build', '--install'])).toThrow(/--install 不是 build 的選項/);
    expect(() => parseArgs(['skill', '--check'])).toThrow(/--check 不是 skill 的選項/);
  });

  it('未指定指令時不套用選項歸屬檢查——單獨 --help 仍可用', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });
});

describe('isEntryPoint', () => {
  /**
   * 消費端跑的是 `node_modules/.bin/fieldproof`——一個指向 `dist/cli.js` 的 symlink。
   * 不解析 symlink 就比不出相等，`main()` 不會跑，CLI 靜默退出 0 什麼都不做。
   * 這在單元測試裡看不出來（測試是直接 import 的），只有實際打包安裝才會現形。
   */
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((dir) => rmSync(dir, { force: true, recursive: true })));

  /** `real` 為真實路徑（macOS 的 /tmp 自己就是 symlink，正式環境的 import.meta.url 亦為真實路徑）。 */
  function realAndLink(): { link: string; real: string } {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'fieldproof-bin-')));
    dirs.push(dir);
    const real = join(dir, 'cli.js');
    const link = join(dir, 'bin-fieldproof');
    writeFileSync(real, '', 'utf8');
    symlinkSync(real, link);
    return { link, real };
  }

  it('真實路徑相符時為真', () => {
    const { real } = realAndLink();
    expect(isEntryPoint(pathToFileURL(real).href, real)).toBe(true);
  });

  it('透過 symlink 執行時仍為真——這是消費端唯一的執行方式', () => {
    const { link, real } = realAndLink();
    expect(isEntryPoint(pathToFileURL(real).href, link)).toBe(true);
  });

  it('被 import 而非執行時為假', () => {
    const { real } = realAndLink();
    expect(isEntryPoint(pathToFileURL(real).href, join(dirname(real), 'other.js'))).toBe(false);
  });

  it('沒有進入點時為假', () => {
    expect(isEntryPoint('file:///x.js', undefined)).toBe(false);
  });

  it('進入點不存在時為假，而不是拋錯', () => {
    expect(isEntryPoint('file:///x.js', '/nope/does-not-exist')).toBe(false);
  });
});

describe('--version', () => {
  it('認得 -v 與 --version', () => {
    expect(parseArgs(['-v']).version).toBe(true);
    expect(parseArgs(['--version']).version).toBe(true);
  });

  it('不需要指令——問版本的人還沒開始用', () => {
    expect(parseArgs(['--version']).command).toBeUndefined();
  });

  it('與 --help 一樣不受指令歸屬檢查限制', () => {
    expect(() => parseArgs(['build', '--version'])).not.toThrow();
  });
});
