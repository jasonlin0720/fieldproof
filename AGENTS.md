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

**但「什麼時候該回頭盤點」不能沒有人回答。** 雙指紋（§2.4）只擋得住一個方向——JSON 改了、
舊的勾還在；反方向的「程式碼改了、JSON 還在」原本沒有任何東西會提醒，`auditedAt` 與
`sources` 記在檔裡卻沒有任何時機會去讀它。而 SKILL.md 自己就寫著：JSON 一旦與程式碼脫節，
人會照著一份過期的宣告逐欄打勾，那比沒有工具更糟。

故 `drift.ts` 補上成本最低的那一半：問 git「這些 `sources` 在 `auditedAt` 之後被 commit
動過嗎」。它與上面那條邊界不衝突，因為：

- **不需要新相依**：消費端必然有 git（生成物要 commit、`--check` 要在 CI 跑）。上面反對的
  是靜態分析與 LLM，不是 `git log`。
- **不判斷內容**：它回答「該不該重新盤點」，不回答「JSON 對不對」。判斷仍然是人的。
- **不進生成物**：純 CLI 提示，`--check` 的決定性（§2.2）不受影響，退出碼也不受影響——
  純格式化的 commit 會誤報，誤報不該讓 CI 紅。

缺 git（沒裝、不在 repo 裡、repo 還沒有 commit）時安靜地沒有提示，不是報錯。

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
  drift.ts          問 git：`sources` 在 `auditedAt` 之後動過沒有。見 §2.5
  format.ts         間隔 / 速率 / 佔位符代入（含 {n|one|other} 複數）
  index.ts          programmatic API
  skill.ts          把隨套件發佈的 skill 複製到消費端
  render/
    html.ts         驗收介面（單一自含 HTML）
    markdown.ts     LLM / diff 版
    index-page.ts   頁面清單
  locales/
    zh-TW.ts        參考語系——Locale 型別由它推導
    en.ts
    types.ts
    index.ts        註冊表
  assets/
    app.css         驗收介面樣式
    app.js          驗收介面行為（無框架，手寫 DOM）
skills/fieldproof/  隨套件發佈的 skill：教 agent 寫資料檔。見 §4.10
                    references/data-format.md 是**唯一一份**格式參考，README 與
                    docs/ 都指向它——兩份會漂移，那正是本專案在防的事
docs/workflow.md    驗收流程：怎麼用生成的 HTML
tests/              vitest。locale-guard 是介面文字的護欄、review-ui 是驗收介面的
                    行為契約、skill.spec 是 skill 的漂移護欄，均見 §6。drift.spec 會
                    真的 git init 一個臨時 repo，用固定 commit 日期驗證提示
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

`app.js` 1131 行、零相依。理由：

- 生成的 HTML 必須**零外部請求**（含空 favicon，就是為了讓 Network 面板保持乾淨）。
  這個介面本來就是拿來對照 Network 面板的，自己發請求會污染要看的東西
- 內嵌框架會讓每份生成物膨脹，而生成物是要 commit 進 git 的

**CDN 版框架是這裡最糟的選項**，不是折衷。它把 bundle 搬到別人家，卻換來一個外部請求——
正好污染這個介面唯一要看的東西——外加離線 / 內網失效、CDN 掛掉時已 commit 的生成物一起
變磚、CSP 環境被擋。

打包 inline 則技術上可行（零外部請求不受影響），代價是實測出來的：

|                                                            | 位元組     |
| ---------------------------------------------------------- | ---------- |
| 手寫 `app.js`（未 minify，即現況）                         | 42.1KB     |
| 手寫 `app.js`（若 minify）                                 | ~18KB      |
| **功能為零**的 Vue app（runtime-only、tree-shake、minify） | **54.3KB** |

一個什麼都還沒做的 Vue app 就比整份手寫版大。而 §4.16 的重複成本會跟著乘上頁數。

還有一條比體積更硬的：**生成物的位元組會綁在 Vue 與 bundler 的版本上**。現在 `app.js`
只由自己決定，換成 bundle 之後 patch 版一動，所有頁面的 `--check` 就在 CI 上全紅——
這與 §4.7.1 拒絕 `Intl.PluralRules` 是同一個理由，而 npm 相依動得比 ICU 快得多。

重估的時機是介面複雜到局部更新手寫不動（排序、虛擬捲動、多層巢狀展開），或 §4.16 那個
「產生但不 commit」的軸做出來了——後者一旦成立，體積與 diff 可讀性兩條論據會同時消失。

代價是渲染邏輯得自己管，而**任何整個 tbody 重畫都會抹掉使用者當下的狀態**：輸入焦點、
文字選取、捲動位置。這條踩過兩次——先是標記（input 失焦），後是展開明細（複製 response
路徑時選到一半被抹掉）。所以凡是只影響單一列的操作，一律局部更新：`patchRow()` 管標記，
`toggleExpand()` 管展開，兩者都不呼叫 `render()`。

同源的一條：**列身不可點**。整列可點的話，拖曳選取與雙擊選字都會被當成展開意圖——兩者的
mousedown / mouseup 都落在同一列，瀏覽器照樣發 `click`，事後擋不掉。展開只由第一欄的鈕
觸發，該鈕以絕對定位撐滿整個儲存格來補回點擊面積。

**但只有那一顆鈕可點，代價是每展開一列就要把手移到最左邊一次。** 補回來的方式是讓帶
tooltip 的 chip / tag（`.qchip`、`.field-flags`、`.checks-tag`、`.stale-tag`）也帶
`data-expand`。它們安全的理由與列身不同：**它們是標籤而不是要複製的內文**，沒有人會去拖
選一個 flag 圖示；而 `cursor: help` 本來就表明「這裡有更多資訊」，展開明細正是那些資訊。
欄位名稱 `.field-label` 維持不可點——那正是最常被複製的那一段。

推論：`toggleExpand()` 更新鈕的外觀時要用 `.expand` 而不是 `[data-expand]`，否則等於把
外觀更新綁在欄位排列順序上。`staleTagHtml()` 由 `patchRow()` 重寫，漏掉 `data-expand`
就會只有它不能點——測試鎖住了這條。

### 4.7 語系抽層，但 `ui` 必須可 JSON 序列化

`ui` 區段會被 `JSON.stringify` 進 HTML 供瀏覽器讀取。**放函式進去會在序列化時靜默
消失**，介面就出現空字串而非報錯。所以 `ui` 一律純字串，插值以 `{name}` 佔位，
`format.ts` 與 `app.js` 各有一份同規則的 `fmt()`。

其餘區段（`md` / `cli` / `errors` / `interval`）跑在 Node，直接用函式即可。

`zh-TW.ts` 同時是**參考語系**：`Locale` 型別由它推導，新增語系少一個 key 就編譯不過，
不必另外維護 key 清單。

`DEFAULT_LOCALE` 只給「還不知道語系」的時機用：CLI 的 usage、參數解析錯誤、
`config.ts` 的載入失敗。**設定讀完之後一律改用 `getLocale(config.locale)`**——
`cli.ts` 曾經整支都寫死 `DEFAULT_LOCALE`，加了 `en` 才發現 CLI 輸出永遠是中文。

### 4.7.1 複數寫在字串裡，不用 `Intl.PluralRules`

`ui` 不能放函式，複數規則只能進字串本身：`{n|singular|plural}`，`fmt()` 依 `n === 1`
二選一。不規則變化（query → queries）也蓋得住，因為兩形態都是字面寫出來的。

**不用 `Intl.PluralRules` 是為了保住 §2.2 的決定性。** 凡是走 `Intl.*` 的格式化，
輸出綁在 Node 內建的 ICU 版本上——ICU 72（Node 18.13+）就把 `en-US` 時間 AM/PM 前的
空白從 U+0020 換成 U+202F，全世界一票 snapshot 測試當場爆掉。生成物要逐位元組比對、
要 commit 進 git，CI 換個 Node minor 版就全紅、而且錯得莫名其妙。

兩形態的規則簡單到不值得為它賭掉這個性質。真的遇到需要三形態以上的語系再說。

### 4.7.2 不引 i18n 套件

考慮過 i18next / @formatjs / typesafe-i18n / Lingui，全部不採用：

- **決定性**：走 `Intl.*` 的方案有上面那個風險。
- **型別安全會退步**：現在 `md.enabledWhenItem(ids, condition)` 是 typed function，
  參數錯了 `tsc` 當場擋；換成 `t('key', { ... })` 之後 key 與變數名都只有 runtime 才知道，
  得再引一層 codegen 才補得回來。
- **`ui` 要進瀏覽器**：任何 runtime library 都得跟著 inline 進生成物，違反 §4.6。

真正該解的是「**有沒有人繞過 locale 硬編**」與「**有沒有死鍵**」，而那兩件事套件都
解不了——見 §6 的 locale 護欄，20 行測試就夠，相依樹不動。

### 4.7.3 `schema.ts` 的訊息刻意是英文

zod 自身的預設訊息（`Too small`、`Invalid input`…）本來就是英文，而 schema 的自訂訊息
會與它們並列出現在同一份 `errors.invalidPage` detail 裡。只翻其中兩則會變成中英夾雜。

schema 是模組級常數，取不到設定，接不了 locale。要真正本地化得改用 zod 的 parse-time
error map，在有第二個實際需求之前不做。

### 4.8 錯誤訊息要指得出位置

資料是人手寫的 JSON，出錯是預期路徑而非例外。錯誤訊息必須指出**哪個檔、哪個區塊、
哪個欄位**，否則使用者得自己翻 JSON 找。CLI 只印訊息，不印 stack trace。

### 4.10 跨頁通用規則由 skill 承載，不由生成物指路

生成物曾經無條件連向同目錄的 `README.md`（原專案放跨頁通用規則的地方）。那是把消費端的
檔案佈局寫死進工具裡——`examples/` 自己就沒有那個檔，死連結。

這類知識（回應 envelope、空值退場、數字格式）本來就不該由生成物轉述，它的讀者是**寫
資料檔的人或 agent**，不是驗收的人。所以改由 `skills/fieldproof/` 承載：專案特有的規則
由消費端自己往 skill 裡補，通用的寫法則隨套件發佈。

**發佈方式選了 `fieldproof skill --install`，不是 plugin 也不是 postinstall：**

- agent 只從 `.claude/skills/`、`~/.claude/skills/` 與 plugin 探尋，不看 `node_modules/`，
  所以檔案一定得落地
- 另開 plugin marketplace repo 會讓 skill 與套件版本脫鉤——skill 教的格式必須跟著
  schema 走，脫鉤等於保證漂移
- postinstall 會在使用者沒同意的情況下寫進他的 `.claude/`，那是他的設定目錄
- 複製而非 symlink：symlink 在 Windows 要權限，且升級時會靜默換內容；複製至少讓
  `git status` 把變更顯示出來

推論：**skill 的格式參考不得與 `schema.ts` 漂移**，否則 agent 會產出不合法或缺漏的 JSON
而沒有任何東西抱怨。`tests/skill.spec.ts` 走過 zod schema 逐一比對，範例也實際 parse 一次。

### 4.11 `conditional` 與 `enabledWhen` 不重疊，別合併

看起來像是同一件事的兩種寫法，其實回答不同問題：

| 欄位          | 問題                                    | 誰能判斷                   |
| ------------- | --------------------------------------- | -------------------------- |
| `enabledWhen` | 這支查詢**在什麼條件下才會跑**          | 人。它是散文，工具求不了值 |
| `conditional` | **進頁當下**它會不會出現在 Network 面板 | 人                         |

一支閘門是「已登入」的查詢有 `enabledWhen`，但**不是** conditional——驗收的人本來就登入
著，那支請求確實會發，該算進「進頁應出現 N 支」的基準。刪掉 `conditional` 等於刪掉這個
數字唯一的資訊來源。

反向則恆成立：`conditional: true` 一定要說得出 `enabledWhen`，build 會擋。否則對帳清單
會列出一個查詢 id 卻說不出它何時才發，盯著 Network 面板的人無從判斷。

（本規則加上去的當天就抓到 `examples/` 自己的 Q5 犯了這條。）

### 4.12 `resp` 用 `null`，不用哨兵字串

「這個欄位不來自任何 API」曾經寫成 `resp: '—'`。破折號是**顯示層**的東西，寫進資料的
後果是三個地方各自比對同一個哨兵：`markdown.ts` 拿 `locale.md.placeholder` 比、`app.js`
拿字面 `'—'` 比、schema 註解寫死。換語系或改 placeholder，三邊立刻分岔。

改成 `null` 之後沒有哨兵要同步，顯示什麼交給 locale——那本來就是它的職責。

**`resp` 仍然必填**：改成 optional 會讓「漏填」與「確認過沒有」變得無法區分，前者會靜默
渲染成「不來自 API」。`null` 是一個答案，省略是一個錯誤。

配套：`'—'` 是合法的非空字串，schema 擋不下來，會被當成一個名為 `—` 的 response 路徑
靜默通過——比報錯更糟。故 build 另有一條針對性檢查，指路到 `null`。

### 4.13 markdown 不重印已經有的東西

曾經有一張「後端算好 vs 前端算的」兩欄速查表，列出每個欄位。移除了，兩個理由：

- **重複**：每個欄位的 `source` 前面的區塊表格就有。11 個欄位的頁面，那張表佔全文 14%；
  60 個欄位就是 60 行。這份 markdown 的賣點是比讀 JSON 省 token。
- **兩欄以索引配對會誤導**：左欄第 i 列與右欄第 i 列毫無關係，但表格形式強烈暗示有。
  讀者是 LLM，表格列的並置正是它會拿來推論的東西。

真正推導出來的只有「欄位分佈」那一行，併進「概況」——其他推導數字都在那。人要切這個
維度，HTML 的「取得方式」篩選器本來就在。

### 4.14 生成物帶固定標記，用來認領自己的產出

`GENERATED_MARKER`（`fieldproof:generated`）出現在每份生成物裡。

理由是孤兒偵測：資料檔刪掉之後生成物會原地留著，`--check` 過去不會抱怨，於是有人開了那份
HTML 就對著一個已經不存在的頁面逐欄打勾。要清理就得分辨得出哪些檔案是自己產出的——
使用者放在同一個 `outDir` 的手寫文件不該被認領。

標記是固定字串而非語系文字：換語系或改 `command` 都不該影響辨識。

**偵測到孤兒只回報，不自動刪。** 那些檔案多半已經 commit 進 git，刪不刪是使用者的決定；
`--check` 會因此非零退出，訊息直接列出路徑。

### 4.9 `enabledWhen` 依條件值分組

實際資料多半是「大部分查詢共用同一條件，少數幾支不同」。逐支列出會刷出一整片重複行，
反而淹沒真正不同的那一支；一律當成共通條件則會謊報。故依值分組。

### 4.15 `unresolved` flag：資料要說得出「這條鏈沒追出來」

欄位上**每一個 key 都是斷言**：`source` / `how` / `display` 全部必填，六個 `source` 值也
全是肯定句，沒有一個代表「我不知道」。skill 明講「不要編造」，但 schema 不允許誠實——
追不出來的欄位只能被迫寫一個看起來確定的答案。

後果是六十欄的表裡，猜的那幾格與查證過的那幾格長得一模一樣。**那等於把 code archaeology
換成一份假裝確定的宣告**，比沒有宣告更糟：驗收的人會對著它打勾。

原本的替代方案是 `fragile` + `note`，但 `fragile` 的定義是「能動，但依賴脆弱的東西」，
與「我沒追出來」不是同一件事；skill 另一條退路「在回覆裡說」則是一次性的，JSON 才是留下來的。

**配套是篩選器而不只是圖示**：角落一個 ❓ 在六十欄裡等於沒有。故 HTML 新增 flag 多選
篩選器（沿用既有的 `buildMulti`），頁面沒有任何 flag 時整個控制項不渲染——空面板是死 UI。

flag 篩選器**不併進 Status**：Status 是驗收狀態（人的標記），flag 是宣告的屬性，
併在一起會踩掉 §2.3 的分界。

### 4.15.1 沒有提示 ≠ 沒有變動

漂移提示只問 git「這些檔案動過嗎」，而 git 只認得**找得到的路徑**。`sources` 以設定檔
所在目錄為基準；基準寫錯時 git 查不到任何東西，於是安靜地沒有輸出——而讀的人會把沒有
輸出讀成「沒有變動」。這正是這個功能要防的失敗模式，卻由它自己製造。

所以找不到的來源檔要單獨列出來，並明說那些頁面**不會**有變動提示。它同時抓到另一件事：
來源檔被改名或刪除——那是比「被修改」更強的重新盤點訊號。

推論：`examples/` 底下有真的 `src/`。一份 `sources` 指向不存在檔案的範例，等於在教人
「路徑不必解析得到」。

### 4.16 HTML 一定得進 git，這是已知限制

`--check` 判缺檔為 stale，所以生成物必須 commit。想只 commit markdown 走不通：既有的 HTML
帶著 `GENERATED_MARKER`、又不在 `outputs` 的預期清單裡，會被 `findOrphans` 當成孤兒報出來。

規模上的意義：每頁都內嵌一份完整的 `app.js` + `app.css`，實測約 **62.2KB**（0.1.0 時是
47.6KB，介面功能長出來就會漲）。這是固定成本，所以佔比隨欄位數下降——11 欄的範例裡它佔
78%，欄位數愈多佔比愈低。

**這個數字會漲，記得回來改。** 它同時是 §4.6 判斷「要不要上框架」的基準，過期的基準會
把判斷帶偏。

重點不是單頁大小，而是**重複**：十個頁面就是 476KB 的同一份資產躺在 git 裡，而且**動一次
`app.css` 會產生十個檔案的 diff**。

**要注意這條限制的形狀。** 上面那段規模論證真正想要的是「產生但不 commit」，而
`outputs` 控制的是「產不產」——從 `outputs` 移除 `"html"` 的結果是**完全產不出 HTML**，
連驗收介面都沒有了，那不是同一件事。

真正缺的概念是把「產生什麼」與「檢查什麼」拆成兩個軸：`--check` 判缺檔為 stale，所以凡是
列在 `outputs` 的都必須存在於磁碟。動 `findOrphans` 達不到這個目的——孤兒偵測管的是
「不該留的檔案」，不是「不該檢查的檔案」。

**現在不改。** 目前只有一頁範例，還沒到痛點；在有第二個真實使用者提出需求之前，這跟
§4.4 是同一個判準。先記成限制，README 也照實寫了目前唯一乾淨的做法（從 `outputs` 移除
`"html"` 並**刪掉**那些檔案，代價是失去驗收介面）。

### 4.17 版面是 app shell：工具列固定，表格區自己捲

窄螢幕先做的是分段收欄位（實際值 / 備註 → 查詢），並讓 `table-layout` 退成 `auto` 讓剩下
的欄自己分配。被收起來的欄位在展開明細裡都有完整版本，不是資訊消失。

**但收到最後仍會塞不下**——剩下的（欄位名 / response / 取得方式 / 資料 ✓ / 顯示 ✓）全是
驗收當下要對照的，沒有一欄能再收。總得有人橫捲，問題只在於是誰。

一度的判斷是「讓 body 去捲，溢出 25px 可接受」。**那是錯的**：body 橫捲會把 sticky 的
工具列與表頭一起水平帶走，標題與「UI 欄位」那幾欄直接移出畫面——比看不到最右邊那幾欄
糟得多。

所以捲動交給 `.table-wrap`，而它**必須同時接管垂直方向**。這條是關鍵，反直覺的地方在於：
CSS 規範會把 `overflow-x: auto` 元素的 `overflow-y` 從 `visible` 算成 `auto`，該容器於是
成為 sticky 的包含區塊；**若容器自己不垂直捲動，表頭的 sticky 就等於沒有**。兩個方向一起
接管，表頭反而黏得比原本更穩——它現在貼的是容器頂端，而不是一個要換算出來的視窗座標。

```
html, body { height: 100% }
body       { display: flex; flex-direction: column; overflow: hidden }
.toolbar   { flex: none }            /* 不再需要 sticky */
.filters   { flex: none }            /* 不再需要 sticky */
.table-wrap{ flex: 1; min-height: 0; overflow: auto }
thead th   { position: sticky; top: 0 }
```

`min-height: 0` 不能省：flex 子項的預設 `min-height` 是 `auto`，不歸零它就撐得比容器高，
永遠不會捲。

**這個架構讓大部分的高度量測變得不必要。** 原本三處 sticky 位移都是硬編常數
（`.filters` 的 `68px`、`thead th` 的 `117px`、`tr.group > td` 的 `149px`），而 `.filters`
一直都是 `flex-wrap`——一換行高度就變，表頭浮在半空或被蓋住。窄螢幕讓它從偶發變成必然。

現在前兩者由 flex 版面吸收，不必量；**只剩分組列還需要知道表頭多高**（它黏在表頭下緣），
由 `ResizeObserver` 量出 `--thead-h`。這個值也不能寫死：斷點會改 `padding`，實測寬螢幕
31.5px、窄螢幕 29.5px，寫死就會讓分組標題蓋在它自己的第一列上。

列印要單獨還原 `overflow`，否則印出來只剩第一頁。

代價：整頁不再捲動，鍵盤捲動（空白鍵 / PageDown）需要焦點先落在表格區。這是 app shell
版面的通例，換來的是工具列的進度條與表頭在任何捲動位置都看得到。

### 4.18 篩選狀態進 URL，驗收標記不進

`?q=isbn&g=query&s=unverified&src=direct,fe-derive` 這種網址可以重整、可以貼給別人，
接手的人打開就是同一個視角。實作是 `render()` 裡呼叫一次 `syncUrl()`——`render()` 是
「視野變了」的唯一入口，掛在這裡才不會漏掉某個篩選器。

**標記與展開狀態刻意不進 URL。** 標記是個人的一次驗收動作，屬於 localStorage（§2.3）；
混進可分享的網址會讓那條界線消失，而且分享出去等於連別人的驗收結論一起送。展開是閱讀
過程不是結論，同理。

**網址優先於 localStorage 的偏好**：URL 是刻意分享來的意圖，本機偏好只是上次的習慣。

**認不得的值要丟掉，不能照單全收。** JSON 改過 section key 之後拿舊網址重開就會遇到——
照收會讓篩選變成「什麼都不符合」，使用者只看到一張空表卻不知道為什麼。丟掉的值記進
`console.warn`（不是靜默），而且 `syncUrl()` 會順手把它們從網址上抹掉。

`file://` 下 `history.replaceState` 搭配 searchParams 可用（Chrome 實測），所以不必退回
hash。逗號在寫回時還原成字面 `,` 而不是 `%2C`——這網址是要給人看、給人貼的。

---

## 5. 開發慣例

### 語言

| 對象                               | 語言                         |
| ---------------------------------- | ---------------------------- |
| README、docs/、skills/（對使用者） | 英文                         |
| 本文、程式碼註解、commit message   | 繁體中文                     |
| 生成物介面文字                     | 由 locale 決定（zh-TW / en） |

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
- 佔位符回歸：渲染結果不得殘留 `{name}` / `{n|one|other}`——打錯變數名會當場現形
- locale 的 `ui` 必須全為字串、JSON 往返不變（每個註冊語系都測）
- 漂移提示：在臨時 git repo 裡以固定 commit 日期驗證兩個方向，以及缺 git 時不拋錯

### locale 護欄（`tests/locale-guard.spec.ts`）

介面文字的腐化是靜默的：硬編一句中文，要等到有人加語系才發現；定義一個沒人用的 key，
永遠不會有人發現。兩者都用同一個機制擋——`makeStubLocale()` 把 locale 的每個字串換成
`«path»`、每個函式換成回傳 `«path(args)»` 的函式，搭配**刻意全 ASCII** 的
`makeCoveragePage()`（踩遍每個 enum 值與每個可選欄位）：

| 現象                     | 判讀       |
| ------------------------ | ---------- |
| 輸出裡還有 CJK           | 有人硬編了 |
| 某個 path 沒出現在輸出裡 | 那是死鍵   |

`app.js` 拿不到 stub locale（它在瀏覽器跑），所以改為直接掃原始碼的註解以外部分；
`ui` 也不走渲染輸出比對（它是整包序列化給瀏覽器的），改比對 `T.key` / `t('key'` 的引用。

加語系時還有第三條：**非參考語系的渲染輸出不得含 CJK**——漏翻的字串會當場現形。

改這幾條測試前先確認你不是在放寬它們。它們一次抓出了 29 處硬編。

### skill 的漂移護欄（`tests/skill.spec.ts`）

skill 教 agent 怎麼寫資料檔，所以它自己不能對 schema 漂移——那正是 §1 描述的問題，套用
在本專案自己身上。測試走過 zod schema，斷言每個欄位名與每個 enum 值都出現在格式參考裡，
並把參考裡的範例真的 parse 一次。schema 加一個欄位而文件沒跟上，就會失敗。

### 驗收介面的行為契約（`tests/review-ui.spec.ts`）

`app.js` 是生成物裡唯一會跑的程式，也是驗收工作真正發生的地方。它一度只有靜態掃描，
結果 §4.6 那條「不要整表重畫」只靠註解守著，然後就被展開明細違反了。

`tests/review-ui.ts` 用 happy-dom 載入 **`renderHtml()` 的真實輸出**（而不是另拼一份
簡化 DOM，那會讓測試通過但生成物壞掉），再自己 eval 內嵌的 `app.js`——happy-dom 的
`document.write` 會建 DOM 但不執行 script，附帶好處是測試同步且決定性。

鎖住的契約：展開 / 標記都不重建其他列、輸入中不失焦、列身不可點、雙指紋在**使用者
實際看到的失效狀態**上正確（只改 display 時資料側的勾仍有效）。

happy-dom 不是 Chrome——它的 `insertAdjacentHTML` 會把 `<tr>` 外殼丟掉，這也正是為什麼
`detailRowEl()` 改用 `createElement`。**版面與文字選取相關的行為它測不了**，那部分要開
真的瀏覽器驗（點擊面積、選取存活）。

### 不要測

- CSS class 字串、顏色
- 版面計算（happy-dom 沒有 layout；點擊面積這類要真瀏覽器）

---

## 7. 已知陷阱

踩過的，別再踩。

| 陷阱                               | 後果                                                                                             | 對策                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| prettier 格式化 `.snap`            | 改掉被比對的內容，測試假失敗                                                                     | `.prettierignore` 已擋                                                                              |
| prettier 格式化 `examples/` 生成物 | **`--check` 直接失敗**                                                                           | `.prettierignore` 已擋                                                                              |
| `escapeJson` 裡的 U+2028 / U+2029  | 用字面字元寫，會被編輯器 / heredoc / 複製貼上吃成普通空白，然後把所有空格都替換掉                | 一律寫成反斜線逸出序列（`\u2028`），不要貼字面字元                                                  |
| `assets/` 沒進 `dist/`             | 發佈後執行期讀不到 css/js                                                                        | `build` 有 `cp -R` 步驟；`src/` 與 `dist/` 同名相對路徑才能共用同一行解析                           |
| `cli.ts` 載入即執行                | 測試 import 會誤觸發 main()                                                                      | `isDirectRun()` 守衛                                                                                |
| 同一段文字在兩處各寫一份           | 兩份會漂移。`patchGroupProgress` 曾漏掉 locale，標記前後看到的字串來源不同                       | 抽共用函式（`progressHtml()`），別複製貼上                                                          |
| 生成物指向消費端不一定有的檔案     | 死連結。曾無條件連向同目錄 `README.md`，連 `examples/` 自己都沒有                                | 生成物只連自己產出的東西；通用規則由 skill 承載                                                     |
| 把顯示層的破折號寫進資料           | `'—'` 是合法字串，schema 擋不住，會被當成一個叫 `—` 的路徑靜默通過                               | 資料用 `null`，顯示交給 locale；另加針對性檢查指路（§4.12）                                         |
| 由絕對路徑推導任何輸出內容         | 生成物因機器而異，`--check` 在 CI 上無故失敗                                                     | 需要專案識別時由設定明示（如 `namespace`），不要自動推導                                            |
| 單列操作卻整個 tbody 重畫          | 抹掉輸入焦點、**文字選取**、捲動位置。標記與展開明細各踩過一次                                   | 局部更新：`patchRow()` / `toggleExpand()`，都不呼叫 `render()`                                      |
| 讓整列可點                         | 拖曳選取與雙擊選字都會被當成點擊意圖，事後擋不掉                                                 | 只讓專屬的鈕可點，用絕對定位把它撐滿儲存格補回面積                                                  |
| 在 `<tr>` 旁 `insertAdjacentHTML`  | 要靠解析器的表格上下文，各家實作不一（happy-dom 會丟掉 `<tr>` 外殼）                             | 用 `createElement` 建列，再 `insertAdjacentElement`                                                 |
| 把 sticky 位移寫成常數             | `.filters` 是 `flex-wrap`，一換行高度就變，表頭浮在半空、分組標題蓋住自己的第一列                | 能由 flex 版面吸收的就別量；真的要量的（`--thead-h`）用 `ResizeObserver`，CSS 只留 fallback         |
| 只給表格容器 `overflow-x`          | `overflow-y` 被算成 `auto`，容器成為 sticky 包含區塊，但它自己不垂直捲，**表頭 sticky 等於沒有** | 讓該容器**同時**接管垂直捲動（`flex: 1; min-height: 0; overflow: auto`），表頭就貼容器頂端（§4.17） |
| 讓 body 去橫捲                     | sticky 的工具列與表頭被水平帶走，標題與最左邊那幾欄移出畫面——比看不到最右邊那幾欄更糟            | 捲動交給表格容器，body `overflow: hidden`（§4.17）                                                  |
| 絕對定位的下拉面板                 | 靠近視窗右緣時溢出，露在外面的選項點不到。寬螢幕也會，只是排不到那麼右邊                         | 展開時量一次，超出就加 `--flip` 改靠右對齊；很窄時整個改成流內展開                                  |
| 用 `details.open = true` 驗版面    | `toggle` 事件是**非同步**的，同步腳本裡量到的是 handler 還沒跑的狀態                             | 量測前 `await` 一個 tick，否則會誤判成「翻轉沒生效」                                                |

---

## 8. 明確的非目標

| 不做                                | 理由                               |
| ----------------------------------- | ---------------------------------- |
| 判斷 JSON 是否符合現況程式碼        | §2.5，刻意的邊界（但會提示該重盤） |
| `fieldproof audit` 之類的分析子指令 | 會把分析工具拖回相依樹             |
| 把驗收介面改寫成框架                | §4.6                               |
| 自訂 enum / schema 擴充機制         | §4.4，沒有第二個使用者前是猜測     |
| 自動刪除孤兒生成物                  | §4.14，那是使用者的決定            |
| 把 `display` / `how` 拆成 DSL       | §2.6，結構化不會防漂移             |
| 引 i18n 套件                        | §4.7.2，威脅決定性且型別更差       |
| 生成物指路到消費端自己的文件        | §7，會產生死連結                   |
| 讓漂移提示影響 `--check` 退出碼     | §2.5，它會誤報，誤報不該讓 CI 紅   |
| 讓 HTML 可以不進 git 而繼續生成     | §4.16，先記成限制，不改機制        |
