# AGENTS.md

給接手此專案的人與 agent。README 是對使用者的說明；本文是**為什麼會長這樣**。

---

## 1. 這個專案在解決什麼

前端畫面上的每個數字，背後都有一條鏈：

```
API → response 欄位 → 前端取值 / 聚合 / 換算 → 格式化 → 畫面
```

要驗證「這個數字對不對」，得把整條鏈走一遍。一頁六十個欄位就是六十趟，而且每趟都得
在元件、composable、mapper、formatter 之間跳來跳去。更糟的是這個知識**只存在於讀過
程式碼的那個人腦中**，下次要驗、或換人驗，成本一模一樣。

fieldproof 把這條鏈壓縮成一行結構化描述，然後產出兩份東西：

| 產出     | 讀者              | 用途                                                      |
| -------- | ----------------- | --------------------------------------------------------- |
| HTML     | 人                | 逐欄位驗收介面。開著它、對著 DevTools Network，一欄一欄勾 |
| Markdown | LLM / code review | 比讀 JSON 省 token；`git diff` 能一眼看出某欄位的來源改了 |

**核心價值不是減少文件數，而是：用一份結構化維護成本，換掉大量的 code archaeology
與 context switching。**

---

## 2. 核心理念

### 2.1 JSON 是唯一事實來源，兩份輸出都是生成物

改內容只改 JSON，重跑 build。生成物不得手改——`--check` 會抓。

### 2.2 決定性輸出是地基

輸出**不得**含時間戳、隨機值、或任何依環境而異的內容。`--check` 比對的是位元組，
一旦輸出不決定性，它就會在 CI 上無故失敗，「生成物與資料同步」的保證隨之瓦解。

任何新功能若想引入「產生時間」「機器名稱」之類的內容，先想清楚它會不會殺掉 `--check`。

### 2.3 宣告 ≠ 驗證，兩者都要，但分開

```
JSON（宣告：這個欄位「應該」怎麼來、怎麼顯示）
  ↓
HTML（人實際打開畫面核對）
  ↓
localStorage（驗證結果：資料 ✓/✗、顯示 ✓/✗、畫面實際值、備註）
```

宣告在 git 裡、可 review；驗證結果在瀏覽器裡、屬於個人的一次驗收動作。兩者不混。

### 2.4 「定義改了、舊的勾還在」是本專案的責任

每個欄位算**兩份**指紋：

| 指紋          | 涵蓋                                       | 意義         |
| ------------- | ------------------------------------------ | ------------ |
| `dataHash`    | `query`、`resp`、`source`、`how`、`checks` | 取值方式改了 |
| `displayHash` | `display`、`checks`                        | 顯示規則改了 |

只改 `display` 時，「資料抓得對不對」的結論仍然有效，不該一起失效——這是分兩份的唯一
理由。改 `label` / `note` / `flags` 則兩側都不動，因為它們不改變任何待驗證的行為。

`checks` 兩側都算：檢查點改了代表驗法變了。

### 2.5 「JSON 是否還符合現況程式碼」**不是**本專案的責任

這是刻意的邊界，不是還沒做。

漂移偵測有很多做法——比對 `sources` 列的檔案有沒有動過、跑靜態分析、請 LLM 複核。
把任何一種綁進來，都會逼所有使用者裝那個工具。而資料檔就在磁碟上、machine-readable、
已經記了 `sources` 與 `auditedAt`，外部工具自己讀就好。

**JSON 就是 API。介面是資料而不是程式碼，不會有版本相容問題。**

推論：不要加 `fieldproof audit` 這類子指令，那會把分析工具拖回相依樹。

### 2.6 只有工具真的需要理解的資訊才 schema 化

已 schema 化的：`page`、`section.key`、`field.id`、query 參照、`source`、`flags`、
`refetch`、`section.kind`、`origin`。因為 generator 真的要用它們來分組、篩選、
計算統計、產生穩定識別、驅動視覺樣式、做驗證。

刻意維持自由文字的：`how`、`display`、`emptyRule`、`note`。它們的目標是**給人理解**。

把 `display: "null → —；數值加 %"` 改成 `{ null: "—", suffix: "%" }` **不會降低語意
漂移**——實作改了而 JSON 忘了同步，字串會漂移，物件一樣會漂移。結構化真正帶來的是
machine query、自動產測試案例、declared/observed 機器比對；**沒有這些實際 use case
之前，不要為了形式而結構化。**

---

## 3. 架構

```
src/
  cli.ts            參數解析 → build()。含 isDirectRun 守衛，測試才能 import 純函式
  config.ts         設定檔探尋 / 驗證 / 路徑解析；RenderContext 定義
  build.ts          載入 → 驗證 → 渲染 → 寫入（或 --check 比對）
  schema.ts         zod 資料契約，唯一定義處
  stats.ts          從查詢定義推導負載統計
  format.ts         間隔 / 速率 / 佔位符代入
  index.ts          programmatic API
  render/
    html.ts         驗收介面（單一自含 HTML）
    markdown.ts     LLM / diff 版
    index-page.ts   頁面清單
  locales/
    zh-TW.ts        參考語系——Locale 型別由它推導
    types.ts
    index.ts        註冊表
  assets/
    app.css         驗收介面樣式
    app.js          驗收介面行為（無框架，手寫 DOM）
tests/              vitest
examples/           示範資料與生成物，同時是煙霧測試
```

資料流：

```
*.json → zod 驗證 → 跨參照驗證 → computeStats → render × 3 → 寫檔 / 比對
```

---

## 4. 設計決策與理由

逐條記錄「為什麼是這樣」與「為什麼不是那樣」，避免日後有人善意地改回去。

### 4.1 `refetch` 是毫秒，不是具名值

具名值（`minutely` / `hourly`）綁死了特定專案的刷新語意，別的專案不會剛好是那幾種。

`refetch` **只描述頻率，不描述對齊方式**——「對齊整點重取」與「掛載後每小時重取」
在負載統計上等價，皆為 `3_600_000`。需要說明對齊行為請寫在該查詢的 `note`。

### 4.2 統計以 `perHour` 為準，不留 `perMinute`

曾經有個 `perMinute`，語意是「每分鐘刷新的那些查詢的支數」——那不是真實速率，它沒把
每小時查詢攤進來。改成毫秒後若寫成真實速率會變小數，更難讀。

現在只有 `perHour = Σ (一小時 ÷ 間隔) × 支數`，外加 `byInterval` 明細。

### 4.3 `filter` 是可選的

`filter` 是貼進 DevTools Network 面板的單一連續子字串。它可行的前提是**查詢參數順序
穩定**——需要專案級的 lint 規則（如 `perfectionist/sort-objects`）才成立，不能當作
所有專案的預設。沒有這個保證的專案就省略此欄。

### 4.4 enum 固定，不開放自訂

`source` / `flag` / `sectionKind` / `origin` 是固定 enum。開放自訂會讓 HTML 的顏色
chip、篩選器、markdown 分類全部要改成動態的。

**在有第二個真實使用者提出需求之前，擴充機制是猜測。** 真的需要時再說。

### 4.5 `field.id` 只需 section 內唯一

驗收狀態的 key 是 `section.key/field.id`。不同 section 用相同 id 是合法的。

`id` 與 `section.key` 是**穩定識別**——改名會讓已標記的驗收狀態錯位。schema 註解有
寫，改動前先確認。

### 4.6 驗收介面是手寫 DOM，不用框架

`app.js` 786 行、零相依。理由：

- 生成的 HTML 必須**零外部請求**（含空 favicon，就是為了讓 Network 面板保持乾淨）。
  這個介面本來就是拿來對照 Network 面板的，自己發請求會污染要看的東西
- 內嵌框架會讓每份生成物膨脹，而生成物是要 commit 進 git 的

代價是渲染邏輯得自己管。已知的坑：**標記欄位時不要整個 tbody 重畫**，否則使用者正在
打字的 input 會失焦——`patchRow()` 就是為此存在的局部更新。

### 4.7 語系抽層，但 `ui` 必須可 JSON 序列化

`ui` 區段會被 `JSON.stringify` 進 HTML 供瀏覽器讀取。**放函式進去會在序列化時靜默
消失**，介面就出現空字串而非報錯。所以 `ui` 一律純字串，插值以 `{name}` 佔位，
`format.ts` 與 `app.js` 各有一份同規則的 `fmt()`。

其餘區段（`md` / `cli` / `errors` / `interval`）跑在 Node，直接用函式即可。

`zh-TW.ts` 同時是**參考語系**：`Locale` 型別由它推導，新增語系少一個 key 就編譯不過，
不必另外維護 key 清單。

`config.ts` 與 CLI 的 usage 走 `DEFAULT_LOCALE`——它們在讀到設定之前就可能出錯，
當下還不知道要用哪個語系。

### 4.8 錯誤訊息要指得出位置

資料是人手寫的 JSON，出錯是預期路徑而非例外。錯誤訊息必須指出**哪個檔、哪個區塊、
哪個欄位**，否則使用者得自己翻 JSON 找。CLI 只印訊息，不印 stack trace。

### 4.9 `enabledWhen` 依條件值分組

實際資料多半是「大部分查詢共用同一條件，少數幾支不同」。逐支列出會刷出一整片重複行，
反而淹沒真正不同的那一支；一律當成共通條件則會謊報。故依值分組。

---

## 5. 開發慣例

### 語言

| 對象                             | 語言                         |
| -------------------------------- | ---------------------------- |
| README（對使用者）               | 英文                         |
| 本文、程式碼註解、commit message | 繁體中文                     |
| 生成物介面文字                   | 由 locale 決定，目前僅 zh-TW |

### 生命週期

```bash
pnpm dev        # tsx src/cli.ts
pnpm build      # tsc -p tsconfig.build.json && cp -R src/assets dist/assets
pnpm test       # vitest run
pnpm typecheck  # tsc --noEmit（含 tests/）
pnpm check      # typecheck + test，提交前必跑
pnpm format     # prettier --write .
pnpm example    # 重新產生 examples/ 生成物
```

### TypeScript

- ESM（`"type": "module"`）+ `moduleResolution: NodeNext` → **相對 import 必須帶
  `.js` 副檔名**，否則發佈後在 Node 下解析不到
- `strict` + `noUncheckedIndexedAccess`
- `tsconfig.json` 給編輯器與 typecheck 用（含 `tests/`，`noEmit`）；
  `tsconfig.build.json` 才是建置用（只含 `src/`）

---

## 6. 測試哲學

### snapshot 在這裡是對的

一般會說「不要測逐字輸出，太脆」。**本專案相反**：逐字輸出就是契約——`--check` 比對
位元組、消費端把生成物 commit 進 git。任何輸出變動都應該是有意的，snapshot 的作用
就是逼它現形。

改動 renderer 時的正確流程：改 → 跑測試 → **看 snapshot diff 是不是你要的** →
`pnpm test -u` 更新 → 把差異寫進 commit message。

不要無腦 `-u`。

### 該測什麼

- schema 與跨參照驗證（重複 id、未定義 query 參照、重複 filter…）
- 統計推導的算式
- 設定探尋與路徑解析
- 建置決定性、`--check` 的正反案例
- renderer 的逐字輸出 + 針對性斷言（snapshot 不會解釋意圖，斷言才會）
- 佔位符回歸：渲染結果不得殘留 `{name}`——打錯變數名會當場現形
- locale 的 `ui` 必須全為字串、JSON 往返不變

### 不要測

- CSS class 字串、顏色
- 瀏覽器端互動細節（那要 e2e，目前沒有）

---

## 7. 已知陷阱

踩過的，別再踩。

| 陷阱                               | 後果                                                                  | 對策                                                                      |
| ---------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| prettier 格式化 `.snap`            | 改掉被比對的內容，測試假失敗                                          | `.prettierignore` 已擋                                                    |
| prettier 格式化 `examples/` 生成物 | **`--check` 直接失敗**                                                | `.prettierignore` 已擋                                                    |
| `escapeJson` 裡的 U+2028 / U+2029 | 用字面字元寫，會被編輯器 / heredoc / 複製貼上吃成普通空白，然後把所有空格都替換掉 | 一律寫成反斜線逸出序列（`\u2028`），不要貼字面字元 |
| `assets/` 沒進 `dist/`             | 發佈後執行期讀不到 css/js                                             | `build` 有 `cp -R` 步驟；`src/` 與 `dist/` 同名相對路徑才能共用同一行解析 |
| `cli.ts` 載入即執行                | 測試 import 會誤觸發 main()                                           | `isDirectRun()` 守衛                                                      |
| 標記欄位時整個 tbody 重畫          | 使用者正在打字的 input 失焦                                           | 用 `patchRow()` 局部更新                                                  |

---

## 8. 明確的非目標

| 不做                                | 理由                           |
| ----------------------------------- | ------------------------------ |
| 判斷 JSON 是否符合現況程式碼        | §2.5，刻意的邊界               |
| `fieldproof audit` 之類的分析子指令 | 會把分析工具拖回相依樹         |
| 把驗收介面改寫成框架                | §4.6                           |
| 自訂 enum / schema 擴充機制         | §4.4，沒有第二個使用者前是猜測 |
| 把 `display` / `how` 拆成 DSL       | §2.6，結構化不會防漂移         |
