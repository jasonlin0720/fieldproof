/**
 * fieldproof 資料契約的唯一定義處。
 *
 * 資料目錄下的 `*.json` 為各頁的單一事實來源（SSOT），由 `build.ts` 驗證後渲染成
 * HTML（驗收工具）與 markdown（供 LLM 讀 / git diff 審閱）。
 * schema 變動即代表全部頁面的資料格式變動。
 */

import { z } from 'zod';

/**
 * 本檔的自訂訊息一律英文。它們會與 zod 自身的預設訊息（`Too small`、`Invalid input` 等，
 * 也是英文）並列出現在同一份 `errors.invalidPage` detail 裡；只翻其中兩則會變成中英夾雜。
 * schema 層不接 locale——它是模組級常數，取不到設定。
 */

/** 值的取得方式。驅動 HTML 的顏色標記與篩選器，也是驗收時最常切的維度。 */
export const sourceKindSchema = z.enum([
  /** API 欄位直取 */
  'direct',
  /** 後端合計（totals / summary） */
  'backend-agg',
  /** 前端取某一筆（如 items 最後一筆） */
  'fe-pick',
  /** 前端聚合（加總 / 取最大） */
  'fe-agg',
  /** 前端換算 / 查表 / 生成 */
  'fe-derive',
  /** 前端硬編 */
  'fe-const',
]);

/** 需要額外注意的欄位標記。 */
export const flagSchema = z.enum([
  /** 違反全站慣例的刻意設計 */
  'exception',
  /** 後端尚在研議 / 目前為權宜解 */
  'backend-pending',
  /** 易碎（如依賴字串格式比對） */
  'fragile',
  /**
   * 這條鏈沒追出來，本列的宣告是推測。
   *
   * `source` / `how` / `display` 都是必填，六個 source 值也全是斷言句——沒有這個標記時，
   * 追不出來的欄位只能被迫寫一個看起來確定的答案，讀的人分不出哪幾格查證過。
   * 那等於把 code archaeology 換成一份假裝確定的宣告，比沒有宣告更糟。
   */
  'unresolved',
]);

/** 區塊形態。撐住各頁差異：儀表板類頁面多為 card，清單類頁面多為 filter + chart + table。 */
export const sectionKindSchema = z.enum(['card', 'chart', 'table', 'filter', 'form']);

/**
 * 自動刷新間隔（毫秒），`'none'` 為不輪詢、不計入輪詢負載統計。
 *
 * 只描述頻率，不描述對齊方式——「對齊整點重取」與「掛載後每小時重取」在負載統計上
 * 等價，皆為 3_600_000；需要說明對齊行為請寫在該查詢的 `note`。
 */
export const refetchSchema = z.union([z.number().int().positive(), z.literal('none')]);

/** 查詢的發起來源。非 `card` 者不對應任何欄位，只出現在 Network 對帳清單。 */
export const originSchema = z.enum([
  /** 卡片 / 區塊的資料查詢 */
  'card',
  /** 版面層（如全域切換器、麵包屑） */
  'layout',
  /** 由共用元件自打（如狀態徽章的對照表） */
  'component',
]);

export const querySchema = z.object({
  /** 如 'GET /api/History/GetHistoryRecords' */
  endpoint: z.string().min(1),
  /** generated SDK 函式名，如 'getHistoryRecords' */
  sdk: z.string().min(1),
  /** 顯示用的參數說明（值可為中文描述，如「今日 00:00 ~ now」） */
  params: z.record(z.string(), z.string()),
  /**
   * 貼進 DevTools Network filter 用的**單一連續子字串**，用來從一堆相似 request 中
   * 篩出這一支。同頁不得重複（build 時檢查）。
   *
   * **可行的前提是查詢參數順序穩定**——若專案未以 lint 規則固定物件 key 順序
   * （如 `perfectionist/sort-objects`），`A=1&B=2` 這種連續片段隨時可能失效，
   * 此時請省略本欄，改以端點路徑自行篩選。
   */
  filter: z.string().min(1).optional(),
  /** 篩選字串無法唯一定位時的補充說明（會一併匹配到誰、怎麼再排除）。 */
  filterNote: z.string().optional(),
  /** 發起來源；預設為卡片資料查詢。 */
  origin: originSchema.optional(),
  /**
   * 條件性請求：不是每次進頁都會發（例如卡片預設隱藏、元件沒渲染就不打）。
   * Network 對帳時要與「無條件發」的請求分開計數，否則數量對不上。
   */
  conditional: z.boolean().optional(),
  refetch: refetchSchema,
  /** 併發支數，預設 1；效益類填 4（四情境併發） */
  httpCount: z.number().int().positive().optional(),
  /** 啟用條件，如 'siteId 為有效數字' */
  enabledWhen: z.string().optional(),
  note: z.string().optional(),
});

export const fieldSchema = z.object({
  /**
   * section 內唯一。驗收狀態的 localStorage key 為 `page/section.key/field.id`，
   * 故此值為穩定識別，**不可任意改名**（改名會讓已標記的狀態錯位）。
   */
  id: z.string().min(1),
  label: z.string().min(1),
  /**
   * query id；跨查詢的欄位給陣列（如 PCS 狀態徽章 = ['Q2','Q14']）。
   * 純前端生成、不來自任何 API 的欄位（如圖表 X 軸 labels、硬編單位）省略此欄，
   * HTML 依查詢分組時歸入「無查詢（前端生成）」群組。
   */
  query: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
  /**
   * response 欄位路徑，如 'items[].remainingEnergyPercent'。
   *
   * **不來自任何 API 時填 `null`**（不是省略、也不是破折號）：省略無法與「漏填」區分，
   * 破折號則是顯示層的事，寫進資料會讓三個地方各自比對同一個哨兵字串。
   */
  resp: z.string().min(1).nullable(),
  source: sourceKindSchema,
  /** 取值方式一句話 */
  how: z.string().min(1),
  /** 顯示層處理（格式化、單位、退場） */
  display: z.string().min(1),
  /**
   * 具體的驗證檢查點：把抽象的顯示規則變成「給定什麼 → 畫面該長怎樣」。
   * 只加在顯示規則複雜或有例外的欄位，不是每個欄位都要。
   */
  checks: z
    .array(
      z.object({
        /** 給定的輸入，如 'response = 1000' */
        given: z.string().min(1),
        /** 畫面應呈現的結果，如 '1 tCO₂e' */
        expect: z.string().min(1),
      }),
    )
    .optional(),
  flags: z.array(flagSchema).optional(),
  note: z.string().optional(),
});

export const sectionSchema = z.object({
  /** kebab-case。與 field.id 同為穩定識別，**不可任意改名**。 */
  key: z.string().min(1),
  kind: sectionKindSchema,
  title: z.string().min(1),
  /** badge / deepLink / placement 等，依 kind 自由帶 */
  meta: z.record(z.string(), z.string()).optional(),
  /** 整區塊的空狀態規則 */
  emptyRule: z.string().optional(),
  fields: z.array(fieldSchema).min(1),
});

export const noteSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

export const fieldMapPageSchema = z.object({
  /** kebab-case，決定輸出檔名與 localStorage 命名空間 */
  page: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'page must be kebab-case'),
  title: z.string().min(1),
  /** 路由樣板，如 '/sites/:id'；非 SPA 或無固定路由時可省略 */
  route: z.string().min(1).optional(),
  /** 盤點時讀過的原始碼檔案，供日後回頭核對 */
  sources: z.array(z.string()).min(1),
  /** 盤點日。這是「對過程式碼」的日期，不是「使用者驗收過」的日期 */
  auditedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'auditedAt must be YYYY-MM-DD'),
  queries: z.record(z.string(), querySchema),
  sections: z.array(sectionSchema),
  notes: z.array(noteSchema).optional(),
});

export type Field = z.infer<typeof fieldSchema>;
export type FieldMapPage = z.infer<typeof fieldMapPageSchema>;
export type Flag = z.infer<typeof flagSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Origin = z.infer<typeof originSchema>;
export type Query = z.infer<typeof querySchema>;
export type Refetch = z.infer<typeof refetchSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type SectionKind = z.infer<typeof sectionKindSchema>;
export type SourceKind = z.infer<typeof sourceKindSchema>;
