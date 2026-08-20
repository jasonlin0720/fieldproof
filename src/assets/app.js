/* fieldproof 驗收介面。無框架、無外部請求；由 render/html.ts inline 進生成的 HTML。 */
(() => {
  'use strict';

  const PAGE = JSON.parse(document.getElementById('fieldproof-data').textContent);
  const T = PAGE.ui;

  /** `{name}` 與 `{name|單數|複數}` 代入（與產生端 format.ts 的 fmt 同規則）。 */
  const SLOT = /\{(\w+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g;
  const t = (key, vars) =>
    (T[key] || '').replace(SLOT, (_, k, one, other) => {
      if (!vars || !Object.hasOwn(vars, k)) return '';
      if (one === undefined || other === undefined) return String(vars[k]);
      return Number(vars[k]) === 1 ? one : other;
    });

  /** 每小時支數：整數不留小數點，否則取一位（與產生端 formatRate 同規則）。 */
  const fmtRate = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  // 同一個瀏覽器 origin 下（`file://` 全部算同一個），不同專案的同名頁面會互相覆蓋，
  // 故由設定的 namespace 隔開；未設定時維持舊行為，只以頁名區分。
  const SCOPE = PAGE.namespace ? `${PAGE.namespace}:${PAGE.page}` : PAGE.page;
  const STORE_KEY = `fieldproof:v1:${SCOPE}`;
  const PREF_KEY = `fieldproof:v1:${SCOPE}:prefs`;

  const SOURCE_LABELS = PAGE.sourceLabels;
  const FLAG_META = PAGE.flagMeta;

  // ---------- state ----------

  /** 驗收標記：{ [id]: { data?: 'ok'|'ng', display?: 'ok'|'ng', actual?: string, note?: string } } */
  let marks = read(STORE_KEY, {});
  const prefs = read(PREF_KEY, {});

  const state = {
    group: prefs.group === 'query' ? 'query' : 'section',
    search: '',
    sections: new Set(),
    queries: new Set(),
    sources: new Set(),
    status: 'all',
    expanded: new Set(),
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(marks));
    } catch (error) {
      console.warn(T.warnStorage, error);
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ group: state.group }));
    } catch {
      /* 忽略：偏好存不了不影響驗收 */
    }
  }

  // ---------- 資料攤平 ----------

  /** 一列 = 一個欄位。id 為 `${section.key}/${field.id}`，是驗收狀態的穩定識別。 */
  const ROWS = [];
  for (const section of PAGE.sections) {
    for (const field of section.fields) {
      ROWS.push({
        id: `${section.key}/${field.id}`,
        section,
        field,
        queryIds: field.query === undefined ? [] : [].concat(field.query),
      });
    }
  }

  const ROW_BY_ID = new Map(ROWS.map((row) => [row.id, row]));

  const markOf = (id) => marks[id] || {};
  const fieldOf = (id) => ROW_BY_ID.get(id)?.field;

  const HASH_KEY = { data: 'dataHash', display: 'displayHash' };

  /**
   * 某一側（資料 / 顯示）的結論是否已失效：標記當下記下的定義指紋與現在的不同，
   * 代表 JSON 在那之後改過了，舊結論不可信。
   *
   * 兩側各自獨立——只改顯示規則時，「資料」的結論仍然有效。
   */
  const isStaleSide = (id, kind) => {
    const m = markOf(id);
    if (!m[kind]) return false;
    const field = fieldOf(id);
    if (!field) return false;
    const stamped = m[HASH_KEY[kind]];
    // 舊格式（未分側或無指紋）一律視為失效，保守要求重驗。
    if (stamped === undefined) return true;
    return stamped !== field[HASH_KEY[kind]];
  };

  const isStale = (id) => isStaleSide(id, 'data') || isStaleSide(id, 'display');

  /** 已驗＝兩側都標過、且兩側都未失效。 */
  const isVerified = (id) => {
    const m = markOf(id);
    return (
      Boolean(m.data) &&
      Boolean(m.display) &&
      !isStaleSide(id, 'data') &&
      !isStaleSide(id, 'display')
    );
  };

  /** 有問題＝任一側標為 ✗ 且該側結論仍有效。 */
  const hasProblem = (id) => {
    const m = markOf(id);
    return (
      (m.data === 'ng' && !isStaleSide(id, 'data')) ||
      (m.display === 'ng' && !isStaleSide(id, 'display'))
    );
  };

  // ---------- 篩選 ----------

  function matches(row) {
    if (state.sections.size && !state.sections.has(row.section.key)) return false;

    if (state.queries.size) {
      const hit = row.queryIds.some((q) => state.queries.has(q));
      const noneSelected = state.queries.has('__none__') && row.queryIds.length === 0;
      if (!hit && !noneSelected) return false;
    }

    if (state.sources.size && !state.sources.has(row.field.source)) return false;

    if (state.status === 'unverified' && isVerified(row.id)) return false;
    if (state.status === 'problem' && !hasProblem(row.id)) return false;
    if (state.status === 'stale' && !isStale(row.id)) return false;

    if (state.search) {
      const m = markOf(row.id);
      const haystack = [
        row.section.title,
        row.field.label,
        row.field.resp,
        row.field.how,
        row.field.display,
        row.field.note || '',
        m.note || '',
        m.actual || '',
        row.queryIds.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(state.search)) return false;
    }

    return true;
  }

  /** 依目前分組模式，把通過篩選的列切成群組。 */
  function buildGroups(rows) {
    if (state.group === 'section') {
      return PAGE.sections
        .map((section) => ({
          kind: 'section',
          key: section.key,
          section,
          rows: rows.filter((row) => row.section.key === section.key),
        }))
        .filter((group) => group.rows.length);
    }

    const groups = Object.entries(PAGE.queries)
      .map(([id, query]) => ({
        kind: 'query',
        key: id,
        query,
        rows: rows.filter((row) => row.queryIds.includes(id)),
      }))
      .filter((group) => group.rows.length);

    const orphans = rows.filter((row) => row.queryIds.length === 0);
    if (orphans.length) {
      groups.push({ kind: 'query', key: '__none__', query: null, rows: orphans });
    }
    return groups;
  }

  // ---------- 渲染 ----------

  const esc = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  /** 極簡 inline markdown：只處理 **粗體**，供 checks 標出「不是 0」這類重點。 */
  const inlineMd = (text) => text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  /**
   * 精簡的端點顯示：省略 `GET ` 前綴，其餘方法保留。
   *
   * 這是刻意的不對稱而非疏漏——GET 是預設，寫出來只佔寬度；POST / DELETE 在 Network
   * 對帳時正是要一眼看見的資訊，剝掉會弄丟它。詳情類欄位（明細框、markdown 查詢表）
   * 一律顯示完整端點。
   */
  const pathLabel = (endpoint) => endpoint.replace(/^GET /, '');

  function srcChip(source) {
    return `<span class="src src--${esc(source)}">${esc(SOURCE_LABELS[source])}</span>`;
  }

  function flagIcons(field) {
    if (!field.flags || !field.flags.length) return '';
    const title = field.flags.map((f) => FLAG_META[f].label).join(T.joinSemi);
    const icons = field.flags.map((f) => FLAG_META[f].icon).join('');
    return `<span class="field-flags" title="${esc(title)}">${icons}</span>`;
  }

  function queryChips(row) {
    if (!row.queryIds.length) return '<span class="resp--none">—</span>';
    return row.queryIds
      .map((id) => {
        const query = PAGE.queries[id];
        const title = query
          ? `${query.endpoint}\n${Object.entries(query.params)
              .map(([k, v]) => `${k}=${v}`)
              .join('\n')}`
          : id;
        return `<span class="qchip" title="${esc(title)}">${esc(id)}</span>`;
      })
      .join('');
  }

  function markCell(row, kind) {
    const current = markOf(row.id)[kind];
    const stale = isStaleSide(row.id, kind);
    const btn = (value, label) =>
      `<button class="mark" type="button" data-id="${esc(row.id)}" data-kind="${kind}" ` +
      `data-mark="${value}" aria-pressed="${current === value}" ` +
      `aria-label="${esc(row.section.title)} ${esc(row.field.label)} ${
        kind === 'data' ? T.sideData : T.sideDisplay
      }${label}">${value === 'ok' ? '✓' : '✗'}</button>`;
    return (
      `<div class="marks${stale ? ' marks--stale' : ''}"` +
      (stale ? ` title="${esc(T.markStaleHint)}"` : '') +
      `>${btn('ok', T.markOk)}${btn('ng', T.markNg)}</div>`
    );
  }

  /**
   * 失效標籤。整表渲染與 patchRow 共用同一份——patchRow 曾經只會**移除**標籤，
   * 於是「兩側都失效 → 只重標資料側」之後，文字仍停在「定義已變更」而非「顯示定義已變更」。
   */
  function staleTagHtml(id) {
    const data = isStaleSide(id, 'data');
    const display = isStaleSide(id, 'display');
    if (!data && !display) return '';

    const label = data && display ? T.staleBoth : data ? T.staleData : T.staleDisplay;
    return `<span class="stale-tag" title="${esc(T.staleTagTitle)}">⟳ ${esc(label)}</span>`;
  }

  function rowHtml(row) {
    const m = markOf(row.id);
    const expanded = state.expanded.has(row.id);
    const stale = isStale(row.id);
    const resp =
      row.field.resp === null
        ? `<span class="resp resp--none">${esc(T.respNone)}</span>`
        : `<span class="resp">${esc(row.field.resp)}</span>`;

    return (
      `<tr class="row${expanded ? ' row--expanded' : ''}${hasProblem(row.id) ? ' row--ng' : ''}` +
      `${stale ? ' row--stale' : ''}" data-id="${esc(row.id)}">` +
      `<td class="cell-expand"><button class="expand" type="button" data-expand="${esc(row.id)}" ` +
      `aria-expanded="${expanded}" aria-label="${esc(T.expandAria)}">${expanded ? '▾' : '▸'}</button></td>` +
      `<td><span class="field-label">${esc(row.field.label)}</span>${flagIcons(row.field)}` +
      staleTagHtml(row.id) +
      (row.field.checks
        ? `<span class="checks-tag" title="${esc(t('checksTagTitle', { n: row.field.checks.length }))}">${esc(t('checksTag', { n: row.field.checks.length }))}</span>`
        : '') +
      `</td>` +
      `<td>${queryChips(row)}</td>` +
      `<td>${resp}</td>` +
      `<td><div class="how"><span>${srcChip(row.field.source)}${esc(row.field.how)}</span>` +
      `<span class="how__display">${esc(row.field.display)}</span></div></td>` +
      `<td class="cell-actual"><input class="cell-input cell-input--actual" type="text" ` +
      `data-input="actual" data-id="${esc(row.id)}" name="actual:${esc(row.id)}" ` +
      `value="${esc(m.actual || '')}" placeholder="${esc(T.actualPlaceholder)}" aria-label="${esc(T.actualAria)}"></td>` +
      `<td>${markCell(row, 'data')}</td>` +
      `<td>${markCell(row, 'display')}</td>` +
      `<td class="cell-note"><input class="cell-input" type="text" data-input="note" ` +
      `data-id="${esc(row.id)}" name="note:${esc(row.id)}" value="${esc(m.note || '')}" ` +
      `placeholder="${esc(T.notePlaceholder)}" aria-label="${esc(T.noteAria)}"></td>` +
      `</tr>` +
      (expanded ? detailHtml(row) : '')
    );
  }

  /** 明細內容本體，不含表格列外殼——整表渲染與局部插入共用同一份。 */
  function detailGridHtml(row) {
    const boxes = row.queryIds.map((id) => {
      const query = PAGE.queries[id];
      if (!query) return '';
      const params = Object.entries(query.params)
        .map(([k, v]) => `<div class="detail__row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
        .join('');
      return (
        `<div class="detail__box">` +
        `<div class="detail__title">${esc(id)} · ${esc(PAGE.refetchLabels[id])}` +
        (query.httpCount && query.httpCount > 1
          ? ` · ${esc(t('detailConcurrent', { n: query.httpCount }))}`
          : '') +
        (query.filter
          ? `<button class="btn" type="button" data-copy="${esc(id)}">${esc(T.btnCopyNetworkFilter)}</button>`
          : '') +
        `</div>` +
        (query.filter
          ? `<div class="detail__row"><dt>${esc(T.detailFilter)}</dt><dd><b>${esc(query.filter)}</b></dd></div>`
          : '') +
        `<div class="detail__row"><dt>${esc(T.detailEndpoint)}</dt><dd>${esc(query.endpoint)}</dd></div>` +
        `<div class="detail__row"><dt>${esc(T.detailSdk)}</dt><dd>${esc(query.sdk)}</dd></div>` +
        params +
        (query.enabledWhen
          ? `<div class="detail__row"><dt>${esc(T.detailEnabledWhen)}</dt><dd>${esc(query.enabledWhen)}</dd></div>`
          : '') +
        (query.filterNote
          ? `<p class="detail__note"><b>${esc(T.detailFilterNote)}</b>${esc(query.filterNote)}</p>`
          : '') +
        (query.note ? `<p class="detail__note">${esc(query.note)}</p>` : '') +
        `</div>`
      );
    });

    if (row.field.checks && row.field.checks.length) {
      boxes.unshift(
        `<div class="detail__box detail__box--checks">` +
          `<div class="detail__title">${esc(t('detailChecksTitle', { n: row.field.checks.length }))}</div>` +
          `<table class="checks"><thead><tr><th>${esc(T.detailChecksGiven)}</th><th>${esc(T.detailChecksExpect)}</th></tr></thead><tbody>` +
          row.field.checks
            .map(
              (c) =>
                `<tr><td><code>${esc(c.given)}</code></td><td>${inlineMd(esc(c.expect))}</td></tr>`,
            )
            .join('') +
          `</tbody></table></div>`,
      );
    }

    const notes = [];
    if (row.field.flags && row.field.flags.length) {
      notes.push(
        row.field.flags
          .map((f) => `<b>${FLAG_META[f].icon} ${esc(FLAG_META[f].label)}</b>`)
          .join(' '),
      );
    }
    if (row.field.note) notes.push(esc(row.field.note));
    if (row.section.emptyRule)
      notes.push(`<b>${esc(T.detailEmptyRule)}</b>${esc(row.section.emptyRule)}`);

    if (notes.length) {
      boxes.push(
        `<div class="detail__box"><div class="detail__title">${esc(T.detailNoteTitle)}</div>` +
          notes.map((n) => `<p class="detail__note">${n}</p>`).join('') +
          `</div>`,
      );
    }

    if (!boxes.length) {
      boxes.push(
        `<div class="detail__box"><div class="detail__title">${esc(T.detailNoteTitle)}</div>` +
          `<p class="detail__note">${esc(T.detailNoApi)}</p></div>`,
      );
    }

    return `<div class="detail__grid">${boxes.join('')}</div>`;
  }

  /** 整表渲染用：連外殼一起輸出，直接串進 tbody 的 innerHTML。 */
  function detailHtml(row) {
    return `<tr class="detail"><td colspan="9">${detailGridHtml(row)}</td></tr>`;
  }

  /**
   * 局部插入用：以 DOM API 建列。
   *
   * 不用 insertAdjacentHTML——在 `<tr>` 旁插入 `<tr>` 要靠解析器的表格上下文，各家實作
   * 不一致（happy-dom 會把外殼整個丟掉）。createElement 沒有這個問題。
   */
  function detailRowEl(row) {
    const tr = document.createElement('tr');
    tr.className = 'detail';

    const td = document.createElement('td');
    td.colSpan = 9;
    td.innerHTML = detailGridHtml(row);

    tr.appendChild(td);
    return tr;
  }

  /**
   * 分組進度。groupHeadHtml 的初繪與 patchGroupProgress 的局部更新共用同一份——
   * 曾經各寫一份，結果局部更新那份漏掉 locale，標記前後看到的字串來源不同。
   */
  function progressHtml(ids) {
    const done = ids.filter(isVerified).length;
    const ng = ids.filter(hasProblem).length;
    return (
      t('groupProgress', { done, total: ids.length }) +
      (ng ? ` · <b style="color:var(--ng)">${esc(t('groupNg', { n: ng }))}</b>` : '')
    );
  }

  function groupHeadHtml(group) {
    const progress = progressHtml(group.rows.map((row) => row.id));

    if (group.kind === 'section') {
      const section = group.section;
      const meta = Object.entries(section.meta || {})
        .map(([k, v]) => `${esc(k)} ${esc(v)}`)
        .join(T.joinMeta);
      return (
        `<tr class="group"><td colspan="9">` +
        `<div class="group__head"><span class="group__title">${esc(section.title)}</span>` +
        `<span class="group__key">${esc(section.key)}</span>` +
        `<span class="group__meta">${esc(PAGE.sectionKindLabels[section.kind])}${meta ? T.joinMeta + meta : ''}</span>` +
        (section.emptyRule
          ? `<span class="group__info" title="${esc(t('groupEmptyTitle', { rule: section.emptyRule }))}">${esc(T.groupEmptyInfo)}</span>`
          : '') +
        `<span class="group__progress">${progress}</span></div>` +
        `</td></tr>`
      );
    }

    if (!group.query) {
      return (
        `<tr class="group"><td colspan="9"><div class="group__head">` +
        `<span class="group__title">${esc(T.groupNoQuery)}</span>` +
        `<span class="group__meta">${esc(T.groupNoQueryMeta)}</span>` +
        `<span class="group__progress">${progress}</span></div></td></tr>`
      );
    }

    const query = group.query;
    const params = Object.entries(query.params)
      .map(([k, v]) => `${k}=${v}`)
      .join(' · ');
    return (
      `<tr class="group"><td colspan="9">` +
      `<div class="group__head"><span class="group__title">${esc(group.key)}</span>` +
      `<span class="group__key">${esc(query.endpoint)}${T.joinMeta}${esc(PAGE.refetchLabels[group.key])}${
        query.httpCount && query.httpCount > 1
          ? `${T.joinMeta}${esc(t('detailConcurrent', { n: query.httpCount }))}`
          : ''
      }</span>` +
      `<span class="group__meta" title="${esc(params)}">` +
      (query.filter ? `<code class="group__filter">${esc(query.filter)}</code> ` : '') +
      `${esc(params)}</span>` +
      (query.filter
        ? `<button class="btn" type="button" data-copy="${esc(group.key)}" ` +
          `title="${esc(t('copyFilterTitle', { filter: query.filter }))}">${esc(T.btnCopyFilter)}</button>`
        : '') +
      `<span class="group__progress">${progress}</span></div>` +
      `</td></tr>`
    );
  }

  let visibleCount = ROWS.length;

  function render() {
    const rows = ROWS.filter(matches);
    visibleCount = rows.length;
    const groups = buildGroups(rows);
    const body = document.getElementById('tbody');

    body.innerHTML = groups.length
      ? groups.map((g) => groupHeadHtml(g) + g.rows.map(rowHtml).join('')).join('')
      : `<tr><td colspan="9"><div class="empty-state">${esc(T.emptyState)}</div></td></tr>`;

    renderProgress(rows.length);
  }

  function renderProgress(visible) {
    const done = ROWS.filter((row) => isVerified(row.id)).length;
    const ng = ROWS.filter((row) => hasProblem(row.id)).length;
    document.getElementById('progress-done').textContent = `${done}/${ROWS.length}`;
    document.getElementById('progress-ng').textContent = ng
      ? t('progressProblem', { n: ng })
      : T.progressNoProblem;
    document.getElementById('progress-ng').classList.toggle('progress__problem', ng > 0);
    document.getElementById('progress-fill').style.width =
      `${ROWS.length ? (done / ROWS.length) * 100 : 0}%`;
    document.getElementById('visible-count').textContent =
      visible === ROWS.length ? '' : t('progressFiltered', { n: visible });
  }

  /**
   * 展開 / 收合明細。
   *
   * 不走 render()：重繪整個 tbody 會抹掉使用者當下的**文字選取**與輸入焦點。驗收時
   * 常要把 response 路徑或篩選字串複製進 DevTools，選到一半被抹掉等於這個介面不能用。
   * 與 patchRow() 同一條理由，只是當初只想到輸入框失焦。
   */
  function toggleExpand(id) {
    const rowEl = document.querySelector(`tr.row[data-id="${id}"]`);
    const row = ROW_BY_ID.get(id);
    if (!rowEl || !row) return;

    const willExpand = !state.expanded.has(id);
    if (willExpand) {
      state.expanded.add(id);
      rowEl.insertAdjacentElement('afterend', detailRowEl(row));
    } else {
      state.expanded.delete(id);
      const detail = rowEl.nextElementSibling;
      if (detail && detail.classList.contains('detail')) detail.remove();
    }

    rowEl.classList.toggle('row--expanded', willExpand);
    const btn = rowEl.querySelector('[data-expand]');
    btn.setAttribute('aria-expanded', String(willExpand));
    btn.textContent = willExpand ? '▾' : '▸';
  }

  /**
   * 標記後的局部更新：重繪整個 tbody 會讓正在編輯的備註 / 實際值輸入框失焦，
   * 故只改動該列自身、其所屬分組的進度與頁首進度。
   * 只有當篩選條件與標記狀態相關（只看未驗 / 只看有問題）時，該列可能要進出視野，
   * 這時才需要整表重算。
   */
  function patchRow(id) {
    const rowEl = document.querySelector(`tr.row[data-id="${id}"]`);
    if (!rowEl) return;

    const m = markOf(id);
    for (const btn of rowEl.querySelectorAll('.mark')) {
      btn.setAttribute('aria-pressed', String(m[btn.dataset.kind] === btn.dataset.mark));
    }
    rowEl.classList.toggle('row--ng', hasProblem(id));
    rowEl.classList.toggle('row--stale', isStale(id));
    for (const marks of rowEl.querySelectorAll('.marks')) {
      const kind = marks.querySelector('.mark')?.dataset.kind;
      marks.classList.toggle('marks--stale', kind ? isStaleSide(id, kind) : false);
    }
    // 標記只會讓某一側「重新有效」，不會讓原本不失效的列變失效，故只需更新或移除。
    const staleTag = rowEl.querySelector('.stale-tag');
    if (staleTag) {
      const html = staleTagHtml(id);
      if (html) staleTag.outerHTML = html;
      else staleTag.remove();
    }

    patchGroupProgress(rowEl);
    renderProgress(visibleCount);
  }

  /** 重算該列所屬分組的「N/M 已驗」。 */
  function patchGroupProgress(rowEl) {
    let groupEl = rowEl.previousElementSibling;
    while (groupEl && !groupEl.classList.contains('group')) {
      groupEl = groupEl.previousElementSibling;
    }
    if (!groupEl) return;

    const ids = [];
    for (let cursor = groupEl.nextElementSibling; cursor; cursor = cursor.nextElementSibling) {
      if (cursor.classList.contains('group')) break;
      if (cursor.classList.contains('row')) ids.push(cursor.dataset.id);
    }

    groupEl.querySelector('.group__progress').innerHTML = progressHtml(ids);
  }

  // ---------- 多選篩選器 ----------

  function buildMulti(id, label, items, target) {
    const host = document.getElementById(id);
    host.querySelector('.multi__panel').innerHTML = items
      .map(
        (item) =>
          `<label class="multi__item"><input type="checkbox" name="${esc(id)}" ` +
          `value="${esc(item.value)}">` +
          `<span>${esc(item.label)}</span><span>${item.count}</span></label>`,
      )
      .join('');

    host.addEventListener('change', (event) => {
      const input = event.target;
      if (input.type !== 'checkbox') return;
      if (input.checked) target.add(input.value);
      else target.delete(input.value);
      const badge = host.querySelector('.multi__count');
      badge.textContent = target.size || '';
      badge.style.display = target.size ? '' : 'none';
      render();
    });
  }

  function countBy(getKey) {
    const counts = new Map();
    for (const row of ROWS) {
      for (const key of [].concat(getKey(row))) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }

  // ---------- 匯出 ----------

  function buildReport() {
    const problems = ROWS.filter((row) => hasProblem(row.id));
    const done = ROWS.filter((row) => isVerified(row.id)).length;
    const lines = [
      t('reportHeading', { title: PAGE.title }),
      '',
      t('reportSummary', { done, problems: problems.length, total: ROWS.length }),
      '',
    ];

    if (!problems.length) {
      lines.push(T.reportAllPass);
      return lines.join('\n');
    }

    for (const row of problems) {
      const m = markOf(row.id);
      const failed = [
        m.data === 'ng' ? T.sideData : null,
        m.display === 'ng' ? T.sideDisplay : null,
      ]
        .filter(Boolean)
        .join(T.joinList);
      lines.push(t('reportSection', { field: row.field.label, section: row.section.title }));
      for (const id of row.queryIds) {
        const query = PAGE.queries[id];
        const params = Object.entries(query.params)
          .map(([k, v]) => `${k}=${v}`)
          .join(' · ');
        lines.push(t('reportQuery', { endpoint: query.endpoint, id, params }));
      }
      if (!row.queryIds.length) lines.push(T.reportQueryNone);
      lines.push(t('reportResp', { value: row.field.resp }));
      lines.push(
        t('reportExpectValue', { how: row.field.how, source: SOURCE_LABELS[row.field.source] }),
      );
      lines.push(t('reportExpectDisplay', { display: row.field.display }));
      if (m.actual) lines.push(t('reportActual', { value: m.actual }));
      lines.push(t('reportFailed', { sides: failed }));
      if (m.note) lines.push(t('reportNote', { note: m.note }));
      lines.push('');
    }

    return lines.join('\n');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // file:// 或權限受限時的退路
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    }
  }

  let toastTimer;
  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('toast--show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('toast--show'), 2200);
  }

  // ---------- Network 對帳清單 ----------

  /**
   * 讓 Network 面板裡的每一支 request 都對得到來源——多出來的就是 bug
   * （重複請求 / 該去重沒去重），少了的就是查詢沒發出去。
   */
  function renderReconcile() {
    const entries = Object.entries(PAGE.queries);
    const usedBy = new Map();
    for (const row of ROWS) {
      for (const id of row.queryIds) {
        if (!usedBy.has(id)) usedBy.set(id, []);
        usedBy.get(id).push(row.section.title);
      }
    }

    const rowsHtml = entries
      .map(([id, query]) => {
        const count = query.httpCount || 1;
        const sections = [...new Set(usedBy.get(id) || [])];
        const origin = query.origin ? PAGE.originLabels[query.origin] : PAGE.originLabels.card;
        const where = sections.length
          ? sections.join(T.joinList)
          : `<i>${esc(T.reconcileNoField)}</i>`;
        return (
          `<tr class="${query.conditional ? 'reconcile--conditional' : ''}">` +
          `<td><b>${esc(id)}</b></td>` +
          `<td><code>${esc(pathLabel(query.endpoint))}</code></td>` +
          `<td>` +
          (query.filter
            ? `<code class="reconcile__filter">${esc(query.filter)}</code>` +
              `<button class="btn" type="button" data-copy="${esc(id)}">${esc(T.btnCopy)}</button>`
            : `<i>${esc(T.reconcileNoFilter)}</i>`) +
          `</td>` +
          `<td class="reconcile__count">${esc(t('reconcileCount', { n: count }))}${query.conditional ? '<sup>*</sup>' : ''}</td>` +
          `<td>${esc(origin)}</td>` +
          `<td>${where}</td>` +
          `</tr>`
        );
      })
      .join('');

    const conditional = entries.filter(([, q]) => q.conditional);
    const conditionalNote = conditional.length
      ? `<p class="reconcile__note"><sup>*</sup> ${esc(t('reconcileConditional', { n: PAGE.stats.conditionalHttpCount }))}` +
        conditional
          .map(([id, q]) => `<b>${esc(id)}</b> ${esc(q.enabledWhen || '')}`)
          .join(T.joinSemi) +
        `</p>`
      : '';

    const breakdown =
      PAGE.stats.byInterval.length > 1
        ? t('reconcileBreakdown', {
            parts: PAGE.stats.byInterval
              .map((b) =>
                t('reconcilePart', {
                  http: b.httpCount,
                  label: esc(PAGE.intervalLabels[b.intervalMs]),
                  perHour: fmtRate(b.perHour),
                }),
              )
              .join(T.joinSemi),
          })
        : '';

    document.getElementById('reconcile-body').innerHTML =
      `<p class="reconcile__lead">` +
      t('reconcileLead', {
        base: `<b>${esc(t('reconcileCount', { n: PAGE.stats.baseHttpCount }))}</b>`,
      }) +
      t('reconcileLoad', {
        breakdown,
        perHour: fmtRate(PAGE.stats.perHour),
        polling: PAGE.stats.pollingHttpCount,
      }) +
      `</p>` +
      `<table class="reconcile"><thead><tr>` +
      `<th>${esc(T.reconcileColId)}</th><th>${esc(T.reconcileColEndpoint)}</th>` +
      `<th>${esc(T.reconcileColFilter)}</th><th>${esc(T.reconcileColCount)}</th>` +
      `<th>${esc(T.reconcileColOrigin)}</th><th>${esc(T.reconcileColUsedBy)}</th>` +
      `</tr></thead><tbody>${rowsHtml}</tbody></table>` +
      conditionalNote;
  }

  // ---------- 事件 ----------

  document.getElementById('tbody').addEventListener('click', (event) => {
    const mark = event.target.closest('.mark');
    if (mark) {
      const { id, kind, mark: value } = mark.dataset;
      const entry = { ...markOf(id) };
      const field = fieldOf(id);
      if (entry[kind] === value) {
        delete entry[kind];
        delete entry[HASH_KEY[kind]];
      } else {
        entry[kind] = value;
        // 只戳這一側的指紋——另一側的結論與其失效狀態不受影響。
        entry[HASH_KEY[kind]] = field?.[HASH_KEY[kind]];
      }
      marks[id] = entry;
      save();

      // stale 狀態可能因這次標記而改變（重新標記即視為已重驗）→ 整列重畫。
      if (state.status === 'all') patchRow(id);
      else render();
      return;
    }

    const copy = event.target.closest('[data-copy]');
    if (copy) {
      const query = PAGE.queries[copy.dataset.copy];
      if (!query.filter) return;
      copyText(query.filter).then((ok) =>
        toast(ok ? t('toastCopied', { text: query.filter }) : T.toastCopyFailed),
      );
      return;
    }

    // 只有展開鈕能展開。整列可點的話，拖曳選取與雙擊選字都會被當成展開意圖——
    // 兩者的 mousedown / mouseup 都落在同一列，瀏覽器照樣發 click，擋不掉。
    const expandBtn = event.target.closest('[data-expand]');
    if (expandBtn) toggleExpand(expandBtn.dataset.expand);
  });

  let inputTimer;
  document.getElementById('tbody').addEventListener('input', (event) => {
    const input = event.target.closest('[data-input]');
    if (!input) return;
    const { id, input: kind } = input.dataset;
    const entry = { ...markOf(id) };
    if (input.value) entry[kind] = input.value;
    else delete entry[kind];
    marks[id] = entry;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(save, 300);
    // 不重繪：重繪會讓正在打字的輸入框失焦。值已即時寫入 marks，離開頁面前 debounce 存檔。
  });

  document.getElementById('search').addEventListener('input', (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });

  for (const btn of document.querySelectorAll('[data-group]')) {
    btn.addEventListener('click', () => {
      state.group = btn.dataset.group;
      for (const other of document.querySelectorAll('[data-group]')) {
        other.setAttribute('aria-pressed', String(other === btn));
      }
      savePrefs();
      render();
    });
  }

  for (const btn of document.querySelectorAll('[data-status]')) {
    btn.addEventListener('click', () => {
      state.status = btn.dataset.status;
      for (const other of document.querySelectorAll('[data-status]')) {
        other.setAttribute('aria-pressed', String(other === btn));
      }
      render();
    });
  }

  const reconcileDlg = document.getElementById('reconcile-dlg');
  document.getElementById('reconcile').addEventListener('click', () => {
    renderReconcile();
    reconcileDlg.showModal();
  });
  document.getElementById('reconcile-close').addEventListener('click', () => reconcileDlg.close());
  reconcileDlg.addEventListener('click', (event) => {
    const copy = event.target.closest('[data-copy]');
    if (!copy) return;
    const query = PAGE.queries[copy.dataset.copy];
    if (!query.filter) return;
    copyText(query.filter).then((ok) =>
      toast(ok ? t('toastCopied', { text: query.filter }) : T.toastCopyFailed),
    );
  });

  document.getElementById('export').addEventListener('click', () => {
    copyText(buildReport()).then((ok) => toast(ok ? T.toastReportCopied : T.toastReportFailed));
  });

  document.getElementById('reset').addEventListener('click', () => {
    const done = ROWS.filter((row) => isVerified(row.id)).length;
    if (!confirm(t('confirmReset', { done, total: ROWS.length }))) return;
    marks = {};
    save();
    render();
    toast(T.toastReset);
  });

  // ---------- 啟動 ----------

  const sectionCounts = countBy((row) => row.section.key);
  buildMulti(
    'filter-section',
    T.filterSection,
    PAGE.sections.map((section) => ({
      value: section.key,
      label: section.title,
      count: sectionCounts.get(section.key) || 0,
    })),
    state.sections,
  );

  const queryCounts = countBy((row) => (row.queryIds.length ? row.queryIds : '__none__'));
  buildMulti(
    'filter-query',
    T.filterQuery,
    [
      ...Object.keys(PAGE.queries).map((id) => ({
        value: id,
        label: `${id} · ${pathLabel(PAGE.queries[id].endpoint)}`,
        count: queryCounts.get(id) || 0,
      })),
      { value: '__none__', label: T.groupNoQuery, count: queryCounts.get('__none__') || 0 },
    ].filter((item) => item.count > 0),
    state.queries,
  );

  const sourceCounts = countBy((row) => row.field.source);
  buildMulti(
    'filter-source',
    T.filterSource,
    Object.keys(SOURCE_LABELS)
      .map((key) => ({ value: key, label: SOURCE_LABELS[key], count: sourceCounts.get(key) || 0 }))
      .filter((item) => item.count > 0),
    state.sources,
  );

  for (const btn of document.querySelectorAll('[data-group]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.group === state.group));
  }

  render();
})();
