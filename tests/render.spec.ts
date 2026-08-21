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
        resp: null,
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

describe('佔位符代入', () => {
  /** 去掉 script / style，只留真正會被讀到的標記與文字。 */
  const stripCode = (html: string): string =>
    html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

  it('HTML 沒有殘留未代入的 {name}——打錯變數名會在此現形', () => {
    const rendered = stripCode(renderHtml(PAGE, STATS, TEST_CONTEXT));
    expect(rendered.match(/\{[a-zA-Z]\w*(\|[^{}]*)?\}/g)).toBeNull();
  });

  it('index 沒有殘留未代入的 {name}', () => {
    const rendered = stripCode(renderIndex([{ page: PAGE, stats: STATS }], TEST_CONTEXT));
    expect(rendered.match(/\{[a-zA-Z]\w*(\|[^{}]*)?\}/g)).toBeNull();
  });

  it('markdown 沒有殘留未代入的 {name}', () => {
    const md = renderMarkdown(PAGE, STATS, TEST_CONTEXT);
    expect(md.match(/\{[a-zA-Z]\w*(\|[^{}]*)?\}/g)).toBeNull();
  });
});

describe('enabledWhen', () => {
  it('只有部分查詢帶條件時逐支列出，不謊報為共通條件', () => {
    // richPage 只有 Q1 帶 enabledWhen，Q2 沒有。
    const md = renderMarkdown(PAGE, STATS, TEST_CONTEXT);

    expect(md).not.toContain('全部查詢的');
    expect(md).toContain('> - **Q1**：id 為有效數字');
  });

  it('每支查詢都帶且條件相同時，才收斂成一句', () => {
    const page = richPage();
    page.queries.Q2!.enabledWhen = page.queries.Q1!.enabledWhen;
    const md = renderMarkdown(page, computeStats(page), TEST_CONTEXT);

    expect(md).toContain('> 全部查詢的 `enabledWhen`：id 為有效數字');
  });

  it('多支共用同一條件時併成一行，不逐支重複', () => {
    const page = richPage();
    page.queries.Q2!.enabledWhen = page.queries.Q1!.enabledWhen;
    page.queries.Q3 = {
      endpoint: 'GET /api/c',
      sdk: 'getC',
      params: {},
      filter: '/api/c',
      refetch: 'none',
    };
    const md = renderMarkdown(page, computeStats(page), TEST_CONTEXT);

    // Q3 沒有 enabledWhen，故不能收斂成「全部查詢的」；Q1 Q2 共用則應併行。
    expect(md).not.toContain('全部查詢的');
    expect(md).toContain('> - **Q1、Q2**：id 為有效數字');
  });

  it('每支都帶但條件不同時，仍逐支列出', () => {
    const page = richPage();
    page.queries.Q2!.enabledWhen = '另一個條件';
    const md = renderMarkdown(page, computeStats(page), TEST_CONTEXT);

    expect(md).not.toContain('全部查詢的');
    expect(md).toContain('> - **Q1**：id 為有效數字');
    expect(md).toContain('> - **Q2**：另一個條件');
  });

  it('沒有任何查詢帶條件時整段省略', () => {
    const page = richPage();
    delete page.queries.Q1!.enabledWhen;
    const md = renderMarkdown(page, computeStats(page), TEST_CONTEXT);

    expect(md).not.toContain('enabledWhen');
  });

  it('沒有任何查詢帶 note 時，啟用條件仍會印出', () => {
    // 修正前 enabledWhen 巢狀在「查詢註記」區塊內，沒有 note 就整段消失。
    const page = richPage();
    delete page.queries.Q1!.note;
    delete page.queries.Q1!.filterNote;
    const md = renderMarkdown(page, computeStats(page), TEST_CONTEXT);

    expect(md).not.toContain('**查詢註記**');
    expect(md).toContain('id 為有效數字');
  });
});

describe('可選欄位的退場', () => {
  it('省略 route 時，markdown 標題不留空括號', () => {
    const page = richPage();
    delete page.route;
    const md = renderMarkdown(page, computeStats(page), TEST_CONTEXT);

    // 首行是生成標記，標題在其後。
    expect(md.split('\n').find((line) => line.startsWith('#'))).toBe('# 示範頁 欄位對照');
  });

  it('省略 route 時，HTML 工具列不留孤立的分隔點', () => {
    const page = richPage();
    delete page.route;
    const html = renderHtml(page, computeStats(page), TEST_CONTEXT);

    expect(html).not.toContain('<code></code>');
  });

  it('省略 route 時，index 的路由欄顯示破折號', () => {
    const page = richPage();
    delete page.route;
    const html = renderIndex([{ page, stats: computeStats(page) }], TEST_CONTEXT);

    expect(html).toContain('<span class="resp">—</span>');
  });

  it('省略 filter 時，markdown 的篩選欄顯示破折號而非空的反引號', () => {
    const page = richPage();
    delete page.queries.Q1!.filter;
    const md = renderMarkdown(page, computeStats(page), TEST_CONTEXT);

    expect(md).not.toContain('``');
    expect(md).toMatch(/\| \*\*Q1\*\* \| `GET \/api\/a` \| — \|/);
  });
});

describe('生成物不假設消費端有哪些檔案', () => {
  /**
   * 曾經無條件連向同目錄的 README.md（原專案的跨頁通用規則）。消費端沒放那個檔
   * 就是死連結——連 examples/ 自己都沒有。通用規則改由 skill 承載，不由生成物指路。
   */
  it('markdown 不含指向 README.md 的連結', () => {
    expect(renderMarkdown(PAGE, STATS, TEST_CONTEXT)).not.toContain('README.md');
  });

  it('index 不含指向 README.md 的連結', () => {
    expect(renderIndex([{ page: PAGE, stats: STATS }], TEST_CONTEXT)).not.toContain('README.md');
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

describe('推測欄位的能見度', () => {
  /**
   * markdown 的讀者是 LLM 與 code review。一頁裡有幾格是猜的，是 review 該最先看到的
   * 事——修正前它只是欄位名後面一個 ❓，要讀完每一列才發現。
   */
  function withUnresolved(): FieldMapPage {
    const page = richPage();
    page.sections[0]!.fields[0]!.flags = ['unresolved'];
    return page;
  }

  it('概況指出有幾個欄位的來源未追出', () => {
    const page = withUnresolved();
    const md = renderMarkdown(page, computeStats(page), TEST_CONTEXT);

    expect(md).toMatch(/## 概況[\s\S]*1 個欄位的來源未追出[\s\S]*?\n---/);
  });

  it('沒有推測欄位時整行省略，不留「0 個」', () => {
    const md = renderMarkdown(PAGE, STATS, TEST_CONTEXT);

    expect(md).not.toContain('來源未追出');
  });
});
