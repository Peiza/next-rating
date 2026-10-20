# Target calculator plan (CLAUDE.md, Architecture 9)

## Context

The Rating tab shows the predicted rating, but not what it takes to reach a
goal such as 1000. The target calculator answers this: "average at least X in
your next N rounds to reach the target at the next update." It uses the real
engine, not a shortcut formula. Hypothetical rounds are added and the lowest
average that works is searched for, so the window, outlier drops and double
weighting all apply exactly as in the prediction.

Decisions (agreed):
- **Plausible range**: whole round ratings from 0 to a fixed cap of **1150**.
  A target that 1150 rounds cannot reach is out of reach.
- **Safe threshold**: the answer is the lowest whole rating X such that every
  whole rating from X up to 1150 reaches the target. That way playing better
  never shows as worse. It is found by scanning down from the cap. When the
  prediction rises steadily with the rating, this is the same as "the lowest
  rating that reaches the target". It differs only in the rare case where a
  very low round is dropped as an outlier but still moves the window.
- **Already reached**: say so, and also show the minimum average that keeps
  the rating at or above the target after N rounds.
- "Reaches" means the rounded prediction (what the app shows) is ≥ target.

Branch `target-calculator`, one pull request, four commits. A small manual
entry fix comes first, as its own commit.

## Commit 0: Undo for deleting a manual round

Deleting one manual round happens at once, with no confirmation. A mistaken
tap should be reversible. "Delete all manual rounds" keeps its confirm row.

- `src/app/players.ts`: `restoreManualRound(data, pdgaNumber, round, index)`
  puts the same stored round (same id) back at its old index. The list order,
  the same-date tie-break and the engine input are then exactly as before.
  It does nothing if the player is gone, the id already exists, or the player
  is at `MAX_MANUAL_ROUNDS`.
- `src/app/main.ts`: `deleteManual` remembers
  `manualUndo = { player, round, index }`. The state lasts past re-renders,
  unlike the one-render `manualFlash`, so a focus or visibility re-render does
  not lose the Undo. It is cleared by the next add, delete-all, closing the
  form, a change of player, or Undo itself. After a delete, focus goes to the
  Undo button. After Undo, focus goes to the restored round's Delete button,
  and the status says "Restored 985."
- `src/app/views/manual.ts`: the status line shows "Removed 985" with an
  Undo button (`manual-undo`, `button-small`) when `undo` is set. New props
  `undo: { rating } | null` and `onUndo`. The `'deleted'` flash is replaced.
- i18n: `manual.removed` ("Removed {rating}"), `manual.undo` ("Undo"),
  `manual.undoLabel` ("Undo removing round {rating} from {date}"),
  `manual.restored` ("Restored {rating}."), in en and sv. Remove
  `manual.deleted`.
- Tests: `restoreManualRound` (index kept, no duplicate, limits) in
  `tests/app/players.test.ts`. In `tests/app/manual.test.ts`, the Undo button
  shows with the rating and calls back. In `tests/app/main.test.ts`, delete →
  Undo restores the round in its place and storage, the Undo survives a
  re-render, and Delete all still asks first.

## Commit 1: Engine, `targetAverage`

New `src/engine/target.ts`, exported from `src/engine/index.ts`. Pure, with no
app types.

```ts
/** The highest round rating the calculator considers plausible. */
export const MAX_TARGET_ROUND = 1150;

export interface TargetOptions {
  /** Number of hypothetical 18-hole rounds. */
  count: number;
  /** Their date: today. */
  date: PlainDate;
  /** Report deadline of the update they count in, as in predictRating. */
  deadline?: PlainDate;
}

export interface TargetResult {
  /** Prediction for that update without new rounds. */
  without: number | null;
  /** `without` already reaches the target. */
  reached: boolean;
  /** Safe-threshold average (0 = any rounds do it); null when out of reach. */
  average: number | null;
  /** Prediction with `count` rounds at `average`, or at the cap when out of reach. */
  rating: number | null;
}

export function targetAverage(rounds: readonly RoundInput[], target: number, options: TargetOptions): TargetResult;
```

- Hypothetical rounds have the ids and event keys `target:1` to `target:N`,
  `source: 'manual'`, `holes: 18` and the date `options.date`. They come
  first in the input, since on the same date earlier counts as more recent.
- `without` = `predictRating(rounds, { deadline })`.
- If `predict(MAX_TARGET_ROUND)` < target, the target is out of reach.
  Otherwise scan R = 1149, 1148, … down to 0 and stop at the first R that
  fails. The answer is the R above it. Each step is one `predictRating` call,
  so the cost is (1150 − answer) runs.
- Speed, measured on the fixtures (147–375 rounds): the window depends only
  on dates, and the new rounds' date is fixed, so one probe run at 1150 finds
  the rounds that can never matter (outside the window, DNF, after the
  deadline). The scan leaves them out. `dropLimit` in rating.ts sums with
  loops in the same order as `mean()`/`populationStdDev()`, so the results
  are identical, but it no longer builds a list of the other rounds for each
  round. A scan takes 4–11 ms on desktop for a target just above the rating,
  and 32–58 ms in the worst case, a full scan down to 0 (it was 165–258 ms).
- A `RangeError` for a count or target that is not a positive whole number,
  the same way `validate` handles bad input.
- `tests/engine/target.test.ts`, synthetic rounds only:
  - The answer reaches the target and answer − 1 does not, checked with
    `predictRating`.
  - The double weighting changes the answer (≥ 9 counted rounds) compared
    with the same rounds below 9.
  - A new round dated today moves the 12-month window, so an old low round
    leaves it.
  - Unofficial or manual rounds after the deadline are left out.
  - Already reached, with `average` < target. Out of reach, with `rating` =
    the prediction at 1150.
  - A constructed dip case: low rounds get dropped and still reach the target,
    but middling ones do not. The answer is above the dip.
  - A player with no rated rounds: the answer equals the target.
- docs/plan-target-calculator.md: this plan, as with earlier steps.

## Commit 2: App, the calculator on the Rating tab

**Model** (`src/app/model.ts`): add `rounds: ListedRound[]`, the engine input
`buildModel` already builds, so the calculator uses exactly the predicted
rounds (manual rounds included).

**Which update** (new `src/app/target.ts`, pure):
- `targetUpdate(today, nextUpdate)`: when today is after `nextUpdate.deadline`
  (the Monday and Tuesday of update week, before PDGA publishes), rounds
  played today count only in the following update. That update is
  `nextRatingUpdate(today, nextUpdate.update)`. Otherwise it is `nextUpdate`.
- `calculateTarget(model, target, count, today)` runs `targetAverage` with
  that update's deadline. It returns `{ update, following: boolean, result }`.
  In the following-update case, `without` and `reached` also refer to that
  update.
- `readTarget(draft)`: target as a whole number 1–2000 (`RANGES.rating`,
  read like the manual rating), and rounds 1–20. It returns the first field
  that is not valid, with a message key, like `readManualRound`.

**View** (new `src/app/views/target.ts`, following `views/manual.ts`):
- It goes after "Why it changed" and the events-without-rounds hint, before
  Statistics. A toggle button ("Reach a target rating") with `aria-expanded`
  keeps its open state in main.ts across re-renders, the way manual entry does.
- Form: Target rating (text, `inputmode="numeric"`, maxlength 4, prefilled
  with the next multiple of 10 above the prediction, or empty without one),
  Rounds (default 3, maxlength 2), then a full-width Calculate button near the
  thumb. A `role="status"` paragraph holds errors and the result.
- Result lines (all through `t()`, numbers through `formatRating`, dates
  through `formatDayMonth`):
  - Needed: "Average at least 987 in your next 3 rounds to reach 1000 at the
    10 Nov update."
  - Reached: "Already reached: 1003 at the 10 Nov update without new rounds."
    and "To stay at 1000 or above after 3 rounds, average at least 982." (or
    "Any 3 rounds keep it at 1000 or above." when `average` is 0).
  - Out of reach: "Out of reach in 3 rounds: even rounds rated 1150 give 991."
  - Following update: "Rounds played today are after the 8 Nov report
    deadline, so this is for the 8 Dec update."
  - A hint under the form: "Assumes 18-hole rounds played today."
- Validation marks the field with `aria-invalid` and focuses it, as manual
  entry does.

**main.ts**: state `targetOpen`, `targetDraft`, `targetQuery` (the last valid
submitted target and count), reset when the player changes, as `manualPlayer`
does. The result is computed in `currentView` and memoized on a key of
player number, import timestamp, manual rounds, target, count and today. A
re-render (focus, visibility, storage event) then does not re-run the scan,
and adding a manual round or importing updates it. Calculate focuses the
status line, so a screen reader reads the result.

**i18n**: `target.*` keys in en.json and sv.json, with plural forms for the
round count (`.one`/`.other`, like `manual.count`).

**Styles**: reuse `.manual`/`.field`/`.input`/`.status` patterns. A small
`.target` block only for spacing.

**Tests**:
- `tests/app/target.test.ts`: `targetUpdate` on deadline Sunday (next update),
  Monday and Tuesday before publishing (following update), and Tuesday after
  publishing (official rating dated that day, so the next update already
  moved on). `readTarget` limits. `calculateTarget` includes manual rounds.
- `tests/app/views.test.ts` (or a new `target-view` test): closed by default,
  default count 3, prefilled target, submit calls back with the read values,
  an invalid field is marked, each result text, placement before Statistics,
  no innerHTML.
- `tests/app/main.test.ts`: open, calculate, result shown, and it survives a
  re-render. Changing player closes the calculator.
- Local only (skipped without fixtures): on each details fixture, the answer
  reaches the target and answer − 1 does not. Expected values are not
  hard-coded, so there is no personal data. I log the scan time once while
  implementing, to confirm it is fast on the largest fixture.

## Commit 3: Docs

Move Architecture 9 from CLAUDE.md to docs/finished-steps.md, with a short
"Built as" note (cap 1150, safe threshold, the following-update case,
memoized result). Add one line to the manual entry "Built as" note in
Architecture 4: deleting a round offers Undo instead of a confirmation.
Update CLAUDE.md's "Built" list and "Done so far", and the
README if it lists features.

## Critical files
- New: `src/engine/target.ts`, `src/app/target.ts`, `src/app/views/target.ts`,
  `tests/engine/target.test.ts`, `tests/app/target.test.ts`,
  `docs/plan-target-calculator.md`
- Changed: `src/engine/index.ts`, `src/app/model.ts`, `src/app/views/rating.ts`
  (add a `target?: TargetProps` prop, like `manual`), `src/app/main.ts`,
  `src/i18n/locales/en.json`, `src/i18n/locales/sv.json`, `src/app/styles.css`,
  `CLAUDE.md`, `docs/finished-steps.md`
- Reused: `predictRating` (src/engine/rating.ts), `nextRatingUpdate` and
  `compareDates` (src/engine/dates.ts), `RANGES`/`parseInteger`
  (src/parsers/values.ts), `formatRating`/`formatDayMonth`/`today`
  (src/app/format.ts), `el` (src/app/dom.ts), the manual entry
  toggle/form/status pattern (src/app/views/manual.ts)

## Verification
Run `npm run typecheck`, `npm test` (fixture tests run locally),
`npm run check:i18n` and `npm run build`. No preview server. You test on
your phone after merging.
