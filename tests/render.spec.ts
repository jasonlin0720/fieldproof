/**
 * 渲染層的特徵測試（characterization tests）。
 *
 * 這裡刻意用 snapshot 鎖住**逐字輸出**——與一般「不要測實作細節」的原則相反，因為在本
 * 專案裡逐字輸出就是契約：`--check` 比對的是位元組，消費端把生成物 commit 進 git。
 * 任何輸出變動都應該是有意的，snapshot 的作用就是逼它現形。
 *
 * 另外補上針對性斷言，說明「為什麼這段輸出該長這樣」——snapshot 本身不會解釋意圖。
 */

import { describe, expect, it } from 'vitest';

import { renderHtml } from '../src/render/html.js';
import { renderIndex } from '../src/render/index-page.js';
import { renderMarkdown } from '../src/render/markdown.js';
import { computeStats } from '../src/stats.js';
import { makePage, TEST_CONTEXT } from './helpers.js';

import type { FieldMapPage } from '../src/schema.js';

/** 盡量涵蓋各種可選欄位，讓 snapshot 有代表性。 */
function richPage(): FieldMapPage {
  const page = makePage();

  page.queries.Q1!.note = '查詢註記';
  page.queries.Q1!.filterNote = '會一併匹配到 Q2';
  page.queries.Q1!.enabledWhen = 'id 為有效數字';
  page.queries.Q2!.origin = 'layout';
  page.queries.Q2!.conditional = true;
  page.queries.Q2!.httpCount = 3;

  page.sections[0]!.meta = { 位置: '左上' };
  page.sections[0]!.emptyRule = '無資料時整區塊收合';
  page.sections[0]!.fields[0]!.checks = [{ given: 'response = null', expect: '—' }];
  page.sections[0]!.fields[0]!.flags = ['exception', 'fragile'];
  page.sections[0]!.fields[0]!.note = '欄位註記';

  page.sections.push({
    key: 'sec-two',
    kind: 'table',
    title: '區塊二',
    fields: [
      {
        id: 'no-query',
        label: '純前端欄位',
        resp: '—',
        source: 'fe-const',
        how: '前端硬編',
        display: '固定文字',
      },
      {
        id: 'multi-query',
        label: '跨查詢欄位',
        query: ['Q1', 'Q2'],
        resp: 'items[].x',
        source: 'fe-derive',
        how: '以 Q1 的 id 對 Q2 查表',
        display: '查無對應時顯示原始 id',
      },
    ],
  });

  return page;
}

const PAGE = richPage();
const STATS = computeStats(PAGE);

describe('renderMarkdown', () => {
  it('逐字輸出維持不變', () => {
    expect(renderMarkdown(PAGE, STATS, TEST_CONTEXT)).toMatchSnapshot();
  });

  it('頁首標明重生指令與資料檔位置，避免有人手改生成物', () => {
    const md = renderMarkdown(PAGE, STATS, TEST_CONTEXT);
    expect(md).toContain('`pnpm demo`');
    expect(md).toContain('docs/demo/data/demo.json');
    expect(md).toContain('請勿手改');
  });

  it('無查詢的欄位在查詢欄顯示破折號，而非空白或 undefined', () => {
    const md = renderMarkdown(PAGE, STATS, TEST_CONTEXT);
    expect(md).toMatch(/\| 純前端欄位 \| — \|/);
  });

  it('跨查詢的欄位並列所有查詢 id', () => {
    expect(renderMarkdown(PAGE, STATS, TEST_CONTEXT)).toContain('Q1 ＋ Q2');
  });
});

describe('renderHtml', () => {
  it('逐字輸出維持不變', () => {
    expect(renderHtml(PAGE, STATS, TEST_CONTEXT)).toMatchSnapshot();
  });

  it('資料以 JSON 內嵌，且可被解析回來', () => {
    const html = renderHtml(PAGE, STATS, TEST_CONTEXT);
    const match = /<script type="application\/json" id="fieldproof-data">(.*?)<\/script>/s.exec(
      html,
    );

    expect(match).not.toBeNull();
    const payload = JSON.parse(match![1]!.replaceAll('\\u003c', '<')) as {
      sections: Array<{ fields: Array<{ dataHash: string; displayHash: string }> }>;
    };
    expect(payload.sections[0]?.fields[0]?.dataHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('不含任何外部資源請求——整份要能離線雙擊開啟', () => {
    const html = renderHtml(PAGE, STATS, TEST_CONTEXT);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href="(?!data:)/);
  });

  it('改 display 只換 displayHash，取值側的驗收結論不受影響', () => {
    const before = extractHashes(renderHtml(PAGE, STATS, TEST_CONTEXT));

    const changed = richPage();
    changed.sections[0]!.fields[0]!.display = '換一種顯示規則';
    const after = extractHashes(renderHtml(changed, computeStats(changed), TEST_CONTEXT));

    expect(after.dataHash).toBe(before.dataHash);
    expect(after.displayHash).not.toBe(before.displayHash);
  });

  it('改 how 只換 dataHash，顯示側的驗收結論不受影響', () => {
    const before = extractHashes(renderHtml(PAGE, STATS, TEST_CONTEXT));

    const changed = richPage();
    changed.sections[0]!.fields[0]!.how = '換一種取值方式';
    const after = extractHashes(renderHtml(changed, computeStats(changed), TEST_CONTEXT));

    expect(after.dataHash).not.toBe(before.dataHash);
    expect(after.displayHash).toBe(before.displayHash);
  });

  it('改 label / note 兩側指紋都不變——不該讓既有標記失效', () => {
    const before = extractHashes(renderHtml(PAGE, STATS, TEST_CONTEXT));

    const changed = richPage();
    changed.sections[0]!.fields[0]!.label = '換個標籤';
    changed.sections[0]!.fields[0]!.note = '換個註記';
    const after = extractHashes(renderHtml(changed, computeStats(changed), TEST_CONTEXT));

    expect(after).toEqual(before);
  });
});

describe('renderIndex', () => {
  it('逐字輸出維持不變', () => {
    expect(renderIndex([{ page: PAGE, stats: STATS }], TEST_CONTEXT)).toMatchSnapshot();
  });

  it('每頁都連到自己的 HTML 與 markdown', () => {
    const html = renderIndex([{ page: PAGE, stats: STATS }], TEST_CONTEXT);
    expect(html).toContain('href="./demo.html"');
    expect(html).toContain('href="./demo.md"');
  });
});

function extractHashes(html: string): { dataHash: string; displayHash: string } {
  const match = /<script type="application\/json" id="fieldproof-data">(.*?)<\/script>/s.exec(html);
  const payload = JSON.parse(match![1]!.replaceAll('\\u003c', '<')) as {
    sections: Array<{ fields: Array<{ dataHash: string; displayHash: string }> }>;
  };
  const field = payload.sections[0]!.fields[0]!;
  return { dataHash: field.dataHash, displayHash: field.displayHash };
}
