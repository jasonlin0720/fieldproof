---
name: fieldproof
description: >-
  Audit a frontend page's fields — trace every number on screen back to its API call, response
  field, frontend transform, and display rule — and write it as a fieldproof JSON data file.
  Use this whenever the user mentions fieldproof, asks to audit / document / map where a page's
  values come from, asks "where does this number come from", wants to refresh an existing field
  map after the code changed, or needs a field-by-field review checklist for a page. Also use it
  when the repo has a fieldproof.config.json and the user is adding or changing a page.
---

# fieldproof field audit

fieldproof turns "where does every number on this screen come from" into a JSON file, and
generates two things from it: an HTML review tool for a human, and a Markdown file for LLMs
and `git diff`.

Your job is to produce that JSON — accurately. The whole value of the tool collapses if the
JSON says something the code does not do, because a human will tick fields off against it and
walk away believing the page is correct.

## Pick the right flow

| Situation                                            | Flow                                |
| ---------------------------------------------------- | ----------------------------------- |
| No data file for this page yet                       | **A. Audit a new page**             |
| Data file exists, code has changed since `auditedAt` | **B. Refresh an existing file**     |
| User just wants the outputs rebuilt                  | Run `npx fieldproof build` and stop |

Before anything else, read `fieldproof.config.json` (search upward from the repo root) to find
`dataDir`. Data files live there, one per page, and **the filename must equal the `page` value**.

Read `references/data-format.md` for the full schema before you write. Come back here for the
judgment calls — the schema tells you what is valid, not what is true.

## Flow A: audit a new page

Work in this order. Queries before fields, because a field's row is meaningless until you know
which request feeds it.

### 1. Locate the page

Find the route, then the component that route renders. Record every file you open — they go in
`sources`, and Flow B depends on them being honest.

### 2. Inventory the queries

Follow the component down through its composables / hooks / stores to the actual HTTP calls.
For each one record: the endpoint and method, the client function name, the parameters that
matter, and the refresh interval **in milliseconds** (`refetch`).

Things that are easy to miss and change the numbers:

- Requests fired in parallel from one logical query (e.g. four scenarios at once) → `httpCount`
- Requests that do not fire on every page load (hidden card, unmounted component) → `conditional`
- Requests fired by the layout or by a shared component rather than by this page's cards →
  `origin: 'layout'` / `'component'`. These have no fields; they exist so the Network panel
  reconciles.
- A gate on the query (`enabled: computed(() => !!siteId)`) → `enabledWhen`, in prose

`enabledWhen` and `conditional` answer different questions, and the tool can answer neither on
its own — `enabledWhen` is prose it cannot evaluate:

- **`enabledWhen`** — under what condition does this query run at all?
- **`conditional`** — is it absent from a _normal_ page load?

A gated query is often not conditional. If the gate is "the user is logged in", it holds while
someone is reviewing, so the request does fire and belongs in the baseline. Mark `conditional`
only when the reviewer should _not_ expect to see it — a collapsed card, an unmounted component.

The reverse never holds: `conditional: true` always needs `enabledWhen`, and the build rejects
it otherwise. A reconciliation list that names a query without saying when it fires is useless
to the person staring at the Network panel.

### 3. Inventory what the screen shows

Read the template. Every value a user can read is a field: card numbers, table columns, chart
axis labels, badge text, units. Group them into `sections` the way the page groups them
visually, and set `kind` to match (`card` / `chart` / `table` / `filter` / `form`).

Fields the frontend invents — hardcoded units, axis labels, local UI state — are still fields.
They get no `query`, and `resp: null`.

### 4. Trace each field

This is the actual work. For one field, answer three questions:

1. **Which query, and which response path?** Write the path the way the API returns it:
   `totals.revenue`, `items[].amount`. Use `null` — the JSON literal, not a dash — when the
   value does not come from an API. `resp` stays required so that "I checked, there is none"
   never looks like "I forgot to fill this in".
2. **What does the frontend do to it?** One sentence in `how`. Describe the _operation_, not
   the value: "takes the last item", "sums `items[].qty`", "looks up the code in a static map".
3. **How is it rendered?** `display` covers formatting, units, and — the part people forget —
   what happens when the value is null, zero, or the list is empty.

Then classify `source`. This is the dimension a reviewer slices by, because it answers "who do
I go to when this number is wrong":

| `source`      | The number was computed by            | Typical shape                        |
| ------------- | ------------------------------------- | ------------------------------------ |
| `direct`      | the backend, taken as-is              | `items[0].name`                      |
| `backend-agg` | the backend, pre-aggregated           | `totals.revenue`                     |
| `fe-pick`     | the frontend, choosing one item       | last element, max by date            |
| `fe-agg`      | the frontend, combining items         | `reduce`, `Math.max`                 |
| `fe-derive`   | the frontend, computing or looking up | unit conversion, joining two queries |
| `fe-const`    | nobody — it is hardcoded              | a unit string, an axis label         |

The split that matters is `direct`/`backend-agg` versus the `fe-*` family: the first two you
cannot fix in the frontend, the rest you can.

### 5. Write the file

Write `<dataDir>/<page>.json`. Keep `sources` and `auditedAt` truthful — `auditedAt` is the day
you _read the code_, not the day someone verified the UI.

### 6. Validate

```bash
npx fieldproof build
```

It rejects duplicate ids, references to queries that do not exist, duplicate Network filters,
and a `page` that does not match the filename. Fix and rerun until it passes. Report the load
summary it prints — an unexpectedly large "per hour" number is usually a real finding.

## Flow B: refresh an existing file

fieldproof does not decide whether its JSON still matches the code — that is your job, and the
file gives you what you need to do it. It relays exactly one fact from git: `fieldproof build`
prints the pages whose `sources` were committed after their `auditedAt`. That names the pages
worth re-reading. It says nothing about whether the behaviour actually changed.

1. Read the existing data file. Note `auditedAt` and `sources`.
2. Diff those source files since that date (`git log --since=<auditedAt> -- <sources>`), and
   check whether the page grew new files that are not in `sources` yet.
3. For each change, update the affected fields — and **only** those. Leave the rest byte-identical.
4. Bump `auditedAt` to today and add any newly-read files to `sources`.
5. Run `npx fieldproof build` and report which fields changed.

Why "only those" matters: the HTML review tool fingerprints each field's data side and display
side separately, and invalidates a human's existing ✓ when the fingerprint changes. Rewording
a `how` that did not actually change behaviour forces someone to re-verify a field for nothing.

For the same reason, **`page`, `section.key` and `field.id` are stable identifiers**. Review
state is keyed on `page/section.key/field.id` in the browser's localStorage. Renaming one
silently orphans that field's review state. Rename only when you mean to reset it, and say so.

## Judgment calls

### Do not invent

If you cannot trace a value to its source, do not guess a plausible one. Write what you do
know, put the uncertainty in `note`, and flag it:

- `fragile` — it works but rests on something brittle (string matching, array position)
- `backend-pending` — the current behaviour is a workaround, the backend has not settled
- `exception` — it deliberately breaks a convention the rest of the app follows

A field marked `fragile` with an honest note is far more useful than a confident wrong `how`.
If a chain is genuinely unresolvable, say so in your reply rather than burying it.

### `checks` only where the rule is not obvious

`checks` turns a display rule into cases someone can tick off: `{ given: "response = 0",
expect: "0, not —" }`. Add them where the rule has an exception or an easily-confused edge
(zero vs null vs missing, rounding, unit thresholds). Adding one to every field just makes the
review longer without making it sharper.

### `filter` is optional, and has a precondition

`filter` is a single contiguous substring pasted into the DevTools Network panel to isolate one
request. `A=1&B=2` only survives if the project pins query-parameter order (e.g. an
`perfectionist/sort-objects` lint rule). Without that guarantee, **omit `filter`** or use just
the endpoint path. Filters must be unique within a page; the build rejects duplicates.

### Write `how` and `display` for a human

They are free text on purpose. Someone reads them while looking at the screen, so they should
sound like an explanation, not a spec:

- Good `how`: "sums `items[].qty`, ignoring rows with `status = void`"
- Bad `how`: "aggregation" — true and useless
- Good `display`: "thousands separator, 2 dp; null and empty list both render `—`"
- Bad `display`: "formatted number"

## Report back

When you finish, tell the user:

- Which page, how many sections / fields / queries
- The load summary from `fieldproof build`
- **Anything you could not resolve**, and what you assumed
- Which fields you changed, if this was Flow B

The unresolved list is the most valuable part of your reply. It is what turns into the next
conversation with the backend.
