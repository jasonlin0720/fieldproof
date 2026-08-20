# fieldproof

Write down where every number on a screen comes from — which API, which response
field, what the frontend does to it, and how it should be rendered — as JSON.
Get back:

- **HTML** — a field-by-field review tool: group, filter, mark each field's
  _data_ and _display_ as correct or broken, record what you actually saw on
  screen, export a punch list. Progress is kept in `localStorage`.
- **Markdown** — for LLMs to read and for `git diff` to review.

The JSON is the single source of truth. Both outputs are generated.

## In 30 seconds

|           |                                                                                             |
| --------- | ------------------------------------------------------------------------------------------- |
| **What**  | One JSON file per page saying where every displayed value comes from                        |
| **Who**   | Whoever has to answer "is this number right?" — and the agents helping them                 |
| **Why**   | So that answering it does not mean re-reading component → hook → query → mapper again       |
| **When**  | Before a release, after an API changes, or the first time a page confuses someone           |
| **Where** | Beside your DevTools Network panel; the generated HTML makes zero requests of its own       |
| **How**   | `npx fieldproof build` — out come a review tool and a Markdown file for LLMs and `git diff` |

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

| Key         | Required | Description                                                                                                                        |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `dataDir`   | ✔        | Where the data files live, relative to the config file                                                                             |
| `outDir`    | ✔        | Where generated files go, relative to the config file                                                                              |
| `command`   |          | The regenerate command shown in generated output. Defaults to `fieldproof build`                                                   |
| `namespace` |          | Scopes review state in the browser — [why you may need it](skills/fieldproof/references/data-format.md#review-state-and-namespace) |
| `locale`    |          | `zh-TW` (default) or `en`                                                                                                          |
| `outputs`   |          | Defaults to `["html", "markdown", "index"]`                                                                                        |

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

fieldproof skill                    # show where the bundled skill is and where it would go
fieldproof skill --install          # copy it into .claude/skills/fieldproof
fieldproof skill --install --to <d> # e.g. ~/.claude/skills/fieldproof for all your projects
```

## The bundled skill

Writing a data file means walking the chain — component, composable, query, response, mapper,
formatter — for every field on the page. That is exactly the archaeology an agent is good at,
and exactly the part you do not want to do by hand sixty times.

fieldproof ships a skill that teaches an agent to do it: how to inventory the queries before
the fields, how to classify `source`, what belongs in `how` versus `display`, when a field
deserves a `flag` instead of a guess, and how to refresh an existing data file after the code
moves without invalidating review marks that are still valid.

```bash
npx fieldproof skill --install
```

Then ask for what you want:

> Audit the fields on /admin/dashboard and write the fieldproof data file.

> useDashboardData.ts changed — refresh docs/fields/data/dashboard.json.

Agents find skills in `.claude/skills/`, not in `node_modules`, which is why the file has to be
copied rather than resolved. Re-run the command after upgrading fieldproof to pick up changes;
because it is a copy, `git status` shows you exactly what moved.

## Data format

One JSON file per page. The full reference — every key, every enum value, and a complete
example — lives in
[`skills/fieldproof/references/data-format.md`](skills/fieldproof/references/data-format.md).

That is the same file the bundled skill reads, so what you are told and what an agent is told
cannot drift apart. A test walks the schema and fails if any key or enum value is missing
from it.

Four things there that bite:

- **`filter` has a precondition.** It is a contiguous substring for the DevTools Network panel,
  so it only survives if your project pins query-parameter order. Without that guarantee, leave
  it out — a stale filter matches nothing and reads as "the request never fired".
- **`enabledWhen` and `conditional` are different questions.** One is when a query runs at all;
  the other is whether to expect it on a normal page load.
- **`resp` is `null`, not a dash,** when a value comes from no API.
- **`unresolved` is how a field admits it is a guess.** Every other key on a field is an
  assertion, and none of the six `source` values means "I don't know" — so without the flag, a
  chain nobody could follow gets written as though somebody had.

## Reviewing

Open the generated HTML next to your DevTools Network panel and tick fields off one at a time.
Two verdicts per field — is the number right, is it rendered right — because they get fixed by
different people. Progress lives in `localStorage`; when you are done, export a punch list.

[`docs/workflow.md`](docs/workflow.md) walks through it: reading a row, narrowing sixty fields
down to the ones you care about, reconciling the Network panel, and what "definition changed"
means.

## In CI

```bash
fieldproof build --check
```

Exits non-zero when the generated files don't match the data, or when `outDir` still holds
generated files whose data file is gone. Output is deterministic — no timestamps, no
environment-dependent content — so this comparison is trustworthy.

This means the generated files have to be committed: a missing file reads as out of sync. One
page's HTML is about 50 KB of inlined CSS and JS plus roughly 1.5 KB per field, and the inlined
part repeats in every page. If that gets heavy, drop `"html"` from `outputs` and **delete** the
HTML files — anything left in `outDir` carrying the generated marker is reported as an orphan.
There is no supported way to keep generating the HTML while leaving it out of git.

## Design decisions

**The JSON is the API.** This tool turns your data into two readable outputs. It
does not decide whether that data still matches the current code.

Drift detection has many possible shapes — diff the files listed in `sources`,
run static analysis, ask an LLM to re-check — and wiring any one of them in here
would force every user to adopt that tool. The data files sit on disk, are
machine-readable, and already record `sources` and `auditedAt`. External tooling
can read them directly.

The one exception is the cheapest half of that question. `build` asks git whether
any file in `sources` was committed after `auditedAt`, and prints the pages where
that happened. It needs no new dependency — you already have git, since the
generated files are committed — and it never reads the content, so it cannot tell
you whether behaviour changed. It only names the pages worth re-reading. It is a
hint, not a verdict: a formatting-only commit trips it, and `--check` ignores it.

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

## Documentation

|                                                                                              |                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [`docs/workflow.md`](docs/workflow.md)                                                       | Using the generated HTML to review a page               |
| [`skills/fieldproof/references/data-format.md`](skills/fieldproof/references/data-format.md) | Every key and enum value, with a complete example       |
| [`CHANGELOG.md`](CHANGELOG.md)                                                               | What changed, and how to migrate data files             |
| [`AGENTS.md`](AGENTS.md)                                                                     | Architecture, and why each decision went the way it did |

## License

MIT
