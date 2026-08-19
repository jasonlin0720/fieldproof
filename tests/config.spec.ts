/**
 * 設定檔探尋、預設值與路徑解析。
 *
 * 路徑一律以「設定檔所在目錄」為基準而非 cwd——否則從子目錄執行 CLI 會寫到別的地方去。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_FILENAME, findConfig, loadConfig } from '../src/config.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fieldproof-cfg-'));
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

function writeConfig(dir: string, content: unknown): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, CONFIG_FILENAME);
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content), 'utf8');
  return path;
}

describe('findConfig', () => {
  it('自起點向上探尋', () => {
    const path = writeConfig(root, { dataDir: 'data', outDir: 'out' });
    const deep = join(root, 'a', 'b', 'c');
    mkdirSync(deep, { recursive: true });

    expect(findConfig(deep)).toBe(path);
  });

  it('找不到時回傳 undefined 而非拋錯', () => {
    expect(findConfig(root)).toBeUndefined();
  });
});

describe('loadConfig', () => {
  it('未指定且探尋不到時，錯誤訊息告知怎麼補救', () => {
    expect(() => loadConfig(undefined, root)).toThrow(/--config/);
  });

  it('填入 locale / outputs / command 的預設值', () => {
    writeConfig(root, { dataDir: 'data', outDir: 'out' });
    const config = loadConfig(undefined, root);

    expect(config.locale).toBe('zh-TW');
    expect(config.outputs).toEqual(['html', 'markdown', 'index']);
    expect(config.command).toBe('fieldproof build');
  });

  it('相對路徑以設定檔所在目錄為基準，而非 cwd', () => {
    writeConfig(root, { dataDir: 'docs/data', outDir: 'docs' });
    const deep = join(root, 'nested', 'deeper');
    mkdirSync(deep, { recursive: true });

    const config = loadConfig(undefined, deep);

    expect(config.rootDir).toBe(root);
    expect(config.dataDirAbs).toBe(join(root, 'docs/data'));
    expect(config.outDirAbs).toBe(join(root, 'docs'));
  });

  it('絕對路徑原樣保留', () => {
    writeConfig(root, { dataDir: '/abs/data', outDir: '/abs/out' });
    const config = loadConfig(undefined, root);

    expect(config.dataDirAbs).toBe('/abs/data');
    expect(config.outDirAbs).toBe('/abs/out');
  });

  it('--config 指定的路徑優先於探尋', () => {
    writeConfig(root, { dataDir: 'from-search', outDir: '.' });
    const other = join(root, 'other');
    const explicit = writeConfig(other, { dataDir: 'from-explicit', outDir: '.' });

    expect(loadConfig(explicit, root).dataDir).toBe('from-explicit');
  });

  it('非法 JSON 時指出是哪個檔', () => {
    writeConfig(root, '{ not json');
    expect(() => loadConfig(undefined, root)).toThrow(/不是合法的 JSON/);
  });

  it('缺必要欄位時指出欄位名', () => {
    writeConfig(root, { outDir: 'out' });
    expect(() => loadConfig(undefined, root)).toThrow(/dataDir/);
  });

  it('outputs 給了未知格式時擋下', () => {
    writeConfig(root, { dataDir: 'data', outDir: 'out', outputs: ['pdf'] });
    expect(() => loadConfig(undefined, root)).toThrow(/outputs/);
  });

  it('outputs 為空陣列時擋下', () => {
    writeConfig(root, { dataDir: 'data', outDir: 'out', outputs: [] });
    expect(() => loadConfig(undefined, root)).toThrow(/outputs/);
  });
});
