/**
 * 驗收介面的行為契約。
 *
 * `app.js` 是生成物裡唯一會跑的程式，也是驗收工作真正發生的地方，但長期只有靜態掃描。
 * 這裡跑的是 `renderHtml()` 的真實輸出，測的是使用者實際會遇到的行為。
 *
 * 共同主題是**局部更新**：整個 tbody 重畫會抹掉使用者當下的狀態——輸入焦點、
 * 文字選取、捲動位置。`patchRow()` 為此存在，展開 / 收合也必須遵守同一條。
 */

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE } from '../src/locales/index.js';
import { makeCoveragePage } from './helpers.js';
import { openReviewUi, type ReviewUi } from './review-ui.js';

const UI = DEFAULT_LOCALE.ui;
const FIRST = 'sec-card/f-direct';
const SECOND = 'sec-card/f-backend';

let ui: ReviewUi | undefined;
const open = (...args: Parameters<typeof openReviewUi>): ReviewUi => (ui = openReviewUi(...args));
afterEach(async () => {
  await ui?.close();
  ui = undefined;
});

describe('展開明細', () => {
  it('▸ 鈕可展開與收合', () => {
    const app = open();

    app.expandOf(FIRST).click();
    expect(app.detailOf(FIRST)).not.toBeNull();

    app.expandOf(FIRST).click();
    expect(app.detailOf(FIRST)).toBeNull();
  });

  it('點列身不展開——那會踩掉使用者正在做的文字選取', () => {
    // 拖曳選取與雙擊選字的 mousedown / mouseup 都落在同一列，瀏覽器照樣發 click。
    // 只要列身可點，選取手勢就會被當成展開意圖。
    const app = open();
    const label = app.rowOf(FIRST).querySelector('.field-label');

    (label as unknown as { click: () => void }).click();

    expect(app.detailOf(FIRST)).toBeNull();
  });

  it('展開一列不會重建其他列——重畫整表會抹掉已選取的文字', () => {
    const app = open();
    const other = app.rowOf(SECOND);

    app.expandOf(FIRST).click();

    expect(other.isConnected, 'SECOND 這一列被整表重畫換掉了').toBe(true);
    expect(app.detailOf(FIRST)).not.toBeNull();
  });

  it('展開一列不會讓正在輸入的備註失焦', () => {
    const app = open();
    const note = app.noteInputOf(SECOND) as unknown as { focus: () => void };
    note.focus();

    app.expandOf(FIRST).click();

    expect(app.doc.activeElement).toBe(note);
  });

  it('收合同樣是局部的', () => {
    const app = open();
    app.expandOf(FIRST).click();
    const other = app.rowOf(SECOND);

    app.expandOf(FIRST).click();

    expect(other.isConnected).toBe(true);
    expect(app.detailOf(FIRST)).toBeNull();
  });
});

describe('標記', () => {
  it('標記一列不會重建其他列', () => {
    const app = open();
    const other = app.rowOf(SECOND);

    app.markOf(FIRST, 'data', 'ok').click();

    expect(other.isConnected).toBe(true);
  });

  it('標記時正在輸入的備註不失焦', () => {
    const app = open();
    const note = app.noteInputOf(SECOND) as unknown as { focus: () => void };
    note.focus();

    app.markOf(FIRST, 'data', 'ok').click();

    expect(app.doc.activeElement).toBe(note);
  });

  it('再點一次同一顆會取消標記', () => {
    const app = open();
    const ok = app.markOf(FIRST, 'data', 'ok');

    ok.click();
    expect(ok.getAttribute('aria-pressed')).toBe('true');

    ok.click();
    expect(ok.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('定義變更後的失效', () => {
  /**
   * 標籤上的文字。取圖示之後的整段——「定義已變更」是「顯示定義已變更」的子字串，
   * 用 toContain 分辨不出兩者。
   */
  const staleLabel = (app: ReviewUi): string =>
    (app.rowOf(FIRST).querySelector('.stale-tag')?.textContent ?? '')
      .trim()
      .split(/\s+/)
      .slice(1)
      .join(' ');

  /** 標記兩側後取出 localStorage，模擬「上次驗收過」。 */
  function verifiedStorage(): { key: string; value: string } {
    const app = openReviewUi();
    app.markOf(FIRST, 'data', 'ok').click();
    app.markOf(FIRST, 'display', 'ok').click();
    const value = app.win.localStorage.getItem(app.storageKey) ?? '';
    void app.close();
    return { key: app.storageKey, value };
  }

  it('只改 display 時，資料側的結論仍然有效', () => {
    const { key, value } = verifiedStorage();
    const changed = makeCoveragePage();
    changed.sections[0]!.fields[0]!.display = 'a different display rule';

    const app = open(changed, { storage: { [key]: value } });
    const row = app.rowOf(FIRST);

    expect(row.classList.contains('row--stale'), '整列應標為已變更').toBe(true);
    const staleSides = [...row.querySelectorAll('.marks')].map((cell) =>
      cell.classList.contains('marks--stale'),
    );
    expect(staleSides, '只有顯示側該失效').toEqual([false, true]);
  });

  it('只改 how 時，顯示側的結論仍然有效', () => {
    const { key, value } = verifiedStorage();
    const changed = makeCoveragePage();
    changed.sections[0]!.fields[0]!.how = 'a different way of getting it';

    const app = open(changed, { storage: { [key]: value } });
    const staleSides = [...app.rowOf(FIRST).querySelectorAll('.marks')].map((cell) =>
      cell.classList.contains('marks--stale'),
    );

    expect(staleSides, '只有資料側該失效').toEqual([true, false]);
  });

  it('重標其中一側後，失效標籤的文字要跟著改', () => {
    // 兩側都失效時標籤寫「定義已變更」；只重標資料側之後，剩下的只有顯示側，
    // 標籤必須改成「顯示定義已變更」。patchRow 曾經只會移除標籤，不會更新文字。
    const { key, value } = verifiedStorage();
    const changed = makeCoveragePage();
    changed.sections[0]!.fields[0]!.how = 'a different way';
    changed.sections[0]!.fields[0]!.display = 'a different display rule';

    const app = open(changed, { storage: { [key]: value } });
    expect(staleLabel(app)).toBe(UI.staleBoth);

    app.markOf(FIRST, 'data', 'ok').click();

    expect(staleLabel(app)).toBe(UI.staleDisplay);
  });

  it('兩側都重標後，失效標籤整個移除', () => {
    const { key, value } = verifiedStorage();
    const changed = makeCoveragePage();
    changed.sections[0]!.fields[0]!.how = 'a different way';
    changed.sections[0]!.fields[0]!.display = 'a different display rule';

    const app = open(changed, { storage: { [key]: value } });
    app.markOf(FIRST, 'data', 'ok').click();
    app.markOf(FIRST, 'display', 'ok').click();

    expect(app.rowOf(FIRST).querySelector('.stale-tag')).toBeNull();
    expect(app.rowOf(FIRST).classList.contains('row--stale')).toBe(false);
  });

  it('只改 label 時兩側都不失效——不該讓既有標記白費', () => {
    const { key, value } = verifiedStorage();
    const changed = makeCoveragePage();
    changed.sections[0]!.fields[0]!.label = 'A new label';

    const app = open(changed, { storage: { [key]: value } });

    expect(app.rowOf(FIRST).classList.contains('row--stale')).toBe(false);
  });
});

describe('驗收狀態的存放位置', () => {
  it('未設定 namespace 時只以頁名區分', () => {
    const app = open();
    app.markOf(FIRST, 'data', 'ok').click();

    expect(app.win.localStorage.getItem('fieldproof:v1:coverage')).not.toBeNull();
  });

  it('設定 namespace 後與別的專案隔開——`file://` 下所有頁面共用同一個 origin', () => {
    const page = makeCoveragePage();
    const app = (ui = openReviewUi(page, { context: { namespace: 'acme' } }));
    app.markOf(FIRST, 'data', 'ok').click();

    expect(app.win.localStorage.getItem('fieldproof:v1:acme:coverage')).not.toBeNull();
    expect(app.win.localStorage.getItem('fieldproof:v1:coverage')).toBeNull();
  });
});

describe('flag 篩選器', () => {
  /**
   * 追不出來源的欄位一定會有，schema 也允許它誠實說出來（`unresolved`）。但六十欄的表裡，
   * 一個角落的圖示等於沒有——要能把「哪幾格是推測的」直接篩出來，那個誠實才有作用。
   */
  it('篩出帶指定 flag 的欄位', () => {
    const app = open();
    const box = app.doc.querySelector('#filter-flag input[value="unresolved"]');

    (box as unknown as { click: () => void }).click();

    expect(app.rowIds()).toEqual(['sec-table/f-derive']);
  });

  it('頁面沒有任何 flag 時不出現這個篩選器——空面板是死 UI', () => {
    const page = makeCoveragePage();
    for (const section of page.sections) {
      for (const field of section.fields) delete field.flags;
    }

    const app = open(page);

    expect(app.doc.querySelector('#filter-flag')).toBeNull();
  });
});

describe('展開的觸發區', () => {
  /**
   * 只有第一欄那顆 ▸ 能展開時，每展開一列就要把手移到最左邊一次。
   * 帶 tooltip 的 chip / tag 是安全的補充觸發區——它們是標籤而不是要複製的內文，
   * 而 `cursor: help` 已經表明「這裡有更多資訊」，展開明細正是那些資訊。
   */
  it.each([
    ['.qchip', '查詢 chip'],
    ['.field-flags', 'flag 圖示'],
    ['.checks-tag', '檢查點標籤'],
  ])('點 %s（%s）可展開', (selector) => {
    const app = open();
    const el = app.rowOf(FIRST).querySelector(selector);

    expect(el, `${selector} 不在 FIRST 這一列上`).not.toBeNull();
    (el as unknown as { click: () => void }).click();

    expect(app.detailOf(FIRST)).not.toBeNull();
  });

  it('由 chip 展開同樣不重建其他列', () => {
    const app = open();
    const other = app.rowOf(SECOND);

    (app.rowOf(FIRST).querySelector('.qchip') as unknown as { click: () => void }).click();

    expect(other.isConnected, 'SECOND 這一列被整表重畫換掉了').toBe(true);
    expect(app.detailOf(FIRST)).not.toBeNull();
  });

  it('欄位名稱仍然不可點——那正是最常被複製的那段文字', () => {
    const app = open();

    (app.rowOf(FIRST).querySelector('.field-label') as unknown as { click: () => void }).click();

    expect(app.detailOf(FIRST)).toBeNull();
  });

  it('失效標籤也是觸發區——它由 patchRow 重寫，漏掉就只有它不能點', () => {
    const app = open();
    app.markOf(FIRST, 'data', 'ok').click();

    const page = makeCoveragePage();
    page.sections[0]!.fields[0]!.how = '改過了';
    const reopened = open(page, {
      storage: { [app.storageKey]: app.win.localStorage.getItem(app.storageKey) ?? '' },
    });

    const tag = reopened.rowOf(FIRST).querySelector('.stale-tag');
    expect(tag, '這一列應該處於失效狀態').not.toBeNull();
    expect(tag?.getAttribute('data-expand')).toBe(FIRST);
  });
});

describe('鍵盤快捷', () => {
  const press = (app: ReviewUi, key: string): void => {
    app.doc.dispatchEvent(new app.win.KeyboardEvent('keydown', { bubbles: true, key }));
  };

  it('按 / 聚焦搜尋框', () => {
    const app = open();

    press(app, '/');

    expect(app.doc.activeElement).toBe(app.searchEl());
  });

  it('正在輸入時 / 不搶焦點——那時它就只是一個字元', () => {
    const app = open();
    const note = app.noteInputOf(FIRST);
    (note as unknown as { focus: () => void }).focus();

    press(app, '/');

    expect(app.doc.activeElement).toBe(note);
  });

  it('Esc 清掉搜尋內容並還原列表', () => {
    const app = open();
    const search = app.searchEl() as unknown as {
      dispatchEvent: (event: unknown) => void;
      focus: () => void;
      value: string;
    };
    const total = app.rowIds().length;

    search.focus();
    search.value = 'Pick field';
    search.dispatchEvent(new app.win.Event('input', { bubbles: true }));
    expect(app.rowIds().length).toBeLessThan(total);

    press(app, 'Escape');

    expect(search.value).toBe('');
    expect(app.rowIds().length).toBe(total);
  });
});

describe('網址狀態', () => {
  it('網址帶的篩選在開啟時就套用', () => {
    const app = open(undefined, { url: 'http://localhost/?src=fe-const' });

    expect(app.rowIds()).toEqual(['sec-table/f-const']);
  });

  it('多選篩選器的勾選狀態跟著還原——否則面板會說沒篩，畫面卻篩了', () => {
    const app = open(undefined, { url: 'http://localhost/?src=fe-const' });
    const box = app.doc.querySelector('#filter-source input[value="fe-const"]');

    expect((box as unknown as { checked: boolean }).checked).toBe(true);
  });

  it('狀態篩選的按下狀態跟著還原', () => {
    const app = open(undefined, { url: 'http://localhost/?s=unverified' });

    expect(app.doc.querySelector('[data-status="unverified"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(app.doc.querySelector('[data-status="all"]')?.getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('搜尋關鍵字跟著還原到輸入框', () => {
    const app = open(undefined, { url: 'http://localhost/?q=pick' });

    expect((app.searchEl() as unknown as { value: string }).value).toBe('pick');
    expect(app.rowIds()).toEqual(['sec-chart/f-pick']);
  });

  it('網址優先於本機偏好——分享出去的是刻意的意圖', () => {
    const app = open(undefined, {
      storage: { 'fieldproof:v1:coverage:prefs': JSON.stringify({ group: 'query' }) },
      url: 'http://localhost/?g=section',
    });

    expect(app.doc.querySelector('[data-group="section"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('篩選一變就寫回網址', () => {
    const app = open();

    (app.doc.querySelector('[data-status="problem"]') as unknown as { click: () => void }).click();

    expect(app.queryString()).toContain('s=problem');
  });

  it('全部回到預設時網址不留參數', () => {
    const app = open(undefined, { url: 'http://localhost/?s=problem' });

    (app.doc.querySelector('[data-status="all"]') as unknown as { click: () => void }).click();

    expect(app.queryString()).toBe('');
  });

  /**
   * 無效值若照單全收，篩選會變成「什麼都不符合」，使用者只看到一張空表卻不知道為什麼。
   * 這在 JSON 改過 section key 之後、拿舊網址重開時就會發生。
   */
  it('認不得的篩選值丟掉，而不是篩成一張空表', () => {
    const app = open(undefined, { url: 'http://localhost/?src=no-such-source&s=bogus' });

    expect(app.rowIds().length).toBeGreaterThan(0);
    expect(app.doc.querySelector('[data-status="all"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('驗收標記不進網址——那是個人的一次驗收動作，不是可分享的視角', () => {
    const app = open();

    app.markOf(FIRST, 'data', 'ok').click();

    expect(app.queryString()).toBe('');
  });
});
