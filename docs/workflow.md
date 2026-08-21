# Reviewing a page

How to actually use the generated HTML. The [data format
reference](../skills/fieldproof/references/data-format.md) covers writing the JSON; this covers
what happens after `fieldproof build`.

- [The loop](#the-loop)
- [Reading a row](#reading-a-row)
- [Marking](#marking)
- [Narrowing what you see](#narrowing-what-you-see)
- [Reconciling the Network panel](#reconciling-the-network-panel)
- [When a definition changes](#when-a-definition-changes)
- [Handing off what you found](#handing-off-what-you-found)
- [Where your ticks live](#where-your-ticks-live)

## The loop

Open two windows: the page you are reviewing with DevTools on the Network tab, and
`<outDir>/<page>.html`. The HTML makes no requests of its own — not even a favicon — so the
Network panel stays clean enough to reconcile against.

Then, per field: read what the JSON claims, look at the screen, mark it. The point is that you
never have to re-derive the claim; someone already walked the chain and wrote it down.

Nothing is submitted anywhere. Your marks live in the browser, and the "punch list" you export
at the end is a block of Markdown on your clipboard.

One caveat before you start: the JSON is a claim someone made on the day in `auditedAt`, and the
code has moved since. `fieldproof build` prints the pages whose `sources` were committed after
that date — if the page you are about to review is on that list, refresh the data file first.
Ticking fields off against a stale claim is worse than not reviewing at all.

## Reading a row

| Column                       | What it tells you                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **UI field**                 | The label as it appears on screen. Flag icons and a "N checks" tag hang off it                                  |
| **Query**                    | Which request feeds it. Hover a chip for the endpoint and parameters. `—` means the frontend invents this value |
| **Response field**           | The path in the response body, e.g. `items[].amount`                                                            |
| **Expected value / display** | Two lines: how the value is obtained (with a coloured chip for `source`), and how it should be rendered         |
| **Value on screen**          | Free text. Type what you actually saw — this is what makes a ✗ actionable                                       |
| **Data** / **Display**       | The two ✓ / ✗ pairs. See [Marking](#marking)                                                                    |
| **Note**                     | Free text, yours                                                                                                |

The `source` chip is the dimension worth slicing by, because it answers _who do I go to when
this is wrong_: `direct` and `backend-agg` are the backend's; every `fe-*` is yours.

Click the **▸** in the first column to expand a row. You get the query's endpoint, SDK function,
parameters, enable condition, and any notes — plus the verification checks if the field has
them, laid out as _given → the screen should_.

The chips and tags carrying a tooltip — the query chip, the flag icons, the checks tag, the
_definition changed_ tag — expand the row too, so you rarely have to travel back to the first
column. The `?` cursor is the tell: those elements have more to say, and expanding is where it
is said.

The row body itself stays unclickable, and so does the field label. That is deliberate: it means
you can select and copy a response path without the row folding open underneath you.

## Marking

Each field gets **two independent verdicts**, because they fail for different reasons and get
fixed by different people:

- **Data** — is this the right number? Wrong query, wrong response path, wrong aggregation.
- **Display** — is it rendered correctly? Formatting, units, and what happens when the value is
  null, zero, or the list is empty.

A field counts as verified only when both sides are marked and neither has gone stale. Clicking
the same button again clears that side.

When you mark ✗, fill in **Value on screen**. "Revenue is wrong" starts a conversation;
"Revenue shows 1,234 but the summary says 12,340" ends one.

## Narrowing what you see

Sixty fields is too many to hold at once. The controls above the table exist to cut that down:

- **Group by section** (how the page is laid out) or **by query** (which request you are
  currently watching in the Network panel). Grouping by query is the one to use when you are
  working request by request.
- **Section / Query / Source** — multi-select, each option showing how many fields it holds.
- **Flags** — appears only when the page has flagged fields. `unresolved` is the one to check
  first: it means whoever wrote the JSON could not trace that chain, so the row is a guess and
  the ✓ you are about to give it would be worth nothing.
- **Status** — _unverified_ to see what is left, _problems_ to review what you flagged,
  _definition changed_ to see what needs re-checking.
- **Search** covers labels, response paths, how, display, and your own notes and observed values.
  Press <kbd>/</kbd> from anywhere to jump into it, <kbd>Esc</kbd> to clear it again.

The progress bar counts the whole page, not the current filter; the filtered count appears
beside it.

### Sharing a view

Filters and the search term live in the URL:

```
dashboard.html?q=isbn&g=query&s=unverified&src=direct,fe-derive
```

Reload and you land on the same view; send the link and someone else does too. Handy for _these
four fields are the ones I could not verify — take a look_.

Your marks are **not** in the URL. They are a personal pass over the page and stay in this
browser's local storage, so sharing a view never ships your verdicts along with it. The URL
also wins over whatever grouping this browser remembered, since a shared link is a deliberate
choice rather than a leftover habit.

## Reconciling the Network panel

**Reconcile Network** opens a checklist of every query on the page: id, endpoint, the filter
string to paste into DevTools, how many requests it fires, where it comes from, and which
sections it feeds.

The lead line tells you how many requests to expect on load, and how many more arrive each hour
once polling starts. These numbers are derived from the query definitions, not hand-maintained.

Use it in both directions:

- **Something in the panel with no row here** — a duplicate request, a component fetching on its
  own, a missing de-duplication. That is a finding.
- **A row here with nothing in the panel** — the query never fired. Check its enable condition
  before assuming it is broken.

Queries marked conditional are listed separately with the condition that gates them, so a
missing request that _should_ be missing does not read as a bug.

Some queries feed no fields at all — a layout-level store switcher, a shared badge's lookup
table. They are listed anyway, because otherwise the request count will not add up.

## When a definition changes

Ticking a field records a fingerprint of what you verified. When the JSON changes afterwards,
affected fields are marked **definition changed** and stop counting as verified.

The data side and the display side are fingerprinted separately, and that separation is the
point:

| What changed in the JSON         | Data verdict | Display verdict |
| -------------------------------- | ------------ | --------------- |
| `query`, `resp`, `source`, `how` | invalidated  | kept            |
| `display`                        | kept         | invalidated     |
| `checks`                         | invalidated  | invalidated     |
| `label`, `note`, `flags`         | kept         | kept            |

So rewording a display rule does not throw away your conclusion that the number itself was
right. Filter by **definition changed** to see exactly what needs another look; re-marking a
side clears it.

If you inherit marks from an older version of the tool that has no fingerprints, everything
reads as stale. That is deliberate — an unverifiable tick is not worth trusting.

## Handing off what you found

**Export punch list** copies Markdown to your clipboard: a summary line, then one section per
broken field with its query, response path, what was expected, what you saw, which side failed,
and your note.

It is meant to be pasted straight into an issue or a message. Everything the other person needs
to reproduce is already in it, which is the payoff for filling in _Value on screen_ as you go.

## Where your ticks live

In `localStorage`, under `fieldproof:v1:<namespace>:<page>`. Consequences worth knowing:

- They are per browser and per machine. They are not shared, not committed, and not backed up.
- Every page opened over `file://` shares one origin. If you review more than one project this
  way, set `namespace` in the config or two pages with the same name will overwrite each other.
- **Reset** clears every mark on the page and cannot be undone. It asks first, and tells you how
  much you are about to throw away.

Review state is deliberately not in git. The JSON is a claim about the code and belongs under
review; your ticks are one person's pass over one build, and go stale the moment either changes.
