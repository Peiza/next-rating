# Change explanation plan ("Why it changed")

## Context

The Rating tab shows the predicted rating and a change line ("−3 vs official
rating"), but not why. A new low round can be outweighed by a high round that
no longer counts twice, a round that left the window, or a dropped round that
counts again. Those effects are hard to see from the round list. This step
(CLAUDE.md, Architecture 6) adds a short "Why it changed" list under the change
line. It compares the last official update with the prediction, using the real
engine.

Decisions (agreed):
- **Exact split**: the engine runs twice, on the official rounds only
  ("before") and on all rounds ("after"). Each round's effect is
  `(weightAfter − weightBefore) × (rating − exactBefore) / totalWeightAfter`.
  Weights and statuses come from the real engine runs, and the effects add up
  exactly to `exactAfter − exactBefore`. Interactions, such as a new round
  moving the window, are credited to the rounds whose weight actually changed.
  This works because `Σ wBefore·(r − exactBefore) = 0`.
- **Per round, top 5**: one line per round, largest |effect| first. The first
  5 lines show, and the rest open under a "Show all N" `<details>`.

Branch `change-explanation`, one pull request, two commits.

## Commit 1: Engine — `explainChange`

New `src/engine/explain.ts`, exported from `src/engine/index.ts`. It is pure
and has no app types.

```ts
export type ChangeKind =
  | 'new'                // not an official round
  | 'left-window' | 'entered-window'
  | 'started-doubling' | 'stopped-doubling'
  | 'newly-dropped' | 'no-longer-dropped';

export interface ChangeItem {
  id: string;
  kind: ChangeKind;
  rating: number;
  before: RoundStatus | null;   // null for a new round
  after: RoundStatus;
  /** Rating points this round moves the unrounded prediction. */
  effect: number;
}

export interface Explanation {
  before: Prediction;           // official rounds only
  items: ChangeItem[];          // largest |effect| first
  /** exactAfter − exactBefore; the effects add up to this. */
  total: number;
}

export function explainChange(rounds: readonly RoundInput[], after: Prediction): Explanation | null;
```

- `before = predictRating(rounds.filter(r => r.source === 'official'))`. It
  returns null when `before.exact` or `after.exact` is null, for example with
  no ratings details imported.
- **Which rounds are listed**:
  - every non-official round with a rating, including new rounds that are
    dropped or outside the window, with effect 0 (they explain why a new
    round did not count)
  - every official round whose weight changed
  - New DNF rounds and dropped rounds that leave the window are left out,
    since nothing changes for them.
- **Kind of an official round**, from its status before and after. Counted
  means included or doubled:
  - left or entered the window
  - counted → dropped, or dropped → counted
  - included ↔ doubled
- `entered-window` covers a rare case: a later anchor can switch to the
  24-month fallback and bring older rounds back.
- **Sort**: |effect| descending. Ties put new rounds first, then keep input
  order (newest first).

**Tests** (`tests/engine/explain.test.ts`, synthetic data):
- The effects add up to `total` (within 1e-9) in every case below.
- The CLAUDE.md example: a 985 round that stops counting twice outweighs a
  new 938 round, so it is listed first, with a down arrow.
- Each kind: new round; left window; started and stopped doubling; newly
  dropped; no longer dropped (a previously dropped round that counts again);
  entered window through the 24-month fallback.
- A mid-event double-weight boundary: the highest round of the event starts
  counting twice.
- Hole weighting: a 9-hole new round has half the effect of an 18-hole round
  with the same rating.
- A new round that is dropped is listed with effect 0. A new DNF round is not
  listed.
- It returns null with no official rounds. It returns an empty list when only
  official rounds exist.

**Fixture test** (local only, added to `tests/engine/fixture.test.ts`): the
details rounds plus the unofficial event's rounds. `before.rating` equals the
profile's official rating, and the effects add up to `total`. It asserts no
fixture values.

This commit also saves this plan as `docs/plan-change-explanation.md`.

**CLAUDE.md: a new step, "Polish after favorites"** (written down only, not
built yet):
- Process: a new line right after "Change explanation", "Polish after
  favorites (Architecture 7)".
- Architecture: a new item 7 after the change explanation. The current 7 to
  9 become 8 to 10, and every cross-reference is checked. The item lists my
  nine points, close to my wording:
  1. Links to pdga.com (ratings details, events, player search) open in the
     same tab, not a new one. The bookmarklet brings the user back to the app
     in that same tab, so repeated imports don't pile up tabs.
  2. Main page header: the data age as relative time ("58 minutes ago")
     right after the player's name and number. The exact import date stays
     further down.
  3. Main page: a "Refresh on pdga.com" button that opens the shown player's
     ratings details page, like the link in the players list.
  4. Players list: "me" always first. The others are sorted A to Z by
     default, with a switch for "last updated".
  5. Round list: the event name of each official or unofficial round links to
     its pdga.com event page. It is a plain link; the app loads nothing
     itself.
  6. Player search by name: one name field in the players panel. It opens
     `https://www.pdga.com/players?FirstName=<first>&LastName=<last>`.
     - One word is searched as the last name.
     - With two or more words, the first word is the first name and the rest
       is the last name.
     - pdga.com matches parts of names, so partial names work. The user picks
       the player there and runs the bookmarklet.
  7. Text size: scale the type down from tablet width and up, since it is too
     large on laptop-sized screens.
  8. Remove paste import completely: the Import tab, the phone hint and the
     tab-separated parsing. It doesn't work from a computer either, because of
     how pdga.com marks up the table headers. The page parsers stay, since
     bookmarklet hand-offs use them.
  9. Next to the prediction: the expected date of the next ratings update,
     the second Tuesday of the month.
- Point 8 contradicts the paste-import text in Architecture 2, 4 and 5.
  - Those lines stay as they are for now. The new item says it replaces them.
  - The commit that removes paste import also removes those lines.

## Commit 2: Model and Rating tab

**Model** (`src/app/model.ts`): `buildModel` calls
`explainChange(rounds, prediction)` and adds
`changes: { round: ListedRound; item: ChangeItem }[] | null`, joined by id, plus
`officialMismatch: number | null`. The mismatch is `before.rating` when it
differs from `player.currentRating`. That happens with stale ratings details
after a new official update.

**View** (`src/app/views/rating.ts`): a new `whyChanged(model)` goes right
after the change line, inside the summary. It is shown only when the change
line shows (`prediction.change !== null`) and there is at least one item.
- `<section aria-labelledby>` with an `h2` "Why it changed" and a `<ul>`.
- **Each line**:
  - an arrow (`aria-hidden`) and the signed effect with one decimal
  - reuse the `change-up` / `change-down` classes, so no new colour tokens
    are needed and the contrast test does not change
  - when the effect rounds to 0.0: "→" and no colour
  - the text by kind ("New round 938", "985 no longer counts twice", "901
    left the window", "952 counts again (no longer dropped)", "New round
    820, dropped")
  - a muted second line with the event name, round label and date (reuse
    `roundLabel`)
- Items 6 and later go in a `<details>` "Show all {count}".
- With `officialMismatch`, a hint: "The official rounds give {computed}, not
  {official}. Import the ratings details again for exact effects."
- **Format** (`src/app/format.ts`): add `formatEffect(value)`. It has one
  decimal, `signDisplay: 'exceptZero'`, no grouping and a true minus sign:
  "−1.4", or "−1,4" in Swedish. Its unit test sits next to the
  `formatChange` tests.
- **Styles**: `.reasons` list spacing, and the muted detail line, using
  existing tokens only.

**i18n** (`en.json` and `sv.json`): `why.title`, `why.showAll` (plural),
`why.new`, `why.newNotCounted` (with the status label), `why.leftWindow`,
`why.enteredWindow`, `why.startedDoubling`, `why.stoppedDoubling`,
`why.newlyDropped`, `why.noLongerDropped`, `why.mismatch`.

**Tests**:
- `tests/app/model.test.ts`: `changes` joined to listed rounds, null without
  ratings details, and `officialMismatch`.
- `tests/app/views.test.ts`:
  - the section appears under the change line
  - arrows and signs are in text, not colour alone
  - the 6th item sits inside `<details>`
  - the section is hidden when nothing changed or the official rating is
    unknown
  - the mismatch hint
- Rendering stays `textContent` only. `tests/security.test.ts` is unchanged.

**Docs**:
- **CLAUDE.md**: mark "Change explanation" done in Process.
- **README**: one sentence on the "Why it changed" list.

## Reused

- `predictRating`, `RoundStatus`, `Prediction` (`src/engine/`)
- `ListedRound`, `mergeRounds` (`src/parsers/rounds.ts`)
- `el` (`src/app/dom.ts`)
- the `change()` arrow pattern and the `roundLabel` helper
  (`src/app/views/rating.ts`)
- `formatDate` and `formatRating` (`src/app/format.ts`)
- the `t` plurals (`src/i18n`)

## Verification

- Run `npm run typecheck`, `npm test` (fixture tests run locally),
  `npm run check:i18n` and `npm run build`.
- There is no local preview or hand-off URL. The fixture test covers the real
  data locally.
- Before each commit, check the staged diff for fixture names and numbers
  (`tests/fixtures/expected.json`).
- **After merging, on the phone** (done by me):
  - Run the bookmarklet on my details page.
  - Check that the list makes sense against the round list, in light and
    dark, and in Swedish (comma decimals).
