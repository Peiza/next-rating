# Plan: polish from testing on a computer and Android

## Context
Testing on a computer and a Pixel 8 turned up four problems, plus a process change:
- The chart's period select and X-axis control differ in height ("Even spacing" wraps), and their labels don't line up.
- In landscape the Pixel 8 shows the full-screen period and X-axis controls, because its viewport is wider than 64rem.
- Switching between Rating and Settings always lands at the top.
- The Rounds card lists every round, which is very long for players with many rounds.
- From now on Claude opens the pull request with gh and reports CI; I merge.

Branch `computer-android-polish`. One commit per point, then a docs commit, then the PR (point 5).

## 1. Chart controls: same height, one line, labels lined up (views/chart.ts, styles.css)
- One builder, `chartControls(prefix, …)`, used by the card and full screen: `div.chart-controls` holding the period field and the X-axis fieldset, then the custom range dates (when picked) below the row. The DOM order matches what you see: select, X-axis, dates.
- `.chart-controls`: flex with wrap and `align-items: flex-start`, so both labels sit on the same top line. The controls sit side by side when there's room (the card on a computer, and full screen) and stack on a phone. Each one fills its line when it wraps.
- Same height: `.segments label` gets `min-height: calc(3rem - 4px)`, so a segmented control with its 2px border is 3rem tall, like `.input`. This applies to every segmented control (theme, open with, platform, player order). They lose 4px, and the tap targets stay at least 44px.
- Same label spacing: the legend is laid out like a block `.label` (the float trick: `float: left; width: 100%`, and the next element clears it), so the legend and the label have the same height and gap.
- One line: in `.chart-controls`, the segment labels get `white-space: nowrap` and are sized by their content (`flex: 1 1 auto`) instead of equal halves. Room for the check mark is kept on both segments, so nothing moves when you tap. Rough sum at 320px: "✓ Time | ✓ Even spacing" ≈ 230px, and "Tid | Jämnt fördelat" is about the same. Both fit the card's 252px.
- Tests (chart-view.test.ts): the card and full screen both have `.chart-controls` with the select and the axis in that order; the custom dates follow the row; the existing ids are unchanged.

## 2. Full-screen controls need height too (styles.css, views/chart.ts)
- `.chart-full-controls` drops `wide-only` and shows only under `@media (min-width: 64rem) and (min-height: 40rem)`. Phones in landscape are far lower than 640px, so they keep the chart only, whatever their width. A computer in full screen is taller than 40rem.
- The rest of the wide layout (sidebar, `.wide-only`) is unchanged.
- Test update: chart-view.test.ts checks the class, not `wide-only`.

## 3. Remember each view's scroll position (main.ts, styles.css)
- `scrollTops: Partial<Record<Tab, number>>` in memory only, so a fresh launch starts at the top.
- `saveScroll()` records `window.scrollY` for the current tab when that tab's own view is about to be covered or left: in `selectTab` (when switching to the other tab), in `openOverlay` and when the players panel opens. It records nothing while an overlay or the panel is shown. (Built: also in `selectPlayer` and `showBanner`, which can leave Settings.)
- `selectTab(next)`: switching tabs restores `scrollTops[next] ?? 0` right after the render. Tapping the tab you're already on scrolls it to the top as now. Closing an overlay or the panel by tapping a tab returns to that tab's remembered position.
- Showing another player and the import banner scroll to the top as now. The Rating position is then recorded again the next time you leave.
- A chart drawn before it is measured has the card's height on any width: `.chart-frame:not(.chart-frame-fill) .chart-plot { min-height: 200px; max-height: 320px }`, the same limits as `CARD_HEIGHT` (with a comment tying them). The drawing scales inside it, so the page doesn't change height when the chart is redrawn at its measured size, and a restored position stays exact.
- Tests (main.test.ts, `scrollTo` is already stubbed): with `scrollY` set, switching Rating → Settings → Rating restores the Rating value; Settings starts at 0 the first time; tapping the current tab scrolls to 0; a re-import of main.ts (fresh launch) starts at 0.

## 4. Shorter rounds list (views/rating.ts, main.ts, locales, styles.css)
- Rows stay newest first. The list shows rows down to the oldest round that counts or is dropped (`included`, `doubled`, `dropped`), plus one more: the first round that doesn't count. Rounds above that point that don't count (after the deadline, DNF, X-tier, left out) still show where they are. The rest are hidden behind a button under the list.
- With no round that counts or is dropped, the list shows the newest round only.
- Button `#rounds-more`, `button-small`: "Show {count} more rounds" / "Visa {count} rundor till" (with one/other plural keys `rounds.more.one|other`). It shows all the remaining rounds at once and then goes away. Focus moves to the first newly shown round (`tabindex="-1"`), so a screen reader continues there.
- `roundsExpanded` in main.ts, kept while the app is open, reset when another player is shown (in the existing `manualPlayer !== selected` block). `RatingProps` gets `rounds: { expanded, onExpand }`.
- No button when nothing is hidden.
- `rating.roundsIntro`: "Every round the app knows" becomes "The rounds that count, newest first, and how…", with a note that the rest are a tap away. Swedish too.
- Tests (views.test.ts): the cut with a dropped round in the window, rounds after the deadline at the top, one extra round, the button's count and plural, expanded shows everything, no button when nothing is hidden. main.test.ts: expanding keeps through a re-render and resets on another player.

## 5. Process (CLAUDE.md, then the PR)
- CLAUDE.md "Process": at the start of every new step, git switch main, git pull --ff-only, git fetch --prune, delete merged local branches with git branch -d (never -D), then branch from main. When a step is done, Claude pushes the branch and opens the pull request with gh, with a description and a checklist of what to test on the phones, waits for CI and reports whether it passed. Never merge: I always merge myself.
- For this PR: `git push -u origin computer-android-polish`, then `gh pr create` with a description and a phone checklist, with no AI attribution. Then `gh pr checks --watch`, and Claude reports the result.

## 6. Docs
- docs/finished-steps.md: a "Polish from computer and Android testing" section. CLAUDE.md: the Built list and "Done so far". docs/plan-computer-android-polish.md: this plan.

## Verification
Typecheck, tests, the i18n check and the build. No preview server. I test on the phones after merging, following the PR's checklist.

## Answers
1a (tapping the tab you're on scrolls it to the top), 2a (period and X-axis side by side in the card when there's room), 3a (Show more shows all the rest, kept for that player while the app is open), 4a (an inactive player shows the newest round and the button).
