# fieldproof 設計 spec

**日期：** 2026-08-19
**狀態：** 待審閱
**前身：** `hengs-monitor-vue-frontend` 的 `scripts/field-map/`（2,720 行，2026-08-18 落地）

---

## 1. 這是什麼

把「畫面上每個欄位的值從哪來、怎麼算、該怎麼顯示」寫成 JSON，產出兩份東西：

- **HTML** —— 給人用的逐欄位驗收介面（分組、篩選、標記資料 ✓/✗ 與顯示 ✓/✗、填實際值、存 localStorage、匯出問題清單）
- **Markdown** —— 給 LLM 讀、給 git diff 審閱

JSON 是 SSOT，兩份輸出都是生成物。

## 2. 為什麼要抽成套件

現況是 hengs 專案裡的一組 `scripts/`。第二個專案要用，只能複製過去改——改完兩份就開始各自演化，等於沒有工具，只有一份範本。

抽出的門檻很低（見 §4 耦合盤點），而價值已經被驗證過一輪：64 欄位、15 支查詢的案場主頁完整跑過。

---

## 3. 範圍界定

### 3.1 套件內

|                        |                                      |
| ---------------------- | ------------------------------------ |
| schema 定義與驗證      | zod，含跨參照檢查                    |
| 渲染                   | HTML（驗收介面）／ Markdown ／ index |
| 統計推導               | 欄位數、查詢數、HTTP 輪詢負載        |
| definition fingerprint | JSON 改動使既有 ✓ 失效               |
| i18n                   | locale 層，v1 只出 zh-TW             |

### 3.2 套件外（明確排除）

**任何「JSON 是否還符合現況程式碼」的判斷。**

包含 source drift 偵測、static trace、CodeGraph 整合、LLM 複核。

理由有二。

**其一，技術上不成立。** 前身專案實測過 CodeGraph 作為 trace engine 的可行性，取一條最常規的路徑（`battery.vue` 表格的「最大 SOC」欄，人工 ground truth 共 9 跳）：

- 符號骨架大致走得通（`useSiteBatteryData → toEssRow`、`→ getEnergyStoragesQuery → getEnergyStorages`、`BatteryEssTable → battery.vue` 這些邊都在）
- 但鏈斷在第 5 跳，正好是 UI 與資料層的接縫：`const { bessRows } = useSiteBatteryData(...)` 是解構繫結，索引只收 `const X = expr`，不收 `const { a, b } = expr`。抽驗 `useSiteName` / `useSiteDashboardData` / `useHistoryData` 的 caller 邊皆為 0，是系統性缺口而非個案
- 更根本的是，全鏈沒有任何一條邊帶「欄位」維度。同一張表的 9 個欄位會產出完全相同的 trace，資訊量等同一句 `query: "Q1"`

**其二，即使成立，它也是眾多手段之一。** git log 比對、TS Compiler API、LLM 複核都能做同一件事。把其中一種綁進套件，等於逼所有使用者裝那個工具。

### 3.3 不需要擴充點

漂移偵測不必由套件配合，因為 schema 已經有：

```ts
sources: z.array(z.string()).min(1),                                // 盤點時讀過的原始碼檔案
auditedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),                 // 盤點日
```

**JSON 本身就是 API。** 它在磁碟上、machine-readable、記了對過哪些檔案與哪天對的。外部工具讀 JSON 自己做即可，介面是資料而非程式碼，沒有版本相容問題。

同理，`fieldproof audit` 這類子指令不該存在——那會把分析工具拖回相依樹。它屬於使用端的獨立腳本。

> **注意：** definition fingerprint（`dataHash` / `displayHash`）**留在套件內**。它偵測的是「JSON 自己改了，舊的 ✓ 失效」，資料來源是 JSON 本身，不碰原始碼，與 source drift 是兩回事。

---

## 4. 現況耦合盤點

搬遷成本低於預期：

```
硬編路徑        build.ts 兩行（DATA_DIR / OUT_DIR）
對 src/ 的相依  0
執行期相依      zod（+ tsx 於開發期）
CI 隔離         已在 eslint globalIgnores，且不在根 tsconfig references
```

現有檔案：

| 檔                   | 行  | 去處                                            |
| -------------------- | --- | ----------------------------------------------- |
| `schema.ts`          | 187 | `src/schema.ts`（標籤常數移入 locale）          |
| `build.ts`           | 168 | `src/build.ts` + `src/cli.ts` + `src/config.ts` |
| `stats.ts`           | 71  | `src/stats.ts`（refetch 泛化）                  |
| `render-html.ts`     | 220 | `src/render/html.ts`                            |
| `render-markdown.ts` | 244 | `src/render/markdown.ts`                        |
| `render-index.ts`    | 114 | `src/render/index-page.ts`                      |
| `assets/app.css`     | 930 | `src/assets/app.css`                            |
| `assets/app.js`      | 786 | `src/assets/app.js`（字串外部化）               |

---

## 5. schema 變更（最小放寬）

三個欄位目前綁前身專案慣例，其餘不動。**enum（`sourceKind` / `flag` / `sectionKind` / `origin`）維持固定**，不開放自訂——沒有第二個實際使用者之前，擴充機制是猜測。

### 5.1 `refetch`：`'minutely' | 'hourly' | 'none'` → `number | 'none'`

前身的兩個具名值來自它自己的整點批次語意（`msUntilNextHour` / `msUntilNextMinute`），別的專案不會是這兩個值。改成毫秒數。

**`refetch` 只用於推導輪詢負載，不描述對齊語意。** 「對齊整點」vs「掛載後每小時」在負載統計上等價，都是 3,600,000ms；需要說明對齊行為請寫 `note`。

### 5.2 `filter`：required → optional

`filter` 是貼進 DevTools Network 面板用的單一連續子字串。它可行的前提是**查詢參數順序穩定**——前身靠 `perfectionist/sort-objects` 讓 query 物件 key 字母排序才成立，這是專案級慣例，不能預設。

連帶：

- `assertUniqueFilters` 只對有值者檢查唯一性
- HTML 的「複製 Network 篩選字串」按鈕在無值時不渲染
- Markdown 查詢表格該欄留空
- README 必須寫明前提，否則使用者會產出對不上的篩選字串

### 5.3 `route`：required → optional

假設了 SPA 有路由樣板。無值時 HTML header 與 Markdown 標題各少一行。

---

## 6. stats 泛化

現行公式：

```ts
perHour = perMinute * 60 + hourlyOnly; // 5 * 60 + 14 = 314
```

`perMinute` 的實際語意是「每分鐘刷新的那些查詢的支數」，不是真實速率——它沒有把每小時查詢攤進來。改成毫秒後若寫成真實速率，hengs 的 5 會變成 5.23，反而更難讀。

**決議：拿掉 `perMinute`，`perHour` 成為唯一頭條數字，另出間隔明細。**

```ts
perHour = Σ (3_600_000 / intervalMs) × httpCount     // 各輪詢查詢加總
byInterval: Array<{ intervalMs, queryCount, httpCount, perHour }>
```

hengs 代入：`60000` 間隔 5 支 → 300/hr；`3600000` 間隔 14 支 → 14/hr；合計 **314**，與現行輸出一致。渲染成：

```
每小時 314 支（60s × 5 支 = 300；3600s × 14 支 = 14）
```

這是刻意的輸出變更，是遷移時唯一預期的生成物差異（見 §10）。其餘統計（`baseHttpCount` / `conditionalHttpCount` / `pollingHttpCount` / `bySource` …）不變。

---

## 7. i18n

v1 只實作 zh-TW，但介面先抽出來，日後補語系不必重構。

### 7.1 涵蓋範圍

| 抽                                                                    | 不抽                                           |
| --------------------------------------------------------------------- | ---------------------------------------------- |
| HTML 介面字串（app.js 約 899 字 + render-html 約 352 字）             | schema 的 JSDoc 註解——給開發者讀，非使用者可見 |
| Markdown 標題與說明（約 502 字）                                      | 使用者自己寫在 JSON 裡的內容                   |
| build 期錯誤訊息                                                      |                                                |
| `SOURCE_LABELS` / `ORIGIN_LABELS` / `FLAG_META`（現在在 `schema.ts`） |                                                |

### 7.2 結構

```ts
interface Locale {
  id: string;
  source: Record<SourceKind, string>;
  origin: Record<Origin, string>;
  flag: Record<Flag, { icon: string; label: string }>;
  ui: Record<UiKey, string>; // 注入瀏覽器
  md: Record<MdKey, string>;
  err: Record<ErrKey, (ctx: never) => string>; // 需插值，故為函式
}
```

型別上以 `Record<K, …>` 保證無漏 key。

### 7.3 瀏覽器端

`app.js` 是 786 行手寫 DOM，字串目前硬編在裡面。HTML 已經內嵌了資料 payload，locale 比照注入：

```js
window.__FIELDPROOF_I18N__ = {
  /* locale.ui */
};
```

`app.js` 改讀查表。**這是 i18n 工作量的主體**，也是唯一需要動到瀏覽器端程式的部分。

---

## 8. 套件設計

### 8.1 目錄

```
src/
  cli.ts              # 參數解析 → build()
  config.ts           # 設定檔探尋與驗證
  index.ts            # programmatic API + 型別再匯出
  build.ts            # 載入 → 驗證 → 渲染 → 寫入 / --check
  schema.ts           # zod schema
  stats.ts
  assets-dir.ts       # 單一 ASSETS_DIR 解析點
  render/
    html.ts
    markdown.ts
    index-page.ts
  locales/
    types.ts
    zh-TW.ts
  assets/
    app.css
    app.js
tests/
docs/
```

### 8.2 資產解析

現行用 `new URL('./assets/', import.meta.url)` 於執行期讀檔並**內嵌進 HTML**。維持此作法，但收斂到單一 `assets-dir.ts`；建置時把 `src/assets/` 複製到 `dist/assets/`。因為兩側都存在同名相對路徑，`src` 與 `dist` 用同一行程式即可解析，不需打包器介入。

```json
"build": "tsc && cp -R src/assets dist/assets"
```

### 8.3 設定檔

`fieldproof.config.json`，自 cwd 向上探尋；`--config <path>` 可覆寫。

```json
{
  "dataDir": "docs/field-map/data",
  "outDir": "docs/field-map",
  "locale": "zh-TW",
  "outputs": ["html", "markdown", "index"]
}
```

選 JSON 而非 `.ts`，是為了免去執行期載入 TypeScript 的相依（jiti / tsx）。v1 不支援 locale 覆寫，需要時再說。

### 8.4 CLI

```bash
fieldproof build              # 驗證並生成
fieldproof build --check      # 只驗證並比對；不同步則非零退出
fieldproof build --config <p>
```

### 8.5 Programmatic API

```ts
export { build } from "./build";
export type { Field, FieldMapPage, Query, Section /* … */ } from "./schema";
```

v1 僅此。渲染函式不對外，避免過早凍結介面。

### 8.6 專案慣例

沿用既有個人專案作法：pnpm、ESM（`"type": "module"`）、TypeScript、tsx 開發、vitest 測試、tsc 建置到 `dist/`、MIT。

---

## 9. 測試

現行零測試（`scripts/**` 刻意排除於 CI）。套件不能這樣。

| 測什麼                                                                          | 為什麼                                    |
| ------------------------------------------------------------------------------- | ----------------------------------------- |
| schema 驗證：合法 / 非法資料                                                    | 錯誤訊息要指得出頁 / 區塊 / 欄位路徑      |
| 交叉驗證：重複 `section.key`、重複 `field.id`、未定義 query 參照、重複 `filter` | 這四條是資料正確性的護欄                  |
| stats：以 hengs `site-dashboard.json` 為 fixture，驗 `perHour === 314`          | 唯一能證明泛化沒算錯的方法                |
| 決定性：連跑兩次輸出 byte-identical                                             | `--check` 的正確性完全依賴此性質          |
| `--check`：竄改生成物後應非零退出                                               |                                           |
| locale：key 完整性                                                              | 型別已保證，補一個 runtime 測防 `as` 逃逸 |

不測：HTML 的視覺呈現、CSS class 字串、瀏覽器端互動細節。

---

## 10. 遷移 hengs

套件完成後立即切換，這是唯一能驗證抽象是否站得住的方法。

1. 以 `file:` 或 `pnpm link` 引入（尚未發 npm）
2. 資料遷移：`"refetch": "minutely"` → `60000`、`"hourly"` → `3600000`（機械替換）
3. 刪除 `scripts/field-map/`
4. `package.json`：`"field-map": "fieldproof build"`
5. 新增 `fieldproof.config.json`
6. 更新 `AGENTS.md` 的欄位對照段落

**驗收標準：**

- `perHour` 仍為 **314**，`queryCount` 15、`sectionCount` 11、`fieldCount` 64 皆不變
- 生成物差異**僅限** §6 所述的間隔明細呈現變更；出現任何其他差異即代表抽出過程有回歸
- `pnpm field-map --check` 通過

---

## 11. 非目標

|                             | 理由                                  |
| --------------------------- | ------------------------------------- |
| trace / CodeGraph 整合      | §3.2 實測不成立，且屬使用端而非套件   |
| `fieldproof audit` 子指令   | 會把分析工具拖回相依樹                |
| 把 HTML 介面改寫成框架      | 786 行手寫 DOM 已可用；重寫是獨立議題 |
| 自訂 enum / schema 擴充機制 | 沒有第二個實際使用者前是猜測          |
| 完整多語系                  | v1 只出 zh-TW，介面先留               |
| 發佈 npm                    | v0.1 先以 dogfooding 驗證，通過再發   |

---

## 12. 工時

| 項                                  | 天        |
| ----------------------------------- | --------- |
| 抽出 + config + CLI + 打包          | 1         |
| schema 放寬 + stats 泛化            | 0.5       |
| locale 抽層（含 app.js 字串外部化） | 1         |
| 測試                                | 0.5–1     |
| 遷移 hengs + 驗收                   | 0.5       |
| **合計**                            | **3.5–4** |

高於初估的 1.5–3 天，差額來自 locale 層與測試——前者是本次決議新增，後者現行專案完全沒有。

---

## 13. 待決

- **npm 套件名 `fieldproof` 未占用**（2026-08-19 實測 404），但發佈前應再確認一次
- hengs 的 `docs/field-map/` 目錄名是否跟著改為 `docs/fieldproof/`。localStorage 的驗收狀態 key 為 `page/section.key/field.id`，不含目錄名，故改名**不會**讓既有驗收狀態失效；成本只在更新 `AGENTS.md` 與 `.prettierignore` 的路徑
