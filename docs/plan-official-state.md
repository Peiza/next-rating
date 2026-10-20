# Official state plan: leave-one-out drop rule, PDGA's flags, difference line

## Context

For one player, "Why it changed" said that the official rounds gave a
rating two points below the official one, and could not explain the change.
The window matched PDGA's Evaluated flags, but PDGA had dropped a low round that
the engine kept. With PDGA's own Included set and the existing doubling rule,
the official rating came out exactly, so the doubling rule was right.

A local rule check (`tests/engine/fixture.test.ts`, run on saved pages only)
compares candidate rules with PDGA's flags for every saved player:

- Drop rules:
  - one limit from the mean of all rounds in the window (the first engine
    rule)
  - **leave-one-out**: each round against the plain mean and stdev of the
    other rounds
  - one limit from a mean with double weighting
- Hole weights:
  - holes / 18
  - **capped**: min(holes, 18) / 18
  - none

Of four players, only leave-one-out reproduced every player's Included flags.
One player had a 24-hole and a 20-hole round in the window, and holes / 18
missed that player's official rating by one point. The capped weight and no
weight both matched. Capped was chosen, since no saved page contradicts
weighting shorter rounds down yet.

Decisions (agreed):
- **Drop rule**: leave-one-out with the plain mean and population stdev of the
  other rounds. It is not iterated, so two low rounds are each judged with the
  other one still in the set.
- **Hole weight**: min(holes, 18) / 18.
- **Official state** in the explanation: PDGA's own Evaluated and Included
  flags, with only the doubling rule on top. The prediction keeps recomputing
  everything.
- **Difference line**: when the official state still differs from the official
  rating, a "Difference from PDGA's last calculation" line makes the lines add
  up to the change shown.
- **Import hint**: shown only when the ratings details were imported before
  the official rating date.

Branch `official-state`, one pull request, two commits.

## Commit 1: Engine: leave-one-out outlier drop

- `src/engine/rating.ts`:
  - The leave-one-out drop limit per round.
  - The hole weight is capped at 18 holes.
  - `selectDoubleWeighted` is exported.
- Stats: `meanMinusPoints`, `meanMinusStdDevs` and `dropThreshold` are replaced
  by:
  - `lowestInWindow`
  - `lowestLimit`: the lowest round's limit, from the other rounds
  The stats panel rows and the catalogs (en, sv) change with them.
- Tests:
  - The outlier and hole tests are rewritten with synthetic data.
  - `tests/engine/drop-rules.ts` holds the candidate rules.
  - The rule check reads its players from the git-ignored
    `tests/fixtures/expected.json` (`players: [{ label, details, profile }]`).
    It asserts the engine rules, and prints the table with `--silent=false`.
- CLAUDE.md (Rating rules) and the README describe the new rules.

## Commit 2: Official state from PDGA's flags, difference line, hint condition

- Engine:
  - `RoundInput.pdga` holds PDGA's Evaluated and Included flags for official
    rounds. `predictRating` ignores it.
  - `officialState(rounds)` builds the official state from the flags, with the
    doubling rule and hole weights on top. It falls back to `predictRating`
    without flags.
  - `explainChange(rounds, after, officialRating)` uses it, and returns
    `difference` (`after.change − total`) when the official state's rating is
    not the official rating.
- Storage: `StoredImport.detailsAt`, set by imports that bring ratings details.
  Stored data without it reads as `at`, so nothing is migrated or dropped.
- Model:
  - `difference`
  - `staleDetails`: the details were imported before the rating date
  These replace `officialMismatch`.
- View:
  - The difference line goes last in the visible list.
  - The hint shows only with `staleDetails`.
  - i18n: `why.difference` and `why.staleDetails` are added, and `why.mismatch`
    is removed.
- Tests: explain (flags, doubling on top, fallback, difference sum), model,
  import, storage and views. The fixture test checks that every player's
  official state is the official rating.

## Verification

- `npm run typecheck`, `npm test`, `npm run check:i18n`, `npm run build`.
- Before each commit, check the staged diff for fixture names, numbers and
  ratings.
