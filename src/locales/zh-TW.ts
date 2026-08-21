/**
 * 繁體中文（台灣）語系——同時是**參考語系**：`Locale` 型別由本物件推導，
 * 新增語系時少一個 key 就編譯不過。
 *
 * `ui` 底下全部是純字串，因為它會被序列化進 HTML 供瀏覽器端讀取；需要插值者以
 * `{name}` 佔位，由 app.js 的 `fmt()` 代入。其餘區段跑在 Node，直接用函式。
 */

export const zhTW = {
  id: 'zh-TW',
  /** 生成 HTML 的 `lang` 屬性 */
  htmlLang: 'zh-Hant',

  source: {
    direct: 'API 直取',
    'backend-agg': '後端合計',
    'fe-pick': '前端取某筆',
    'fe-agg': '前端聚合',
    'fe-derive': '前端換算',
    'fe-const': '前端硬編',
  },

  origin: {
    card: '卡片資料',
    component: '共用元件自打',
    layout: '版面層',
  },

  sectionKind: {
    card: '卡片',
    chart: '圖表',
    filter: '篩選',
    form: '表單',
    table: '表格',
  },

  flag: {
    exception: { icon: '⚠', label: '違反全站慣例的刻意設計' },
    'backend-pending': { icon: '🕓', label: '後端尚在研議 / 目前為權宜解' },
    fragile: { icon: '⚡', label: '易碎：依賴字串格式比對等' },
    unresolved: { icon: '❓', label: '來源未追出，本列為推測，需人工確認' },
  },

  interval: {
    none: '不輪詢',
    hour: '每小時',
    minute: '每分鐘',
    second: '每秒',
    hours: (n: number) => `每 ${n} 小時`,
    minutes: (n: number) => `每 ${n} 分`,
    seconds: (n: number) => `每 ${n} 秒`,
    ms: (n: number) => `每 ${n} 毫秒`,
  },

  cli: {
    usage: `用法：
  fieldproof build [選項]        驗證資料並生成 HTML / markdown / index
  fieldproof skill [--install]   顯示 / 安裝隨套件發佈的 skill

build 選項：
  --check                       只驗證並比對現有生成物；不同步則非零退出
  --config <path>               指定設定檔（預設自 cwd 向上探尋 fieldproof.config.json）

skill 選項：
  --install                     實際複製；未指定時只顯示來源與目的地
  --to <dir>                    安裝位置（預設 .claude/skills/fieldproof）

  -h, --help                    顯示本說明
  -v, --version                 顯示版本
`,
    failHeader: '\n✖ fieldproof 失敗\n',
    inSync: (n: number) => `✓ ${n} 個生成物皆與資料同步`,
    orphans: (paths: string[]) =>
      `以下生成物已無對應的資料檔，請刪除（本指令不會自動刪，它們多半已在 git 裡）：\n` +
      paths.map((p) => `  ${p}`).join('\n'),
    driftHeader:
      '以下頁面的來源檔，在資料檔最後一次 commit 之後又被改過，可能已與程式碼脫節，建議重新盤點。\n' +
      '（本工具不判斷內容是否真的變了，只轉述 git 的事實；此提示不影響 --check 的結果。）',
    driftPage: (page: string, sha: string, date: string, sources: string[]) =>
      `  ${page}（基準 ${sha}，${date}）：\n` + sources.map((p) => `    ${p}`).join('\n'),
    driftMissingHeader:
      '以下頁面宣告的來源檔在磁碟上找不到。可能是檔案改名 / 刪除了（該重新盤點），\n' +
      '也可能是路徑基準寫錯——`sources` 以設定檔所在目錄為基準，不是 repo 根目錄。\n' +
      '**找不到的檔案比對不了，所以這些頁面不會有變動提示：沒有提示不等於沒有變動。**',
    driftMissingPage: (page: string, sources: string[]) =>
      `  ${page}：\n` + sources.map((p) => `    ${p}`).join('\n'),
    outOfSync: (command: string, paths: string[]) =>
      `以下生成物與資料不同步，請執行 \`${command}\`：\n${paths.map((p) => `  ${p}`).join('\n')}`,
    pageSummary: (
      page: string,
      queries: number,
      polling: number,
      sections: number,
      fields: number,
    ) => `${page}：${queries} 個查詢（${polling} 個輪詢）、${sections} 個區塊、${fields} 個欄位`,
    loadSummary: (pollingHttp: number, perHour: string) =>
      // U+3000 全形空格作為視覺分隔；寫成逸出序列，否則編輯器 / 複製貼上會把它吃掉（見 AGENTS §7）
      `  單次全量刷新 ${pollingHttp} 支 HTTP\u3000每小時 ${perHour} 支`,
    unresolvedSummary: (n: number) => `  ⚠️ ${n} 個欄位的來源未追出，需人工確認`,
    unknownOption: (arg: string) => `未知選項：${arg}`,
    unknownCommand: (arg: string) => `未知指令：${arg}`,
    extraArg: (arg: string) => `多餘的參數：${arg}`,
    optionNeedsValue: (option: string) => `${option} 後面要接一個值`,
    optionNotForCommand: (option: string, command: string) => `${option} 不是 ${command} 的選項`,
    skillWhere: (source: string, dest: string) =>
      `skill 來源：${source}\n將安裝至：${dest}\n\n加上 --install 實際複製。`,
    skillInstalled: (dest: string) =>
      `✓ skill 已安裝至 ${dest}\n  升級 fieldproof 後重跑本指令即可更新。`,
  },

  errors: {
    dataDirMissing: (dir: string) => `資料目錄不存在：${dir}`,
    noDataFiles: (dir: string) => `${dir} 下沒有任何 .json 資料檔`,
    dataNotJson: (file: string, detail: string) => `${file} 不是合法的 JSON：${detail}`,
    invalidPage: (file: string, detail: string) => `${file} 資料格式不符：\n${detail}`,
    pageNameMismatch: (file: string, declared: string, expected: string) =>
      `${file} 的 page（${declared}）與檔名（${expected}）不一致`,
    duplicateSectionKey: (file: string, key: string) => `${file} 的 section.key 重複：${key}`,
    duplicateFieldId: (file: string, sectionKey: string, id: string) =>
      `${file} 的 ${sectionKey} 內 field.id 重複：${id}`,
    duplicateFilter: (file: string, id: string, owner: string, filter: string) =>
      `${file} 的 ${id} 與 ${owner} 使用了相同的 Network 篩選字串「${filter}」——` +
      '兩支查詢在 DevTools 面板中將無法分辨，請改用更精確的片段。',
    respPlaceholder: (file: string, sectionKey: string, fieldId: string) =>
      `${file} 的 ${sectionKey}/${fieldId} 把 resp 填成破折號。` +
      '不來自任何 API 的欄位請填 null——破折號是顯示層的事，由語系決定。',
    conditionalNeedsEnabledWhen: (file: string, id: string) =>
      `${file} 的 ${id} 標成 conditional 卻沒有 enabledWhen——` +
      '對帳清單會列出這支查詢卻說不出它何時才發，請補上條件說明。',
    unknownQueryRef: (file: string, sectionKey: string, fieldId: string, queryId: string) =>
      `${file} 的 ${sectionKey}/${fieldId} 參照了不存在的查詢：${queryId}`,
    configNotFound: (filename: string, cwd: string) =>
      `找不到 ${filename}（自 ${cwd} 向上探尋）。\n請於專案根目錄建立，或以 --config <path> 指定。`,
    configMissing: (path: string) => `設定檔不存在：${path}`,
    configNotJson: (path: string, detail: string) => `${path} 不是合法的 JSON：${detail}`,
    configInvalid: (path: string, detail: string) => `${path} 設定格式不符：\n${detail}`,
    skillSourceMissing: (dir: string) =>
      `找不到隨套件發佈的 skill：${dir}\n這通常代表安裝不完整，請重裝 fieldproof。`,
    unknownLocale: (id: string, available: string[]) =>
      `未知的語系：${id}（可用：${available.join('、')}）`,
  },

  md: {
    titleWithRoute: (title: string, route: string) => `# ${title}（\`${route}\`）欄位對照`,
    titleWithoutRoute: (title: string) => `# ${title} 欄位對照`,
    generatedBy: (command: string, dataPath: string) =>
      `> ⚠️ **本檔由 \`${command}\` 從 \`${dataPath}\` 生成，請勿手改**`,
    generatedByCont: '> ——任何手動編輯都會在下次重跑時被覆蓋。要改內容請改 JSON 後重跑。',
    openHtml: (page: string) =>
      `> **人要驗收請開 [\`${page}.html\`](./${page}.html)**（可勾選、可篩選、可匯出問題清單）；`,
    audienceNote: '> 本 markdown 是給 LLM 讀與 `git diff` 審閱用的。',
    auditedAt: (date: string) =>
      `> 盤點日期：**${date}**（「對過程式碼」的日期，不是「驗收過」的日期）`,
    sourcesHeading: '> 盤點時讀過的原始碼：',

    overviewHeading: '## 概況',
    overviewCounts: (sections: number, fields: number, queries: number) =>
      `- **${sections} 個區塊、${fields} 個欄位**，由 **${queries} 個查詢**組成`,
    overviewPolling: (pollingQueries: number, pollingHttp: number) =>
      `- 其中 **${pollingQueries} 個查詢參與輪詢**，單次全量刷新 = **${pollingHttp} 支 HTTP**`,
    overviewLoad: (perHour: string, breakdown: string) =>
      `- 輪詢負載：每小時 **${perHour} 支**${breakdown}`,
    overviewBaseline: (base: number, conditional: number) =>
      `- **Network 對帳基準：進頁應出現 ${base} 支 request**` +
      (conditional ? `，另有 ${conditional} 支條件性請求（卡片隱藏時不會出現）` : ''),
    overviewSources: (counts: string) => `- 欄位分佈：${counts}`,
    overviewUnresolved: (n: number) =>
      `- ⚠️ **${n} 個欄位的來源未追出**，那幾列是推測而非查證，review 時請優先看它們`,
    overviewDerivedNote: [
      '> 以上數字由查詢定義推導，非手寫——加一支查詢或改一個刷新間隔，數字自己會對。',
      '> 若分頁常駐且背景仍刷新，實際負載需再乘上同時在線的分頁數。',
    ],
    intervalBreakdown: (parts: string[]) => `（${parts.join('；')}）`,
    intervalPart: (label: string, httpCount: number, perHour: string) =>
      `${label} × ${httpCount} 支 = ${perHour}`,

    queriesHeading: '## 查詢清單',
    queryTableHead: [
      '| #   | 端點 | Network 篩選 | 關鍵參數 | 刷新 | 支數 | 來源 |',
      '| --- | ---- | ------------ | -------- | ---- | ---- | ---- |',
    ],
    queryCount: (n: number) => `${n} 支`,
    conditionalSuffix: '（條件性）',
    queryNotesHeading: '**查詢註記**',
    filterNoteLabel: (note: string) => `**篩選提醒：**${note}`,
    enabledWhenAll: (condition: string) =>
      `> 全部查詢的 \`enabledWhen\`：${condition}——不成立時查詢停用。`,
    enabledWhenHeading: '> `enabledWhen`（不成立時該支查詢停用）：',
    enabledWhenItem: (ids: string[], condition: string) =>
      `> - **${ids.join('、')}**：${condition}`,

    sectionHeading: (index: number, title: string, key: string) =>
      `## ${index}. ${title} \`${key}\``,
    emptyRule: (rule: string) => `**空狀態**：${rule}`,
    fieldTableHead: [
      '| UI 欄位 | 查詢 | response 欄位 | 取得方式 | 顯示層 |',
      '| ------- | ---- | ------------- | -------- | ------ |',
    ],
    checksHeading: '**驗證檢查點**',
    fieldNotesHeading: '**欄位註記**',

    notesHeading: '## 已知落差 / 注意事項',
    noteItem: (index: number, title: string) => `${index}. **${title}**`,

    /** 佔位符：無對應資料的儲存格 */
    placeholder: '—',
    /** 分隔符集中在此，換語系時不必逐處找全形標點 */
    join: {
      params: '、',
      meta: ' ・ ',
      flags: '；',
      flagAndNote: ' —— ',
      query: ' ＋ ',
    },
    sectionMeta: (kind: string, meta: string) => `${kind}${meta ? ' ・ ' + meta : ''}`,
    metaPair: (key: string, value: string) => `${key} ${value}`,
    fieldRow: (source: string, how: string) => `**${source}**：${how}`,
    checkGroup: (label: string) => `- **${label}**`,
    checkItem: (given: string, expect: string) => `  - \`${given}\` → ${expect}`,
    fieldNote: (label: string, parts: string) => `- **${label}**：${parts}`,
    flagWithLabel: (icon: string, label: string) => `${icon} ${label}`,
    sourceCount: (label: string, count: number) => `${label} ${count}`,
    sourceCountJoin: ' ・ ',
    queryNoteItem: (id: string) => `- **${id}**：`,
    sourceItem: (source: string) => `> - \`${source}\``,
  },

  ui: {
    pageTitle: '{title} 欄位對照 · 驗收',
    heading: '{title} 欄位對照',
    generatedComment: '本檔由 `{command}` 從 {dataPath} 生成，請勿手改。要改內容請改 JSON 後重跑。',
    faviconComment:
      '空 favicon：擋掉瀏覽器對 /favicon.ico 的自動請求，讓 Network 面板保持只有零筆外部請求',
    indexTitle: '欄位對照',
    indexLead: '每個畫面上的數字，是哪支 API、什麼粒度、response 哪個欄位、直取還是前端算的。',
    indexSource: '資料來源為 {dataDir}/*.json，本頁與各頁 HTML / markdown 皆由 {command} 生成。',
    indexColPage: '頁面',
    indexColRoute: '路由',
    indexColSections: '區塊',
    indexColFields: '欄位',
    indexColQueries: '查詢',
    indexColLoad: '輪詢負載（支 HTTP）',
    indexColAudited: '盤點日',
    indexColMarkdown: 'LLM 版',
    indexQueries: '{n}（{polling} 輪詢）',
    indexLoad: '每小時 {n}',

    metaSections: '{n} 區塊',
    metaFields: '{n} 欄位',
    metaQueries: '{n} 查詢（{polling} 輪詢，單次全量 {http} 支 HTTP；每小時 {perHour} 支）',
    metaAudited: '盤點 {date}',

    progressVerified: '已驗',
    progressNoProblem: '無問題',
    progressProblem: '{n} 有問題',
    progressFiltered: '（篩選中：{n}）',

    btnReconcile: 'Network 對帳',
    btnExport: '匯出問題清單',
    btnReset: '重置',
    btnClose: '關閉',
    btnCopy: '複製',
    btnCopyFilter: '複製篩選',
    btnCopyNetworkFilter: '複製 Network 篩選',
    copyFilterTitle: '複製「{filter}」貼進 DevTools Network filter',

    searchPlaceholder: '搜尋欄位 / response / 取值方式…',
    searchAria: '搜尋',
    groupLabel: '分組',
    groupAria: '分組方式',
    groupBySection: '依區塊',
    groupByQuery: '依查詢',
    filterSection: '區塊',
    filterQuery: '查詢',
    filterSource: '取得方式',
    filterFlag: '標記',
    statusLabel: '狀態',
    statusAria: '驗收狀態',
    statusAll: '全部',
    statusUnverified: '只看未驗',
    statusProblem: '只看有問題',
    statusStale: '定義已變更',

    colField: 'UI 欄位',
    colQuery: '查詢',
    colResp: 'response 欄位',
    colExpect: '預期取值 / 顯示',
    colActual: '畫面實際值',
    colData: '資料',
    colDisplay: '顯示',
    colNote: '備註',

    sideData: '資料',
    sideDisplay: '顯示',
    markOk: '正確',
    markNg: '有問題',
    markStaleHint: '這一側的定義在上次標記後改過了，請重驗',
    respNone: '—（不來自 API）',
    expandAria: '展開細節',
    staleTagTitle: '上次標記後，這個欄位的定義在 JSON 裡改過了，請重驗',
    staleBoth: '定義已變更',
    staleData: '取值定義已變更',
    staleDisplay: '顯示定義已變更',
    checksTag: '{n} 檢查點',
    checksTagTitle: '展開可見 {n} 條驗證檢查點',
    actualPlaceholder: '畫面上看到的值',
    actualAria: '畫面實際值',
    notePlaceholder: '備註',
    noteAria: '備註',

    detailConcurrent: '併發 {n} 支',
    detailFilter: '篩選字串',
    detailEndpoint: '端點',
    detailSdk: 'SDK',
    detailEnabledWhen: '啟用條件',
    detailFilterNote: '篩選提醒：',
    detailChecksTitle: '怎麼驗（{n} 條）',
    detailChecksGiven: '給定',
    detailChecksExpect: '畫面應該',
    detailEmptyRule: '空狀態：',
    detailNoteTitle: '註記',
    detailNoApi: '此欄位不來自任何 API，由前端生成。',

    groupProgress: '{done}/{total} 已驗',
    groupNg: '{n} 有問題',
    groupEmptyInfo: 'ⓘ 空狀態',
    groupEmptyTitle: '空狀態：{rule}',
    groupNoQuery: '無查詢（前端生成）',
    groupNoQueryMeta: 'X 軸 labels、硬編單位、local UI state',
    emptyState: '沒有符合條件的欄位',

    notesHeading: '已知落差 / 注意事項',

    reconcileTitle: 'Network 對帳清單',
    reconcileLead:
      '進頁後 Network 面板應出現 {base} request（不含條件性請求與瀏覽器自身的資源請求）。',
    reconcileLoad: '其中輪詢查詢 {polling} 支，之後每小時再 {perHour} 支{breakdown}。',
    reconcileBreakdown: '（{parts}）',
    reconcilePart: '{label} × {http} 支 = {perHour}',
    reconcileColId: '#',
    reconcileColEndpoint: '端點',
    reconcileColFilter: 'Network 篩選字串',
    reconcileColCount: '支數',
    reconcileColOrigin: '來源',
    reconcileColUsedBy: '餵給',
    reconcileCount: '{n} 支',
    reconcileNoField: '不對應任何欄位',
    reconcileNoFilter: '未設定',
    reconcileConditional: '條件性請求，共 {n} 支：',

    reportHeading: '## {title} 驗收問題清單',
    reportSummary: '已驗 {done}/{total} · 有問題 {problems}',
    reportSection: '### {section} · {field}',
    reportAllPass: '全數通過，無標記為有問題的欄位。',
    reportQuery: '- 查詢：{id} `{endpoint}`（{params}）',
    reportQueryNone: '- 查詢：—（前端生成）',
    reportResp: '- response：`{value}`',
    reportExpectValue: '- 預期取值：{source} —— {how}',
    reportExpectDisplay: '- 預期顯示：{display}',
    reportActual: '- 畫面實際值：`{value}`',
    reportFailed: '- 問題：{sides} ✗',
    reportNote: '- 備註：{note}',

    toastCopied: '已複製「{text}」，貼進 Network filter',
    toastCopyFailed: '複製失敗',
    toastReportCopied: '問題清單已複製為 markdown',
    toastReportFailed: '複製失敗，請改用瀏覽器主控台',
    toastReset: '已清空驗收標記',
    confirmReset: '確定清空全部驗收標記？目前已驗 {done}/{total}，此動作無法復原。',
    warnStorage: '無法寫入 localStorage',

    /** 分隔符。ui 只能是純字串，故不像 md 那樣收在 join 子物件裡。 */
    joinList: '、',
    joinSemi: '；',
    joinMeta: ' ・ ',
  },
};
