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

