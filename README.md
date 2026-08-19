# fieldproof

把「畫面上每個欄位的值從哪來、怎麼算、該怎麼顯示」寫成 JSON，產出：

- **HTML** —— 逐欄位驗收介面（分組、篩選、標記資料 ✓/✗ 與顯示 ✓/✗、填實際值、匯出問題清單）
- **Markdown** —— 給 LLM 讀、給 git diff 審閱

JSON 是 SSOT，兩份輸出都是生成物。

> 🚧 開發中。設計見 [`docs/superpowers/specs/2026-08-19-fieldproof-design.md`](docs/superpowers/specs/2026-08-19-fieldproof-design.md)。
