# Target date plan: a date in the target calculator

## Context
Idea 3 in docs/ideas.md. Today the target calculator dates its hypothetical
rounds today, so it cannot answer "what do I need at the event on 14 March?".
The date of the last new round anchors the 12-month window, which decides
which old rounds leave it and which update the rounds count in. Add a date
field, name the update for that date, and list the rounds that leave the
window so an early or late date's answer is explained.

Branch `target-date`, one pull request. The plan is saved as
docs/plan-target-date.md in the first commit, like the earlier steps.

## Commits

0. **Plan** — docs/plan-target-date.md.

1. **Engine: rounds that leave the window** (src/engine/target.ts)
   - `TargetResult` gets `leaving: string[]`: ids of rounds that count in
     `without` (status included or doubled) and are 'outside-window' in the
     probe run with the new rounds. The window follows from dates and round
     counts alone, so the probe already decides it for every candidate
     rating; no extra engine runs. Input order kept.
   - `TargetOptions.date` doc: the date of the new rounds, on or after every
     stored round (no longer "today").
   - Tests in tests/engine/target.test.ts with synthetic rounds: a later date
     drops an old high round and raises the average; the same date as the
     newest round leaves nothing; a dropped (outlier) round is not listed;
     the 24-month case.

2. **App: date field, update and leaving list** (src/app/target.ts,
   views/target.ts, main.ts, styles.css, i18n en + sv)
   - `TargetDraft`/`TargetQuery` get `date`. `emptyTargetDraft(prediction,
     earliest)` defaults it to `earliest` = the later of today and the newest
     stored round (`targetEarliest(model, today)`), normally today.
   - `readTarget(draft, earliest, today)`: date must be a date
     (`target.dateMissing`), not before `earliest` (`target.dateTooEarly`,
     "Pick a date from {min}."), not after `latestManualDate(today)`
     (reused from views/manual.ts; `target.dateTooLate`).
   - `targetUpdate(date, next)` works for any date: the first update whose
     report deadline is on or after the date, never before `next`
     (`nextRatingUpdate(date, next.update)`, one more step when the date is
     the Monday or Tuesday of that update week). `missed` is set only in that
     Monday/Tuesday case. `TargetAnswer` keeps `update` and `missed`
     (nullable), drops `following`, and gets `leaving: ListedRound[]`
     (mapped from `model.rounds` by id).
   - Form order: Target rating, Rounds to play, Last round on (`type=date`,
     min/max set), hint, Calculate, answer. Phone date pickers come from
     the OS, as in Add a round.
   - Hint `target.assumes` becomes "Counts 18-hole rounds, the last one on
     {date}, with the same rules as the prediction." The date input's
     `oninput` updates the hint text in place (and the draft); with no valid
     date it falls back to `target.assumesNoDate` without the date.
   - Answer, first line names the update for the date:
     `target.update` "A last round on {date} counts in the {update} update
     (report deadline {deadline})."; in the Monday/Tuesday case
     `target.missed` "A last round on {date} misses the {deadline} report
     deadline, so this is for the {update} update." (replaces
     `target.following`). Then the existing needed/reached/keep/out-of-reach
     lines, unchanged.
   - Under it, `target.leavingTitle` "Leaving the window by {date}:" and a
     list, oldest first: rating, then "event, RD 2 · date" (same parts as
     the Why it changed lines; `roundLabel`/`xTierNote` helpers shared rather
     than copied). None: one line `target.leavingNone` "No rounds leave the
     window by {date}."
   - main.ts: draft reset per player as now, with `earliest`; memo key
     already includes the query, so the date is in it.
   - Tests in tests/app/target.test.ts: date reading and limits,
     `targetUpdate` for a date in December, a Monday of update week in a
     later month, update day; `calculateTarget` with a later date drops a
     round; the view's field order, hint with the date and its live update,
     the update line, the missed line, the leaving list and its empty line.
     Existing tests updated for the new fields. i18n check for sv.

3. **Docs** (README, guide text, finished-steps, CLAUDE.md, ideas)
   - README "Reaching a target rating" and `guide.target.how`/`answers`
     (en + sv): rounds dated on the chosen date, the update for that date,
     the rounds that leave the window.
   - docs/finished-steps.md: a "Target date" step after step 9 (built as),
     and the Process list line.
   - CLAUDE.md: Architecture "Built" list and Process "Done so far".
   - docs/ideas.md: remove idea 3 (numbering per question 4).

## Verification
`npm run typecheck`, `npm test` (fixture tests run locally), the i18n check
and `npm run build`. No preview server; tested on the phone after merging.

## Decisions (answered 1a, 2a, 3a, 4a)
1. Earliest date: the later of today and the newest stored round.
2. Update line: always shown first.
3. Leaving list: only rounds that count without the new rounds, with a
   "No rounds leave the window by {date}." line when none.
4. ideas.md: renumber 4–6 to 3–5.
