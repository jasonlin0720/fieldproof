# Changelog

Notable changes to fieldproof. Format follows [Keep a
Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The **data format is part of the public API** — a change to it is a breaking change, even though
it is JSON rather than code.

## [Unreleased]

_Nothing yet._

## [0.2.0] - 2026-08-21

Everything here is the review UI. The data format is untouched.

### Added

- Review UI: filters, grouping, status and the search term are mirrored into the URL, so a view
  can be reloaded and shared. Verification marks stay out of it — they are personal and belong
  in local storage. Unrecognised values in the URL are dropped (and reported to the console)
  rather than silently filtering the table down to nothing.
- Review UI: <kbd>/</kbd> focuses the search box from anywhere, <kbd>Esc</kbd> clears it.
- Review UI: chips and tags that carry a tooltip (query, flags, checks, _definition changed_)
  now expand the row as well, so expanding no longer means travelling back to the first column.
  The row body and the field label stay unclickable so text selection still works.
- Review UI: responsive layout for narrower screens. Columns are dropped in stages (observed
  value and note, then query), and the table area became its own scroll container so the toolbar,
  the filter bar and the table header stay put no matter which way you scroll.

### Fixed

- Review UI: the three sticky offsets (filter bar, table header, group rows) were hardcoded
  constants while the filter bar has always been able to wrap, so the header could sit in mid-air
  and group titles could cover their own first row. Two of them are gone entirely now that the
  layout is flex-driven; the remaining one is measured.
- Review UI: the page itself used to scroll sideways when the table could not shrink any further,
  dragging the sticky toolbar and header out of view along with it.
- Review UI: multi-select filter panels near the right edge of the window overflowed it, leaving
  some options unclickable. They now flip to right-alignment, and open inline on narrow screens.
- Review UI: the **▸** button is centred inside its cell by default, which drifted half a row
  away from the field it points at once rows grew tall. It now aligns to the top of the row.

### Upgrading

The generated HTML changed, so `build --check` will report the committed output as stale until
you regenerate it:

```sh
npx fieldproof build   # then commit the regenerated files
```

Nothing else to do — `schema.ts` did not change, so your data files, your config and your
recorded review marks all carry over as they are.

## [0.1.0] - 2026-08-21

First release. The entries below describe the shape it shipped in rather than changes against a
predecessor — there wasn't one.

### Added

- `--version`.
- `en` locale alongside `zh-TW`. `fmt()` gained a two-form plural syntax (`{n|one|other}`)
  because `ui` strings are serialized into the browser and cannot hold functions. `Intl.PluralRules`
  is deliberately not used — its output is tied to the bundled ICU version, and generated output is
  compared byte for byte.
- A bundled skill that teaches an agent to write the data files, installed with
  `fieldproof skill --install`.
- `namespace` config key, scoping review state in `localStorage`. Every page opened over `file://`
  shares one origin, so two projects with a `dashboard` page would otherwise overwrite each other.
- Orphan detection: `outDir` files whose data file is gone are reported by `build` and fail
  `--check`. They are never deleted automatically — they are usually committed, so that is the
  user's call.
- A re-audit hint. `build` asks git whether any file in a page's `sources` was committed after
  its `auditedAt`, and names the pages where that happened. The fingerprints only ever caught
  "the JSON changed and the old checkmark is still there"; nothing caught the other direction,
  where the code moved and the JSON did not, and a reviewer ticks fields off against a claim
  that has quietly gone stale. It reads no content, needs no new dependency, stays out of the
  generated files, and does not affect the `--check` exit code — a formatting-only commit trips
  it. Silently skipped when git is unavailable. Also exported as `findDrift`.
- `unresolved` flag, for a field whose chain could not be traced. Every other key on a field is
  an assertion — `source`, `how` and `display` are all required, and none of the six `source`
  values means "I don't know" — so an untraceable chain had to be written as though it had been
  traced. The review tool gained a **Flags** filter (hidden on pages with no flagged fields) so
  the guesses can be pulled out of a sixty-row table instead of hiding behind a corner icon.
- `outDir` is created if it does not exist, instead of failing with `ENOENT`.

### Changed

- **`resp` now takes `null`** instead of `"—"` when a value comes from no API. The dash was a
  display concern living in the data, compared against separately in three places. `resp` stays
  required, so "I checked, there is none" and "I forgot" remain distinguishable. A data file
  still using `"—"` is rejected with a message pointing at `null`.
- **`conditional: true` now requires `enabledWhen`.** The two are not interchangeable —
  `enabledWhen` says under what condition a query runs at all, `conditional` says whether to
  expect it on a normal page load — but a conditional query that cannot say when it fires makes
  the reconciliation list useless.
- The Markdown output no longer repeats every field in a "backend vs frontend" summary table.
  It was 14% of the document restating what the section tables already say, and its two columns
  paired unrelated rows by index — actively misleading to an LLM. The one derived line, the
  source distribution, moved into the overview.
- Generated files carry a `fieldproof:generated` marker, so the tool can recognise its own output
  without claiming files you put in `outDir` yourself.
- Generated output no longer links to a `README.md` in the output directory. That was an
  assumption about the consumer's layout; cross-page conventions belong in the skill.
- CLI messages now use the configured locale instead of always the default.

### Fixed

- **The CLI did nothing when run through `node_modules/.bin`.** The entry-point check compared
  `process.argv[1]` against `import.meta.url` without resolving symlinks, so `npx fieldproof`,
  `pnpm fieldproof` and every npm script exited 0 having done nothing. Only a real pack-and-install
  test surfaced it.
- `fieldproof skill` now respects the configured locale instead of always using the default.
- English: "1 query poll" reads "1 query polls".

- Clicking a table row no longer expands it. Both drag-selecting and double-clicking to copy a
  response path were being read as expand gestures, and the re-render wiped the selection.
  Expanding is now the ▸ button only, which fills its cell to keep the click target large.
- Expanding and collapsing patch the affected row instead of redrawing the whole table, so text
  selection, input focus and scroll position survive.
- The "definition changed" tag now updates its wording when one side is re-verified, instead of
  only disappearing once both are.
- A malformed data file reports which file it is, instead of a bare JSON parse position.

### Migrating

For each data file:

1. Replace `"resp": "—"` with `"resp": null`.
2. Add `enabledWhen` to every query marked `"conditional": true`.
3. Run `fieldproof build`. Both are validated, so anything missed is named with its file and
   field.

Existing review marks survive: `resp` is part of the data-side fingerprint, so those fields ask
to be re-verified on the data side only, which is the correct outcome.

[unreleased]: https://github.com/jasonlin0720/fieldproof/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jasonlin0720/fieldproof/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jasonlin0720/fieldproof/releases/tag/v0.1.0
