# fieldproof

Write down where every number on a screen comes from — which API, which response
field, what the frontend does to it, and how it should be rendered — as JSON.
Get back:

- **HTML** — a field-by-field review tool: group, filter, mark each field's
  _data_ and _display_ as correct or broken, record what you actually saw on
  screen, export a punch list. Progress is kept in `localStorage`.
- **Markdown** — for LLMs to read and for `git diff` to review.

The JSON is the single source of truth. Both outputs are generated.

## The problem

Checking whether one number on a screen is correct usually means walking the
whole chain:

```
component → props → composable/hook → query → request params → response
          → mapper → formatter → back to the screen
```

Sixty fields on a page means sixty round trips, and you lose your place every
time. fieldproof lets you write that knowledge down once:

```
Q9 · items[].remainingEnergyPercent · takes the last item · null → —, suffix %
```

Then you open the HTML next to your DevTools Network panel and tick fields off
one at a time.

## Install

```bash
pnpm add -D fieldproof
```

## Getting started

**1. Create `fieldproof.config.json`**

```json
{
  "dataDir": "docs/fields/data",
  "outDir": "docs/fields",
  "command": "pnpm fields"
}
```

| Key       | Required | Description                                                                      |
| --------- | -------- | -------------------------------------------------------------------------------- |
| `dataDir` | ✔        | Where the data files live, relative to the config file                           |
| `outDir`  | ✔        | Where generated files go, relative to the config file                            |
| `command` |          | The regenerate command shown in generated output. Defaults to `fieldproof build` |
| `locale`  |          | Currently `zh-TW` only (the default)                                             |
| `outputs` |          | Defaults to `["html", "markdown", "index"]`                                      |

**2. Describe one page** in `docs/fields/data/dashboard.json`. The filename must
match `page`.

```json
{
  "page": "dashboard",
  "title": "Dashboard",
  "route": "/admin/dashboard",
  "auditedAt": "2026-08-19",
  "sources": ["src/composables/useDashboardData.ts"],
  "queries": {
    "Q1": {
      "endpoint": "GET /api/orders/summary",
      "sdk": "getOrderSummary",
      "params": { "From": "today 00:00", "To": "now" },
      "refetch": 60000
    }
  },
  "sections": [
    {
      "key": "sales",
      "kind": "card",
      "title": "Today",
      "fields": [
        {
          "id": "revenue",
          "label": "Revenue",
          "query": "Q1",
          "resp": "totals.revenue",
          "source": "backend-agg",
          "how": "Summed by the backend, taken as-is",
          "display": "Thousands separator; null → —"
        }
      ]
    }
  ]
}
```

**3. Build**

```bash
npx fieldproof build
```

See [`examples/`](examples/) for a complete page.

## CLI

```bash
fieldproof build                    # validate and generate
fieldproof build --check            # validate and compare only; non-zero exit if out of sync
fieldproof build --config <path>    # explicit config (default: search upward from cwd)
```

## Data format

### Page

| Key         | Required | Description                                                                    |
| ----------- | -------- | ------------------------------------------------------------------------------ |
| `page`      | ✔        | kebab-case, must equal the filename; determines output filenames               |
| `title`     | ✔        | Display title                                                                  |
| `sources`   | ✔        | Source files you read while writing this page                                  |
| `auditedAt` | ✔        | `YYYY-MM-DD` — the day you last read the code, not the day you verified the UI |
| `queries`   | ✔        | Query id → query definition                                                    |
| `sections`  | ✔        | Sections                                                                       |
| `route`     |          | Route template                                                                 |
| `notes`     |          | Page-level known gaps                                                          |

### Query

| Key           | Required | Description                                                      |
| ------------- | -------- | ---------------------------------------------------------------- |
| `endpoint`    | ✔        | e.g. `GET /api/orders`                                           |
| `sdk`         | ✔        | The client function name                                         |
| `params`      | ✔        | Parameter notes. Values may be prose, e.g. `"today 00:00"`       |
| `refetch`     | ✔        | Refresh interval in milliseconds, or `"none"`                    |
| `filter`      |          | DevTools Network filter string — see the caveat below            |
| `filterNote`  |          | What else the filter matches, when it can't be made unique       |
| `httpCount`   |          | Requests fired in parallel. Defaults to 1                        |
| `conditional` |          | Not fired on every page load; excluded from the on-load baseline |
| `origin`      |          | `card` (default) / `layout` / `component`                        |
| `enabledWhen` |          | Condition under which the query runs                             |
| `note`        |          | Free-form note                                                   |

### Field

| Key       | Required | Description                                                                          |
| --------- | -------- | ------------------------------------------------------------------------------------ |
| `id`      | ✔        | Unique within its section. **Review state is keyed on this — don't rename casually** |
| `label`   | ✔        | The label as it appears on screen                                                    |
| `resp`    | ✔        | Response path, e.g. `items[].amount`. Use `—` when there is none                     |
| `source`  | ✔        | See below                                                                            |
| `how`     | ✔        | One sentence: how the value is obtained                                              |
| `display` | ✔        | Formatting, units, empty-state handling                                              |
| `query`   |          | Query id, or an array of them. Omit for fields the frontend generates                |
| `checks`  |          | `[{ given, expect }]` — turns a display rule into concrete cases to tick off         |
| `flags`   |          | `exception` / `backend-pending` / `fragile`                                          |
| `note`    |          | Free-form note                                                                       |

`source` values: `direct` (straight from the API), `backend-agg` (pre-aggregated
by the backend), `fe-pick` (frontend picks one item), `fe-agg` (frontend
aggregates), `fe-derive` (frontend computes or looks up), `fe-const` (hardcoded).

This drives the colour coding and filters in the HTML, and it is the dimension
you slice by most while reviewing — whether a number was computed by the backend
or the frontend decides who you go to when it turns out wrong.

## The `filter` caveat

`filter` is a **single contiguous substring** you paste into the DevTools Network
panel to isolate one request among many similar ones.

This only works if **query parameter order is stable**. If your project doesn't
pin object key order with a lint rule (such as `perfectionist/sort-objects`), a
fragment like `A=1&B=2` breaks the moment someone reorders the parameters.

**Without that guarantee, leave `filter` out** and filter by endpoint path
instead. Filters must be unique within a page — a duplicate means two queries
are indistinguishable in the panel, and the build rejects it.

## In CI

```bash
fieldproof build --check
```

Exits non-zero when the generated files don't match the data. Output is
deterministic — no timestamps, no environment-dependent content — so this
comparison is trustworthy.

## Design decisions

**The JSON is the API.** This tool turns your data into two readable outputs. It
does not decide whether that data still matches the current code.

Drift detection has many possible shapes — diff the files listed in `sources`,
run static analysis, ask an LLM to re-check — and wiring any one of them in here
would force every user to adopt that tool. The data files sit on disk, are
machine-readable, and already record `sources` and `auditedAt`. External tooling
can read them directly.

**But "the definition changed and the old checkmark is still there" is our
problem.** Each field gets two fingerprints, one for the data side and one for
the display side. Changing only `display` leaves the "is the data right?"
conclusion valid, so it shouldn't be invalidated; changing `label` or `note`
touches neither. The HTML marks affected fields as stale and lets you filter for
exactly those.

## Development

```bash
pnpm dev       # tsx src/cli.ts
pnpm test      # vitest
pnpm typecheck
pnpm check     # typecheck + test
pnpm example   # regenerate the sample output under examples/
```

Contributors: see [`AGENTS.md`](AGENTS.md) for architecture and the reasoning
behind the design decisions.

## License

MIT
