# Plan: rating chart, with notes for events that may not count and Open with

## Context
The "Rating chart" idea from docs/ideas.md, with a small step first: a
general hint for unofficial events that may not count (with reasons only on
the events they apply to, now also for leagues), and a setting to open the
app on the last viewed player.

Branch `rating-chart`, one pull request.

## Commit 0: "sista rapportdag" in Swedish
"Rapportstopp" becomes "sista rapportdag" everywhere in sv.json, inflected
to fit the sentence ("efter sista rapportdagen", "sista rapportdag 8 nov").

## Commit 1: Hints for events that may not count, and Open with
- Rounds card: the hint is general ("Uncheck an event the next update won't
  count, for example one whose report arrives after the deadline."). The
  event's meta line names its reason: "X-tier: may not count", or for tier L
  "League: counts only when the whole league is finished and reported".
  `isLeague` next to `isXTier`; `eventNote`/`tierNote` in round-text.ts, so
  the note also shows on the event's rounds, in Why it changed and the
  target calculator.
- How it works: the `xtier` section becomes "Events the next update may not
  count": unchecking an event, then a late report, an unfinished league, and
  X-tier explained once as "X-tier (the tiers XA, XB, XC and XM on
  pdga.com)". The Swedish text keeps "X-tier" and uses "liga".
- Settings: "Open with" You (default) / Last viewed player. `openWith` and
  `lastViewed` in the settings, validated; `initialSelection` opens the last
  viewed player while it is stored, else as before. `lastViewed` is written
  only while Last viewed player is chosen; choosing it stores the player
  shown. A hand-off still selects the imported player.
- The storage rule in docs/finished-steps.md names the new fields.

## Commit 2: Chart data (src/app/chart.ts, pure)
`chartData(model, period, today)`: the rated rounds in the period, oldest
first, with kind (official / unofficial / own) and mark (counts / twice /
not / ruled-out); the window band clipped to the period; the official and
predicted ratings; a y range of 5 to 500 steps with at most five gaps; month
ticks every 1, 2, 3, 6 or 12 months, at most five. `ChartPeriod` adds
`recent` (the last 24 months, to today or a later planned round) to the Top 8
period kinds; stored as `chartPeriod`.

## Commit 3: The Chart card
- `'chart'` in `CARDS` after `'why'`, closed by default.
- The period select moves to src/app/views/period.ts, shared with the Top 8,
  with "Last 24 months" first for the chart.
- Inline SVG via a new `svg()` helper in dom.ts; classes in styles.css read
  the theme tokens (the CSP blocks inline styles). Shapes by kind, fills by
  mark, the window band, the official (dashed) and predicted (solid) lines
  with their values.
- A tap picks the nearest point within 24 screen pixels; arrow keys, Home
  and End step through points; the chosen round shows in a polite live line.
  The SVG has a text summary, the legend lists what the period has, and a
  closed "Show as table" holds the same rounds.
- How it works gets a "The rating chart" section.

## Commit 4: Contrast
The contrast test checks that the chart's rules use only theme tokens that
reach 7:1 on the page and the shaded window. The chart is capped at 24rem.

## Commit 5: Docs
ideas.md (chart removed; official rating history added, not planned),
finished-steps.md, CLAUDE.md, README.md and this plan.

## Verification
`npm run typecheck`, `npm test`, `npm run check:i18n` and `npm run build`.
No preview server; tested on the phone after the merge.

## Decisions
Taken with the answers to the plan's questions:
1. The league and X-tier notes show on the event, its rounds, Why it changed
   and the chart details.
2. Not counted: hollow, plus a cross for dropped, excluded by PDGA or left
   out.
3. After-deadline rounds look like rounds outside the window (hollow); the
   tap details say which.
4. A fixed viewBox that scales with the card (capped at 24rem rather than
   40rem, so the text stays near body size on wide screens).
5. The last 24 months end today, or at a planned round when it is later.
6. The last viewed player is written only while that choice is on.
