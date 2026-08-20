/**
 * 資料契約與跨參照驗證。
 *
 * 這些護欄擋的是「資料寫錯但看起來像對的」——例如 field.id 撞名會讓兩個欄位共用
 * 同一份驗收狀態，重複的 Network 篩選字串會讓兩支查詢在 DevTools 裡分不出來。
 * 錯誤訊息必須指得出是哪一頁、哪個區塊、哪個欄位，否則使用者得自己翻 JSON 找。
 */

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { loadPages } from '../src/build.js';
import { makePage, makeWorkspace } from './helpers.js';

import type { FieldMapPage } from '../src/schema.js';

/** 把（可能已被破壞的）資料寫進臨時目錄後載入，回傳拋出的錯誤訊息。 */
function loadWith(mutate: (page: FieldMapPage) => void): string {
  const page = makePage();
  mutate(page);
  const ws = makeWorkspace([page]);
  try {
    loadPages(ws.config.dataDirAbs);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    ws.cleanup();
  }
}

describe('loadPages', () => {
  it('接受一份合法資料', () => {
    const ws = makeWorkspace([makePage()]);
    try {
      const pages = loadPages(ws.config.dataDirAbs);
      expect(pages).toHaveLength(1);
      expect(pages[0]?.page).toBe('demo');
    } finally {
      ws.cleanup();
    }
  });

  it('資料目錄不存在時明確報錯', () => {
    expect(() => loadPages('/no/such/dir')).toThrow(/資料目錄不存在/);
  });

  it('資料目錄沒有任何 .json 時明確報錯', () => {
    const ws = makeWorkspace([]);
    try {
      expect(() => loadPages(ws.config.dataDirAbs)).toThrow(/沒有任何 \.json/);
    } finally {
      ws.cleanup();
    }
  });

  it('缺必要欄位時，錯誤訊息指出欄位路徑', () => {
    const message = loadWith((page) => {
      // @ts-expect-error 蓄意破壞：驗證錯誤訊息品質
      delete page.sections[0].fields[0].how;
    });
    expect(message).toMatch(/sections\.0\.fields\.0\.how/);
  });

  it('page 與檔名不一致時擋下', () => {
    // makeWorkspace 以 page 命名檔案，故先寫入再改 page 才能造出不一致。
    const page = makePage();
    const ws = makeWorkspace([page]);
    try {
      writeFileSync(
        `${ws.config.dataDirAbs}/demo.json`,
        JSON.stringify({ ...page, page: 'other' }),
        'utf8',
      );
      expect(() => loadPages(ws.config.dataDirAbs)).toThrow(/與檔名（demo）不一致/);
    } finally {
      ws.cleanup();
    }
  });

  it('page 非 kebab-case 時擋下', () => {
    expect(loadWith((page) => ((page as { page: string }).page = 'Demo_Page'))).toMatch(
      /kebab-case/,
    );
  });

  it('auditedAt 非 YYYY-MM-DD 時擋下', () => {
    expect(loadWith((page) => ((page as { auditedAt: string }).auditedAt = '2026/08/19'))).toMatch(
      /auditedAt/,
    );
  });

  it('section.key 重複時擋下並指名', () => {
    const message = loadWith((page) => {
      page.sections.push({ ...structuredClone(page.sections[0]!) });
    });
    expect(message).toMatch(/section\.key 重複：sec-one/);
  });

  it('同一 section 內 field.id 重複時擋下並指名', () => {
    const message = loadWith((page) => {
      page.sections[0]!.fields.push(structuredClone(page.sections[0]!.fields[0]!));
    });
    expect(message).toMatch(/sec-one 內 field\.id 重複：f1/);
  });

  it('不同 section 使用相同 field.id 是允許的', () => {
    // 驗收狀態的 key 是 `section.key/field.id`，故 id 只需在 section 內唯一。
    const message = loadWith((page) => {
      const clone = structuredClone(page.sections[0]!);
      clone.key = 'sec-two';
      page.sections.push(clone);
    });
    expect(message).toBe('');
  });

  it('field.query 指向不存在的查詢時擋下', () => {
    const message = loadWith((page) => {
      page.sections[0]!.fields[0]!.query = 'Q99';
    });
    expect(message).toMatch(/sec-one\/f1 參照了不存在的查詢：Q99/);
  });

  it('field.query 為陣列時，每個 id 都會被檢查', () => {
    const message = loadWith((page) => {
      page.sections[0]!.fields[0]!.query = ['Q1', 'Q99'];
    });
    expect(message).toMatch(/不存在的查詢：Q99/);
  });

  it('field 省略 query（純前端生成）是允許的', () => {
    const message = loadWith((page) => {
      delete page.sections[0]!.fields[0]!.query;
    });
    expect(message).toBe('');
  });

  it('省略 filter 是允許的——參數順序不穩定的專案用不了篩選字串', () => {
    const message = loadWith((page) => {
      delete page.queries.Q1!.filter;
    });
    expect(message).toBe('');
  });

  it('兩支查詢都省略 filter 不算重複', () => {
    const message = loadWith((page) => {
      delete page.queries.Q1!.filter;
      delete page.queries.Q2!.filter;
    });
    expect(message).toBe('');
  });

  it('省略 route 是允許的——非 SPA 或無固定路由', () => {
    const message = loadWith((page) => {
      delete page.route;
    });
    expect(message).toBe('');
  });

  it('兩支查詢共用同一個 Network 篩選字串時擋下', () => {
    const message = loadWith((page) => {
      page.queries.Q2!.filter = page.queries.Q1!.filter;
    });
    expect(message).toMatch(/使用了相同的 Network 篩選字串/);
  });

  it('section 至少要有一個 field', () => {
    const message = loadWith((page) => {
      page.sections[0]!.fields = [];
    });
    expect(message).toMatch(/sections\.0\.fields/);
  });
});

describe('conditional 與 enabledWhen', () => {
  /**
   * 兩者不重疊，別把它們合併：`enabledWhen` 說「什麼條件下才會跑」，`conditional` 說
   * 「進頁當下會不會發」。工具讀不懂散文，後者只能由人明示。
   */
  it('conditional 沒有 enabledWhen 時擋下——對帳清單會列出查詢卻說不出它何時才發', () => {
    const message = loadWith((page) => {
      page.queries.Q1!.conditional = true;
    });

    expect(message).toMatch(/Q1/);
    expect(message).toMatch(/enabledWhen/);
  });

  it('conditional 帶著 enabledWhen 是合法的', () => {
    const message = loadWith((page) => {
      page.queries.Q1!.conditional = true;
      page.queries.Q1!.enabledWhen = '卡片已展開';
    });

    expect(message).toBe('');
  });

  it('有 enabledWhen 但不是 conditional 是合法的——條件在驗收時本來就成立', () => {
    // 「已登入」這種條件在驗收當下必然成立，該查詢確實每次進頁都發，
    // 不該被排除在「進頁應出現 N 支」的基準之外。
    const message = loadWith((page) => {
      page.queries.Q1!.enabledWhen = '已登入';
    });

    expect(message).toBe('');
  });
});

describe('resp', () => {
  it('不來自 API 的欄位填 null', () => {
    const message = loadWith((page) => {
      page.sections[0]!.fields[0]!.resp = null;
      delete page.sections[0]!.fields[0]!.query;
    });

    expect(message).toBe('');
  });

  it('填破折號時擋下並指路——它是合法字串，schema 擋不住，會被當成路徑靜默通過', () => {
    const message = loadWith((page) => {
      page.sections[0]!.fields[0]!.resp = '—';
    });

    expect(message).toMatch(/sec-one\/f1/);
    expect(message).toMatch(/null/);
  });

  it('省略 resp 仍然擋下——「漏填」與「確認過沒有」必須分得開', () => {
    const message = loadWith((page) => {
      delete (page.sections[0]!.fields[0] as { resp?: unknown }).resp;
    });

    expect(message).toMatch(/resp/);
  });
});

