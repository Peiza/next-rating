# X-tier plan: rounds PDGA leaves out

## Context
Competition Manual 5.10: X-tier events with non-standard rules (such as
mulligans) can produce round ratings that PDGA does not count in player
ratings. Other X-tier events are rated and count normally. The fixtures confirm
both: own and other2 have XA events with Evaluated/Included Yes, while other4
has an XA event (Oct 2025) inside the 12-month window with Evaluated No.
Today `predictRating` ignores the flags and would count those four rounds.
Two pieces of phone feedback come first.

Branch `x-tier`, one pull request. The plan is saved as docs/plan-x-tier.md
in the first commit, like the earlier steps.

## Commits

0. **Feedback** (src/app/views/players.ts, rating.ts, main.ts, styles.css, i18n)
   - Phone top bar: `topBar` gets the shown player's heading when the Rating
     view is shown: an h1 with the name (wraps, never truncated) and a smaller
     "#12345" line under it, left; the Players button right, aligned to the
     top. Open, the button reads "Close" (`players.close`); the panel's own
     Close button goes. Panel h2 "Switch player" / "Byt spelare" with a "Now"
     / "Nu" badge on the selected player, on phones only (menu-only /
     wide-only spans, no re-render on resize).
   - Wide screens unchanged: the top bar stays hidden and the Rating view keeps
     its h1, which is hidden on phones, so only one h1 is ever exposed.
   - Why it changed, closed: when `prediction.change === 0`, `whyTeaser` shows
     `why.netNoChange` ("Net +0.3, rounds to no change") instead of the
     largest effect.
   - Top 8, closed: the header teaser shows the average (whole number, as
     in the panel) and the chosen period: "Average 1014 · 2026"; with fewer
     than 8 rounds "Average 1003 · 5 of 8 · 2026". The period part follows
     the select: the year, "12-month window", or the custom dates ("1 Oct
     2025 – 30 Sep 2026" in the user's locale). No rounds in the period:
     "No rounds · 2026". Built from `topEight` (src/app/top8.ts), which
     main.ts already computes for the card.
   - Tests in tests/app/views.test.ts, top8.test.ts and main.test.ts.

1. **Engine: official rounds PDGA left out** (src/engine/rating.ts, types.ts)
   - New status `'excluded'`: an official, non-DNF round with
     `pdga.evaluated === false` dated inside PDGA's evaluated window. That
     window is read from the flags: anchor = latest evaluated official round,
     start = 12 months back, or 24 when an evaluated round is older than that.
   - Excluded rounds are left out like 'after-deadline' rounds: not in the
     window, not the anchor, not in the stats, weight 0. Since the set comes
     from PDGA's window, not the prediction's, they stay out after new rounds
     move the window.
   - `officialState` gives those rounds 'excluded' too, so Why it changed
     lists nothing for them.
   - Round list: symbol and label "Not counted by PDGA".
   - Unit tests (synthetic): excluded inside the window, still excluded after
     the window moves, newest official event not evaluated, 24-month window,
     Evaluated No before the window stays 'outside-window', no flags = nothing
     excluded.
   - Rule check: other4 added to the local expected.json; the window test
     treats 'excluded' as not evaluated; the table gets an "excluded" column.
     I run it and report the table.

2. **Unofficial X-tier events** (engine, parsers/rounds.ts, model.ts,
   storage.ts, rating view, i18n)
   - Tier: `ListedRound.tier`, taken for event rounds from the stored profile
     events by event id (the event page parts the bookmarklet sends have no
     tier; no bookmarklet change). Unknown tier = no mark.
   - Unofficial rounds of a tier starting with X count by default and show
     "X-tier: may not count" in the round list and Why it changed.
   - `PredictOptions.leaveOut`: event keys of unofficial events the user left
     out; their rounds get status `'left-out'` ("Left out by you"), treated
     like 'excluded'. Passed through `targetAverage` as well.
   - One-tap control (decision 1).
   - Storage: `StoredPlayer.leftOut: string[]` (event keys, validated
     `e:<id>`/`n:…` format, max 50), missing = none, key stays
     `next-rating:v2`. Keys of events no longer stored are pruned on import.
     Storage rule updated in docs/finished-steps.md.
   - Why it changed (decision 2).
   - Tests: engine leaveOut, storage validation/migration, model, views.

3. **How it works: X-tier section** (`guide-xtier`, after Rounds): 5.10 in
   plain words, how the app reads Evaluated No, the X-tier mark and leaving an
   event out, and that Top 8 is unaffected. Linked from the Rounds card's
   intro.

4. **Docs**: docs/finished-steps.md (new section, storage rule), CLAUDE.md
   (built list, rating rule for Evaluated No inside the window, done so far),
   README if it lists the rules.

## Decisions (answered 1a, 2a, 3a, 4a, 5a)
1. Leave out: an "Unofficial events" list at the top of the Rounds card, one
   row per event (name, date, X-tier mark) with a "Count" checkbox, checked
   by default.
2. Why it changed: left-out rounds listed as "New round 946, left out by
   you" with 0.0, so the lines still add up, plus one line per left-out event
   outside the sum: "Counting <event> would give 977 (+1.4)", from the engine
   run with that event counted.
3. Top 8 unchanged: it counts every rated round, PDGA-excluded and left-out
   ones included.
4. Wide sidebar keeps "Players" and the check mark; "Switch player" and
   "Now" are phone only.
5. On Settings, setup and How it works the phone top bar has only the button
   at the right; those views keep their own heading.

## Verification
`npm run typecheck`, `npm test` (with the local fixtures, rule check run with
`--silent=false` for the table), `npm run check:i18n`, `npm run build`. No
preview server; tested on the phone after merging.
