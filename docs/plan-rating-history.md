# Plan: official rating history line, and 24-hour times

Idea 5 of docs/ideas.md: the official rating after each update, from
pdga.com's ratings history page, as a stepped line in the chart, with the
prediction as the last step. Added to it: times on a 24-hour clock with the
Year first and Day first date formats.

Decisions: 1a (the history in the one-tap fetch; any other page of a player
sent alone), 2a (the last 24 months run to the next update), 3a (steps are
not tappable), 4a (Year first and Day first 24-hour; Month first and
Automatic follow the locale).

## 1. Parse the ratings history page
- Page kind `'history'` for `/player/<nr>/history` (src/parsers/page.ts), also
  in the hand-off's page kinds.
- src/parsers/history.ts: `extractRatingsHistory` reads
  `#player-results-history` rows as raw `{ date, rating, rounds }` text
  (`td.date`, `td.player-rating`, `td.round`); `normalizeRatingsHistory`
  parses them, leaves out rows without a date or a rating and sorts them
  oldest first. The page has the same player header as the other player
  pages.
- Tests: invented HTML, and the saved page (`history` in the git-ignored
  expected.json: file, row count, oldest and newest update; skipped without
  it).

## 2. The bookmarklet fetches the history, the app stores it
- Bookmarklet 1.2.0 (5036 of 5120 bytes). On a details or profile page it
  fetches `/player/<nr>/history` last, after the season and event pages, with
  the same rules (one attempt, a second apart, stop on a challenge or a
  failure, listed as failed when not fetched). `MAIN.history` is the table,
  `PARTS.history` the current rating. `packEnvelope` drops the last event
  page, so the history after the events is kept.
- Reinstall-free reading: on any other page of a player
  (`/player/<nr>/<word>`, with a year after it as on a season page) the
  bookmarklet sends that page alone and fetches nothing, as on an event page.
  A kind without a known selector is sent as its body without scripts and
  styles. So the app can read a page it learns later by a run on that page;
  only fetching it in the one-tap run needs a new version. No link or
  fragment decides what it fetches.
- `PDGA_PAGE` accepts any `/player/<nr>/<a–z, at most 20>` with an optional
  `/<year>`; `MAX_PAGES` is 14.
- `ImportParts.history` and `cleanHistory` (records.ts); `readPages` reads
  the history page's rows and header; `StoredImport.history`, replaced only
  by an import that brings it, so a 1.1.0 hand-off keeps it. The storage key
  stays `next-rating:v2`.
- `Model.history` (`historyOf` in model.ts): oldest first, and when the
  player header shows a newer rating date than the last row, that rating is
  added as the last update.

## 3. The stepped line
- `ChartData.steps` (`ratingSteps` in src/app/chart.ts): each update's rating
  from its date to the next update's, clipped to the period, so the first
  step starts at the period start with the rating then. The last update's
  rating holds until the next ratings update (`model.nextUpdate.update`).
  `ChartData.next`: the prediction at the next update, when that date is in
  the period. Both go into the y range.
- With a history, the last 24 months and the rating window run on to the
  next update; a year and a custom range keep their dates.
- With a history, the flat lines across the window are not drawn, also in a
  period before the first update; without one the chart is as before.
- The view draws one dashed `chart-line-official` path through the steps,
  and the prediction as a solid `chart-line-predicted` rise at the next
  update held to the period's end, with its value after it. Steps are placed
  with the x scale's `start`, and at the period's end with `end`, so even
  spacing works too.
- Legend: "Official rating after each update" and "Prediction 978 at the
  10 Nov update"; the SVG summary adds the official rating's range and the
  prediction. The link to the ratings history stays. How it works and the
  README describe the line.

## 4. 24-hour times
- `formatDateTime` (the "Last import" time, the only clock time in the app)
  adds `hourCycle: 'h23'` with Year first and Day first (`hour12: false`
  reads "24:05" in some engines). Month first and Automatic keep the
  locale's clock, so US English keeps "2:50 PM".

## Verification
`npm run typecheck`, `npm test`, `npm run check:i18n`, `npm run build`.
