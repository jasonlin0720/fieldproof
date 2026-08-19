/**
 * CLI 參數解析。
 *
 * 選項打錯時要當場報錯，而不是靜默忽略後跑出一個「看起來成功」的結果——
 * `--chekc` 打錯字卻照常寫檔，是最容易讓人誤信生成物已驗過的情境。
 */

import { describe, expect, it } from 'vitest';

import { parseArgs } from '../src/cli.js';

describe('parseArgs', () => {
  it('無參數時不指定任何指令', () => {
    expect(parseArgs([])).toEqual({
      check: false,
      command: undefined,
      config: undefined,
      help: false,
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
    expect(() => parseArgs(['build', '--config'])).toThrow(/要接設定檔路徑/);
  });

  it('--config 後面接的是另一個選項時報錯', () => {
    expect(() => parseArgs(['build', '--config', '--check'])).toThrow(/要接設定檔路徑/);
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
    });
  });
});
