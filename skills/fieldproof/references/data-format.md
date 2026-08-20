# fieldproof data format

One JSON file per page, in the directory named by `dataDir` in `fieldproof.config.json`.
**The filename must equal the `page` value** — `dashboard.json` holds `"page": "dashboard"`.

- [Config](#config)
- [Page](#page)
- [Query](#query)
- [Section](#section)
- [Field](#field)
- [Enum values](#enum-values)
- [Complete example](#complete-example)

## Config

`fieldproof.config.json`, found by searching upward from the working directory.

| Key         | Required | Description                                                                                                                               |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `dataDir`   | ✔        | Where the data files live, relative to the config file                                                                                    |
| `outDir`    | ✔        | Where generated files go, relative to the config file. Created if missing                                                                 |
| `command`   |          | The regenerate command shown in the generated output. Defaults to `fieldproof build`                                                      |
| `locale`    |          | `zh-TW` (default) or `en`                                                                                                                 |
| `namespace` |          | Scopes review state in the browser. Set it when several projects' pages could be open under the same origin — with `file://` they all are |
| `outputs`   |          | Defaults to `["html", "markdown", "index"]`                                                                                               |

## Review state and `namespace`

The HTML keeps a person's ticks in `localStorage`, keyed by page name. Every page opened over
`file://` shares one origin, so two projects that both have a `dashboard` page would overwrite
each other's review state. `namespace` keeps them apart.

It is deliberately not derived from the absolute path. That would make the output differ per
machine, and `--check` compares bytes.

## Page

| Key         | Required | Description                                                                   |
| ----------- | -------- | ----------------------------------------------------------------------------- |
| `page`      | ✔        | kebab-case, equals the filename. Stable identifier — see the note below       |
| `title`     | ✔        | Display title                                                                 |
| `sources`   | ✔        | Source files read while writing this page. Non-empty. Flow B depends on these |
| `auditedAt` | ✔        | `YYYY-MM-DD` — the day the code was read, not the day the UI was verified     |
| `queries`   | ✔        | Object: query id → query. Ids are free-form; `Q1`, `Q2`… reads well in tables |
| `sections`  | ✔        | Array of sections                                                             |
| `route`     |          | Route template, e.g. `/sites/:id`                                             |
| `notes`     |          | `[{ title, body }]` — page-level known gaps                                   |

## Query

| Key           | Required | Description                                                                                                           |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `endpoint`    | ✔        | e.g. `GET /api/orders`                                                                                                |
| `sdk`         | ✔        | The client function name                                                                                              |
| `params`      | ✔        | Object of string → string. Values may be prose: `{ "From": "today 00:00" }`. Use `{}` for none                        |
| `refetch`     | ✔        | Refresh interval in **milliseconds**, or `"none"`                                                                     |
| `filter`      |          | A single contiguous substring for the DevTools Network filter. Must be unique within the page                         |
| `filterNote`  |          | What else the filter matches, when it cannot be made unique                                                           |
| `httpCount`   |          | Requests fired in parallel by this one query. Defaults to 1                                                           |
| `conditional` |          | `true` when the query does not fire on a normal page load. Excluded from the on-load baseline. Requires `enabledWhen` |
| `origin`      |          | `card` (default) / `layout` / `component`                                                                             |
| `enabledWhen` |          | The condition under which the query runs, in prose                                                                    |
| `note`        |          | Free-form note. Put refresh _alignment_ here — `refetch` only describes frequency                                     |

`refetch` is frequency only. "Re-fetch on the hour" and "re-fetch hourly after mount" are both
`3600000`; if the alignment matters, write it in `note`.

### The `filter` precondition

`filter` is a **single contiguous substring** pasted into the DevTools Network panel to isolate
one request among many similar ones. `Page=1&PageSize=20` only survives if the project pins
query-parameter order — for instance with a `perfectionist/sort-objects` lint rule.

**Without that guarantee, omit `filter`** and let the reviewer filter by endpoint path instead.
A stale filter string is worse than none: it silently matches nothing, and the reviewer
concludes the request was never fired.

Filters must be unique within a page; two queries sharing one is rejected by the build, because
being distinguishable in the panel is the only thing the field is for. When two requests
genuinely cannot be told apart, give one a more precise fragment and use `filterNote` on the
other to say what else it matches.

### `enabledWhen` vs `conditional`

They answer different questions, and neither implies the other:

|               | Question                                   | Who decides                                     |
| ------------- | ------------------------------------------ | ----------------------------------------------- |
| `enabledWhen` | Under what condition does this run at all? | A person — it is prose the tool cannot evaluate |
| `conditional` | Is it absent from a _normal_ page load?    | A person                                        |

A query gated on "the user is logged in" has an `enabledWhen` but is **not** conditional: the
gate holds while someone reviews, so the request fires and belongs in the baseline.

`conditional: true` without `enabledWhen` is rejected by the build — the reconciliation list
would otherwise name a query without saying when it fires.

## Section

| Key         | Required | Description                                                                          |
| ----------- | -------- | ------------------------------------------------------------------------------------ |
| `key`       | ✔        | kebab-case, unique within the page. Stable identifier                                |
| `kind`      | ✔        | `card` / `chart` / `table` / `filter` / `form`                                       |
| `title`     | ✔        | Section heading as it appears on screen                                              |
| `fields`    | ✔        | Non-empty array of fields                                                            |
| `meta`      |          | Object of string → string: badge, placement, deep link — anything that fits the kind |
| `emptyRule` |          | What the whole section does when it has no data                                      |

## Field

| Key       | Required | Description                                                                                                                                                   |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | ✔        | Unique **within its section** (not the page). Stable identifier                                                                                               |
| `label`   | ✔        | The label as it appears on screen                                                                                                                             |
| `resp`    | ✔        | Response path, e.g. `items[].amount`. **`null`** when it does not come from an API. Required either way — an omitted `resp` is a mistake, `null` is an answer |
| `source`  | ✔        | See [enum values](#enum-values)                                                                                                                               |
| `how`     | ✔        | One sentence: how the value is obtained                                                                                                                       |
| `display` | ✔        | Formatting, units, and empty / null / zero handling                                                                                                           |
| `query`   |          | A query id, or an array of them. Omit for values the frontend invents                                                                                         |
| `checks`  |          | `[{ given, expect }]` — turns a display rule into concrete cases to tick off                                                                                  |
| `flags`   |          | Any of `exception` / `backend-pending` / `fragile` / `unresolved`                                                                                             |
| `note`    |          | Free-form note                                                                                                                                                |

### Stable identifiers

Review state lives in the browser under `page/section.key/field.id`. Renaming any of the three
orphans the marks a human already made. Rename only when you intend that.

`label` and `note` are safe to change — they do not affect the fingerprints that decide whether
an existing ✓ stays valid. `query`, `resp`, `source`, `how`, `checks` invalidate the _data_
side; `display` and `checks` invalidate the _display_ side.

## Enum values

**`source`** — who computed the number:

| Value         | Meaning                                                |
| ------------- | ------------------------------------------------------ |
| `direct`      | Straight from the API                                  |
| `backend-agg` | Pre-aggregated by the backend (`totals`, `summary`)    |
| `fe-pick`     | The frontend picks one item out of a list              |
| `fe-agg`      | The frontend aggregates (sum, max, count)              |
| `fe-derive`   | The frontend converts, looks up, or otherwise computes |
| `fe-const`    | Hardcoded in the frontend                              |

**`flags`**:

| Value             | Meaning                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `exception`       | A deliberate break from a site-wide convention                          |
| `backend-pending` | Current behaviour is a workaround; the backend has not settled          |
| `fragile`         | Works, but rests on something brittle (string matching, array position) |
| `unresolved`      | You could not trace the chain — this row is a guess, not a finding      |

`unresolved` exists because every other key on a field is an assertion: `source`, `how` and
`display` are all required, and none of the six `source` values means "I don't know". Without
it, a chain you could not follow has to be written as though you had, and nobody reading the
page six months later can tell the guesses from the findings. Pair it with a `note` saying what
you did establish and where you lost the thread. The review tool can filter for it.

**`section.kind`**: `card`, `chart`, `table`, `filter`, `form`

**`query.origin`** — who fires the request:

| Value       | Meaning                                                     |
| ----------- | ----------------------------------------------------------- |
| `card`      | A card / section data query (default)                       |
| `layout`    | The layout fires it (global switcher, breadcrumb)           |
| `component` | A shared component fires it (a status badge's lookup table) |

`layout` and `component` queries usually have no fields pointing at them. That is expected —
they exist so the Network panel reconciles.

## Complete example

```json
{
  "page": "dashboard",
  "title": "Store dashboard",
  "route": "/admin/dashboard",
  "auditedAt": "2026-08-20",
  "sources": ["src/composables/useDashboardData.ts", "src/components/SalesCard.vue"],
  "queries": {
    "Q1": {
      "endpoint": "GET /api/orders/summary",
      "sdk": "getOrderSummary",
      "params": { "From": "today 00:00", "To": "now" },
      "filter": "orders/summary",
      "refetch": 60000,
      "enabledWhen": "storeId is a valid number",
      "conditional": true
    },
    "Q2": {
      "endpoint": "GET /api/stores",
      "sdk": "getStores",
      "params": {},
      "refetch": "none",
      "origin": "layout",
      "note": "Fired by the layout's store switcher, not by this page."
    }
  },
  "sections": [
    {
      "key": "sales-summary",
      "kind": "card",
      "title": "Today",
      "meta": { "Placement": "top-left" },
      "emptyRule": "The whole card collapses when the summary is null.",
      "fields": [
        {
          "id": "revenue",
          "label": "Revenue",
          "query": "Q1",
          "resp": "totals.revenue",
          "source": "backend-agg",
          "how": "Summed by the backend, taken as-is",
          "display": "Thousands separator, 0 dp; null renders —",
          "checks": [
            { "given": "totals.revenue = 0", "expect": "0, not —" },
            { "given": "totals.revenue = null", "expect": "—" }
          ]
        },
        {
          "id": "avg-order",
          "label": "Average order",
          "query": "Q1",
          "resp": "totals.revenue",
          "source": "fe-derive",
          "how": "revenue ÷ orderCount, computed in the frontend",
          "display": "2 dp; renders — when orderCount is 0",
          "flags": ["fragile"],
          "note": "Divides without guarding against a null revenue; only safe because the card is hidden when the summary is null."
        },
        {
          "id": "currency",
          "label": "Currency",
          "resp": null,
          "source": "fe-const",
          "how": "Hardcoded in the template",
          "display": "Always NT$"
        }
      ]
    }
  ],
  "notes": [
    {
      "title": "No refund total",
      "body": "The backend has no refund aggregate yet, so the refund card sums the list client-side."
    }
  ]
}
```
