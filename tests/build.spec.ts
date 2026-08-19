/**
 * 建置流程：輸出選擇、決定性、`--check`。
 *
 * **決定性是 `--check` 的地基**：只要輸出摻進時間戳或任何依環境而異的內容，
 * `--check` 就會在 CI 上無故失敗，整個「生成物與資料同步」的保證隨之瓦解。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { build } from '../src/build.js';
import { makePage, makeWorkspace } from './helpers.js';

describe('build', () => {
  it('依 outputs 設定產出對應檔案', () => {
    const ws = makeWorkspace([makePage()]);
    try {
      build(ws.config);

      expect(existsSync(join(ws.dir, 'demo.html'))).toBe(true);
      expect(existsSync(join(ws.dir, 'demo.md'))).toBe(true);
      expect(existsSync(join(ws.dir, 'index.html'))).toBe(true);
    } finally {
      ws.cleanup();
    }
  });

  it('outputs 只留 markdown 時不產 HTML', () => {
    const ws = makeWorkspace([makePage()]);
    try {
      build({ ...ws.config, outputs: ['markdown'] });

      expect(existsSync(join(ws.dir, 'demo.md'))).toBe(true);
      expect(existsSync(join(ws.dir, 'demo.html'))).toBe(false);
      expect(existsSync(join(ws.dir, 'index.html'))).toBe(false);
    } finally {
      ws.cleanup();
    }
  });

  it('連續兩次建置產出完全相同的內容', () => {
    const ws = makeWorkspace([makePage()]);
    try {
      const first = build(ws.config).outputs.map((out) => out.content);
      const second = build(ws.config).outputs.map((out) => out.content);

      expect(second).toEqual(first);
    } finally {
      ws.cleanup();
    }
  });

  it('check 模式不寫入檔案', () => {
    const ws = makeWorkspace([makePage()]);
    try {
      build(ws.config, { check: true });
      expect(existsSync(join(ws.dir, 'demo.html'))).toBe(false);
    } finally {
      ws.cleanup();
    }
  });

  it('check 模式在生成物尚未存在時，全部視為不同步', () => {
    const ws = makeWorkspace([makePage()]);
    try {
      const result = build(ws.config, { check: true });
      expect(result.stale).toHaveLength(result.outputs.length);
    } finally {
      ws.cleanup();
    }
  });

  it('check 模式在生成物與資料同步時回報零筆', () => {
    const ws = makeWorkspace([makePage()]);
    try {
      build(ws.config);
      expect(build(ws.config, { check: true }).stale).toHaveLength(0);
    } finally {
      ws.cleanup();
    }
  });

  it('check 模式抓出被手改過的生成物，並只指出那一個', () => {
    const ws = makeWorkspace([makePage()]);
    try {
      build(ws.config);
      const tampered = join(ws.dir, 'demo.html');
      writeFileSync(tampered, readFileSync(tampered, 'utf8') + '<!-- 手改 -->', 'utf8');

      const { stale } = build(ws.config, { check: true });

      expect(stale).toHaveLength(1);
      expect(stale[0]?.path).toBe(tampered);
    } finally {
      ws.cleanup();
    }
  });

  it('資料改動後，check 抓出生成物過期', () => {
    const ws = makeWorkspace([makePage()]);
    try {
      build(ws.config);

      const page = makePage();
      page.sections[0]!.fields[0]!.display = '改過的顯示規則';
      writeFileSync(join(ws.config.dataDirAbs, 'demo.json'), JSON.stringify(page, null, 2), 'utf8');

      expect(build(ws.config, { check: true }).stale.length).toBeGreaterThan(0);
    } finally {
      ws.cleanup();
    }
  });

  it('多頁時，index 收錄每一頁', () => {
    const second = makePage();
    second.page = 'another';
    second.title = '第二頁';
    const ws = makeWorkspace([makePage(), second]);

    try {
      build(ws.config);
      const index = readFileSync(join(ws.dir, 'index.html'), 'utf8');

      expect(index).toContain('./demo.html');
      expect(index).toContain('./another.html');
    } finally {
      ws.cleanup();
    }
  });
});
