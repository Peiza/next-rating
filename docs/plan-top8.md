# Top 8 panel plan (CLAUDE.md, Architecture 10)

## Context

A collapsible panel on the Rating tab, styled like the PDGA Global Masters
Series (GMS) player card but for any player: Sum, Average and High, then the
8 highest rated rounds. It uses only data the app already has and does not
change the prediction.

Decisions (agreed):
- **Rounds**: official and unofficial rounds with a rating, not DNF. No
  manual rounds, no hole weighting. Rounds the prediction drops as outliers
  still count, as in GMS.
- **Calendar year** (the default): 1 Jan to 31 Dec of the year of
  `today(now)`. Unofficial rounds after the report deadline count, since they
  were rated this year. On New Year's Day the panel starts empty.
- **Rating window**: exactly `prediction.stats.windowStart` to `windowEnd`,
  the prediction's anchor and 24-month fallback. A manual round that is the
  most recent rated round sets the anchor even though it is not listed.
  Rounds after the deadline fall outside that range.
- **Order**: highest first; on equal ratings the newer round first, then
  engine input order.
- **Figures**: Sum with `formatRating` (no thousands separator), Average =
  `Math.round(sum / n)`, High = the top rating. With fewer than 8 rounds the
  figures are for those rounds, and a line says how many were found. With
  none, an empty text replaces the figures.
- **Placement**: after Statistics, before the round list.
- **Period choice**: kept in memory until the page reloads; no storage
  change. Not reset when the player changes.
- **Open state**: the Top 8 and Statistics `<details>` both stay open across
  re-renders (state in main.ts, updated from the `toggle` event).
- **Look**: the GMS card layout in the app's own themes: a band with the
  period, the figures in the order Sum, Average, High, then the list with the
  round label first ("RD 1"), the event name, and the rating right-aligned in
  bold. No PDGA logos or assets.

Branch `top8-panel`, one pull request, three commits.

## Commit 1: Engine, `topRounds`

New `src/engine/top8.ts`, exported from `src/engine/index.ts`. Pure, with no
notion of periods.

```ts
export const TOP_COUNT = 8;

export interface TopResult<T extends RoundInput> {
  rounds: T[];             // highest first, at most 8
  found: number;           // rated rounds in the range
  sum: number | null;
  average: number | null;  // Math.round(sum / rounds.length)
  high: number | null;
}

export function topRounds<T extends RoundInput>(
  rounds: readonly T[], from: PlainDate, to: PlainDate): TopResult<T>;
```

- Both range ends are inclusive. A round's date is its event's last day, so
  a multi-day event belongs to the year it ended.
- `tests/engine/top8.test.ts`, synthetic rounds only: DNF and manual left
  out, inclusive edges, fewer than 8 and none, more than 8, ties newer first,
  short rounds counted fully, average rounding half up.

## Commit 2: App, the panel on the Rating tab

**Period** (new `src/app/top8.ts`, pure): `topEight(model, period, today)`
picks `{ from, to }` for `'year'` or `'window'` and runs `topRounds` on
`model.rounds`. The window is null when the prediction has none.

**View** (new `src/app/views/top8.ts`):
- `<details id="top8">` with the summary "Top 8". `open` comes from main.ts
  and the `toggle` event reports changes back.
- The period as a `segmented()` control: the year (default) and "Rating
  window", with the window's dates under it.
- The card: a band in `--accent`/`--on-accent` with the period; three tiles
  on `--surface` (Sum, Average, High); an `<ol>` of rows with the round label
  ("RD 1"), the event name linked to its pdga.com event page as in the round
  list, and the rating right-aligned in bold. Existing colour tokens only.
- The found line with fewer than 8 rounds; the empty text with none.

**Statistics**: `statsPanel` gets `open` and `onToggle` the same way.

**main.ts**: `top8Open`, `top8Period` (`'year' | 'window'`) and `statsOpen`,
in memory only.

**i18n**: `top8.*` keys in en.json and sv.json.

**Styles**: a `.top8` block: band, tiles in one row at 320 px, tabular
numbers.

**Tests**:
- `tests/app/top8.test.ts`: year bounds follow today (New Year's Day too),
  the window comes from the prediction, after-deadline unofficial rounds
  count in the year but not the window, manual rounds never listed.
- View tests: closed by default, after Statistics, year selected by default,
  switching calls back, the found line, event links, the empty text, the
  open state from props.
- `tests/app/main.test.ts`: open, switch to the window, re-render: still
  open on the window. Statistics stays open across a re-render.
- Local only (skipped without fixtures): on each details fixture, the list
  is sorted, at most 8 long, and adds up to Sum. No expected values, so no
  personal data.

## Commit 3: Docs

Move Architecture 10 from CLAUDE.md to docs/finished-steps.md with a short
"Built as" note. Update CLAUDE.md's "Built" list and "Done so far", and the
README if it lists features.

## Critical files
- New: `src/engine/top8.ts`, `src/app/top8.ts`, `src/app/views/top8.ts`,
  `tests/engine/top8.test.ts`, `tests/app/top8.test.ts`, `docs/plan-top8.md`
- Changed: `src/engine/index.ts`, `src/app/views/rating.ts`,
  `src/app/main.ts`, `src/i18n/locales/en.json`, `src/i18n/locales/sv.json`,
  `src/app/styles.css`, `CLAUDE.md`, `docs/finished-steps.md`
- Reused: `Model.rounds` and `prediction.stats` (src/app/model.ts),
  `segmented()`, `eventUrl`, `formatRating`/`formatDate`/`today`

## Verification
`npm run typecheck`, `npm test` (fixture tests run locally),
`npm run check:i18n` and `npm run build`. No preview server; tested on the
phone after merging.
