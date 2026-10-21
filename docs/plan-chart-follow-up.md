# Plan: chart follow-up

## Context
After testing the rating chart on the phone. The official and prediction
lines ran across the whole period, so in past periods they misled. pdga.com's
ratings history page already shows the official rating over time, so the
chart links to it instead of recalculating it. The chart was capped at 24rem
with text that scaled with the drawing, the finger covered the tapped
point's details, and "Open with" read awkwardly.

A first version of this plan drew a stepped line of the rating at each past
update, calculated with the engine. It was dropped before it was merged, in
favour of the link; idea 5 in docs/ideas.md keeps an exact line from the
history page for later.

Branch `chart-follow-up`, one pull request.

## Commit 1: "When the app opens"
Labels only; the stored `openWith` field stays. en "When the app opens" /
"Show you" / "Show the last viewed player", sv "När appen öppnas" / "Visa
dig" / "Visa senast visade spelaren"; the settings test and README follow.

## Commit 2: Lines across the window, and the history link
- src/app/chart.ts: the official and prediction lines span the band (the
  prediction's window clipped to the period). Without a band both are null
  and leave the y range. `same` is true when both are shown and equal.
- src/app/views/chart.ts: each line runs from the band's start to its end,
  with its value just after the end. When `same`, one solid line and one
  label; the legend and the SVG summary read "Official rating and prediction
  978".
- Under the legend, "Ratings history on pdga.com" links to
  https://www.pdga.com/player/<nr>/history (`historyUrl` in
  src/app/views/pdga.ts) in the same tab, also for a period without rounds.
- The chart intro and How it works say the lines cover the window and point
  to the history page.

## Commit 3: Measured size, and details above the chart
- `plot` draws in CSS pixels, at 300 by 200 until a `ResizeObserver` on the
  frame reports its width, then at that whole-pixel width, redrawing when it
  changes and keeping the chosen round. Card height: two thirds of the width,
  200 to 320 px; at least 240 by 160. The 24rem cap is gone; text stays 13px.
- Ticks move to the view: `monthTicks(from, to, maxTicks)` (about one per
  52 px of width) and `ratingAxis(values, maxGaps)` (one gap per 32 px of
  height); `chartData` returns `values` to fit.
- The details line comes before the frame, with room for two lines.

## Commit 4: Full-screen view
- A Full screen button under the period select opens overlay `'chart'`
  (src/app/layers.ts), with a history entry like setup and How it works.
- While it shows, it is all the page renders: a modal dialog with a header
  (title, Close), the period select, the details line and the chart filling
  the rest, with its own ids. Focus goes to its heading, and back to the
  button on close.
- Where `document.fullscreenEnabled` (Android), the tap asks for full screen
  and then a landscape lock, failures ignored; once the chart no longer
  shows, the app unlocks and leaves full screen. A `fullscreenchange` to none
  (Android's back) closes the chart too, after 150 ms and only while the
  entry still shows it, so the app never goes back twice. On iPhone the view
  follows the rotation.
- A fresh load on the entry shows the chart without full screen, or the
  Rating tab when there is no player to chart.

## Commit 5: Docs
This plan, a "Chart follow-up" section in docs/finished-steps.md, the README
chart section, CLAUDE.md's built list, and a note on idea 5.

## Verification
`npm run typecheck`, `npm test` (with the local fixtures),
`npm run check:i18n` and `npm run build`. No preview server; tested on the
phone after merging.
