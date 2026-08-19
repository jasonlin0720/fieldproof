# fieldproof

把「畫面上每個欄位的值從哪來、怎麼算、該怎麼顯示」寫成 JSON，產出：

- **HTML** —— 逐欄位驗收介面：分組、篩選、標記「資料 ✓/✗」與「顯示 ✓/✗」、填畫面實際值、匯出問題清單，狀態存在 localStorage
- **Markdown** —— 給 LLM 讀、給 `git diff` 審閱

JSON 是唯一事實來源，兩份輸出都是生成物。

## 解決什麼問題

驗一個畫面上的數字對不對，通常要這樣翻：

```
找元件 → 找 props → 找 composable → 找 query → 看參數 → 看 response
       → 找 mapper → 確認 formatter → 回到畫面
```

一頁 60 個欄位就是 60 趟。fieldproof 讓你把這段知識寫下來一次：

```
Q9 · items[].remainingEnergyPercent · 前端取最後一筆 · null → —，數值加 %
```

然後開著 HTML、對著 DevTools Network，一欄一欄勾過去。

## 安裝

```bash
pnpm add -D fieldproof
```

## 開始

**1. 建 `fieldproof.config.json`**

```json
{
  "dataDir": "docs/fields/data",
  "outDir": "docs/fields",
  "command": "pnpm fields"
}
```

| 欄位      | 必填 | 說明                                              |
| --------- | ---- | ------------------------------------------------- |
| `dataDir` | ✔    | 資料檔所在目錄，相對於設定檔                      |
| `outDir`  | ✔    | 生成物輸出目錄，相對於設定檔                      |
| `command` |      | 生成物頁首顯示的重生指令，預設 `fieldproof build` |
| `locale`  |      | 目前僅 `zh-TW`（預設）                            |
| `outputs` |      | 預設 `["html", "markdown", "index"]`              |

**2. 寫一頁資料**：`docs/fields/data/dashboard.json`（檔名須等於 `page`）

```json
{
  "page": "dashboard",
  "title": "總覽",
  "route": "/admin/dashboard",
  "auditedAt": "2026-08-19",
  "sources": ["src/composables/useDashboardData.ts"],
  "queries": {
    "Q1": {
      "endpoint": "GET /api/orders/summary",
      "sdk": "getOrderSummary",
      "params": { "From": "當日 00:00", "To": "now" },
      "refetch": 60000
    }
  },
  "sections": [
    {
      "key": "sales",
      "kind": "card",
      "title": "今日業績",
      "fields": [
        {
          "id": "revenue",
          "label": "今日營收",
          "query": "Q1",
          "resp": "totals.revenue",
          "source": "backend-agg",
          "how": "後端已加總，直接取用",
          "display": "千分位 + 「元」；null → —"
        }
      ]
    }
  ]
}
```

**3. 產出**

```bash
npx fieldproof build
```

完整範例見 [`examples/`](examples/)。

## CLI

```bash
fieldproof build                    # 驗證並生成
fieldproof build --check            # 只驗證並比對；不同步則非零退出（適合擺進 CI）
fieldproof build --config <path>    # 指定設定檔（預設自 cwd 向上探尋）
```

## 資料格式

### 頁面

| 欄位        | 必填 | 說明                                 |
| ----------- | ---- | ------------------------------------ |
| `page`      | ✔    | kebab-case，須等於檔名，決定輸出檔名 |
| `title`     | ✔    | 顯示標題                             |
| `sources`   | ✔    | 盤點時讀過的原始碼路徑               |
| `auditedAt` | ✔    | `YYYY-MM-DD`，「對過程式碼」的日期   |
| `queries`   | ✔    | query id → 查詢定義                  |
| `sections`  | ✔    | 區塊                                 |
| `route`     |      | 路由樣板                             |
| `notes`     |      | 頁面層級的已知落差                   |

### 查詢

| 欄位          | 必填 | 說明                                         |
| ------------- | ---- | -------------------------------------------- |
| `endpoint`    | ✔    | 如 `GET /api/orders`                         |
| `sdk`         | ✔    | 對應的 client 函式名                         |
| `params`      | ✔    | 參數說明（值可為自然語言，如「當日 00:00」） |
| `refetch`     | ✔    | 刷新間隔（毫秒）或 `"none"`                  |
| `filter`      |      | DevTools Network 篩選字串，見下方注意事項    |
| `filterNote`  |      | 篩選字串無法唯一定位時的補充                 |
| `httpCount`   |      | 併發支數，預設 1                             |
| `conditional` |      | 是否為條件性請求（不計入進頁基準）           |
| `origin`      |      | `card`（預設）／`layout`／`component`        |
| `enabledWhen` |      | 啟用條件                                     |
| `note`        |      | 備註                                         |

### 欄位

| 欄位      | 必填 | 說明                                                    |
| --------- | ---- | ------------------------------------------------------- |
| `id`      | ✔    | section 內唯一。**驗收狀態以此為 key，勿任意改名**      |
| `label`   | ✔    | 畫面上的欄位名                                          |
| `resp`    | ✔    | response 路徑，如 `items[].amount`；無對應填 `—`        |
| `source`  | ✔    | 見下表                                                  |
| `how`     | ✔    | 取值方式一句話                                          |
| `display` | ✔    | 顯示層處理（格式化、單位、退場）                        |
| `query`   |      | query id 或 id 陣列；純前端生成的欄位省略               |
| `checks`  |      | `[{ given, expect }]`，把顯示規則變成可逐條核對的檢查點 |
| `flags`   |      | `exception` / `backend-pending` / `fragile`             |
| `note`    |      | 備註                                                    |

`source` 可用值：`direct`（API 直取）、`backend-agg`（後端合計）、`fe-pick`（前端取某筆）、`fe-agg`（前端聚合）、`fe-derive`（前端換算）、`fe-const`（前端硬編）。

它驅動 HTML 的顏色標記與篩選，也是驗收時最常切的維度——「這個數字是後端算好的還是前端算的」直接決定出問題時要找誰。

## `filter` 的前提

`filter` 是**單一連續子字串**，貼進 DevTools Network 面板就能從一堆相似 request 中篩出這一支。

這件事可行的前提是**查詢參數順序穩定**。若專案沒有以 lint 規則固定物件 key 的順序（例如 `perfectionist/sort-objects`），`A=1&B=2` 這種連續片段隨時可能因為有人調換參數而失效。

**沒有這個保證就別填 `filter`**，改用端點路徑自行篩選。同頁的 `filter` 不得重複——重複代表兩支查詢在面板中分不出來，build 會擋下。

## 擺進 CI

```bash
fieldproof build --check
```

生成物與資料不同步時非零退出。輸出是決定性的（不含時間戳或任何依環境而異的內容），所以這個比對可靠。

## 設計取捨

**JSON 就是 API。** 本套件只負責「把資料變成可讀、可驗收的兩份輸出」，不判斷「這份資料是否還符合現況程式碼」。

漂移偵測有很多種做法——比對 `sources` 列出的檔案有沒有動過、跑靜態分析、請 LLM 複核——把其中任何一種綁進來，都會逼所有使用者裝那個工具。資料檔就在磁碟上、是 machine-readable 的，還記了 `sources` 與 `auditedAt`，外部工具自己讀就好。

**但「定義改了、舊的勾還在」是本套件的事。** 每個欄位的取值側與顯示側各算一份指紋：只改 `display` 時，「資料抓得對不對」的結論仍然有效，不該一起失效；改 `label` 或 `note` 則兩側都不動。HTML 會把受影響的欄位標成「定義已變更」並可單獨篩出。

## 開發

```bash
pnpm dev       # tsx src/cli.ts
pnpm test      # vitest
pnpm typecheck
pnpm check     # typecheck + test
pnpm example   # 產生 examples/ 下的示範輸出
```

## License

MIT
