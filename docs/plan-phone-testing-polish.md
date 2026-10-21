# Plan: polish from phone testing

## Context
Phone testing showed seven things to fix. A bookmark made from the setup page
gets the name "Next Rating", so it is easy to confuse with a bookmark to the
app. The Android steps only mention Chrome, although Brave, Ghost Browser and
Samsung Internet work too. The iPhone steps do not say that only Safari
works, or that starting the bookmark from the address bar suggestions fails,
and on iOS 27 the book icon only shows after tapping the address bar. In the
chart, the full-screen round label is small although there is room, and a
chosen round cannot be cleared. On a phone the chart table breaks words, the
month labels follow the phone's language instead of the app's, and the
period select's window option is cut off.

Branch `phone-testing-polish`. One commit per numbered point (points 1–3
share one commit, since they rewrite the same step texts), then a docs commit
and a PR.

## 1. Bookmark name from the page title (main.ts, views/setup.ts, locales)
- New key `setup.bookmarkName`: "Next Rating: get data" / "Next Rating: hämta data".
- `render()` sets `document.title` from one helper, `pageTitle()`:
  `setup.bookmarkName` while the setup overlay shows, else `app.name`. So the
  title changes when the setup opens and goes back when it closes (Back, the
  back gesture, an import banner) or the language changes. `applyLanguage()`
  uses the same helper.
- The step texts name the bookmark through a `{name}` parameter filled with
  `t('setup.bookmarkName')`, so the name is written once per language. Steps
  say "keep the name" instead of "name it", since the title already gives it.
  The computer step uses the same name.
- Tests (main.test.ts): the title while the setup is open, after Back, after
  the back gesture (popstate), and in Swedish.

## 2. Android: any of the tested browsers (views/setup.ts, locales)
- Heading: "Android browsers" / "Webbläsare på Android".
- Steps (en; sv to match), in one generic wording with Chrome's menu as the example:
  - Bookmark: "Open the browser's menu and add a bookmark for this page (in
    Chrome: ⋮, then the star). Keep the name {name}."
  - Paste: "Open your bookmarks from the menu, edit {name} and replace its
    address (URL) with the code."
  - Run: "Open your ratings details on pdga.com, tap the address bar, type
    get data and tap the bookmark among the suggestions. This works in all
    the tested browsers. In Chrome, opening the bookmark from the bookmarks
    list does not run it."
- If it doesn't work (Android): "Tested on Android in Chrome, Brave, Ghost
  Browser and Samsung Internet."

## 3. iPhone: Safari only (views/setup.ts, locales)
- A hint under the "Safari on iPhone" heading: "It only works in Safari:
  Brave, Chrome and Firefox on iPhone grey out Save when a bookmark's address
  is a script." Done with an optional per-platform note (`NOTES` next to
  `STEPS`/`TITLES`); only iPhone has one.
- Steps (the book icon shows after tapping the address bar, iOS 27):
  - Bookmark: "Tap Share (the square with an arrow), then Add Bookmark. Keep
    the name {name} and tap Save. New bookmarks are saved in Favorites."
  - Paste: "Tap the address bar, then the book icon. Open Favorites, tap
    Edit, then {name}. Clear the address, paste the code and tap Done."
    (You check the wording on the iPhone after the merge.)
  - Run: "Open your ratings details on pdga.com. Tap the address bar, tap
    the book icon, then tap {name}."
- If it doesn't work (iPhone): "“Cannot Run Script: Safari cannot run the
  script because JavaScript is not allowed to be used this way.” shows when
  the bookmark is started from the address bar suggestions. Tap the address
  bar, then the book icon, and tap the bookmark there." Safari's message
  stays in English in the Swedish catalog, with the rest in Swedish.
- Trouble list: the chosen platform's items first, then the shared ones
  (`TROUBLE_FOR: Record<Platform, MessageKey[]>` plus today's `TROUBLE`).
- Tests (views.test.ts): the bookmark name in every platform's steps, the
  iPhone note, each platform's trouble items and not the others', the
  Android run step says "type get data"; update the "type Next Rating" test.
- README "The bookmarklet": Safari on iPhone (the only iPhone browser that
  works), Android browsers (the tested ones) or a desktop browser, and the
  bookmark name.

## 4. Chart: bigger full-screen label, clear by tapping empty space (views/chart.ts, styles.css)
- `.chart-label`: `font-size: 1rem` (body text size), padding
  `0.25rem 0.5rem`, max-width `min(32rem, calc(100% - 48px))`. The existing
  `placeLabel()` still moves it right while the point is under it.
- `plot()`: a `clear()` next to `choose()`: `chosen = -1`, highlight hidden,
  `chart-label-right` removed, the detail line back to the hint in the card
  and empty (so hidden) full screen. `onTap` calls it when `nearestTo()`
  finds no point. The corner button is outside the svg, so tapping it does
  not clear; a mouse click on empty space clears too (same handler). The
  arrow keys start again from the ends.
- How it works, `guide.chart.read`: "tap an empty part of the chart to clear it".
- Tests (chart-view.test.ts): the "within reach" test now expects the hint
  after a far tap; full screen, the label empties; the arrow keys after a clear.

## 5. Chart table on a phone (views/chart.ts, styles.css, locales)
- Columns Date, Rating, Round; `chart.column.status` goes. The Round cell
  has the event line as today (event name · round · tier note) and under it
  a smaller second line, status · source: "Counts twice · Official"
  (`round.status.*` and `KINDS`), in a span with class `chart-round-status`.
- CSS: headers, dates and ratings `white-space: nowrap`; the Round cell
  `overflow-wrap: break-word` instead of `anywhere` (body sets `anywhere`,
  which lets the table squeeze a column until words break), so a word breaks
  only if it is wider than the whole cell. The status line `font-size: 0.85em`
  in the muted colour.
- Tests (chart-view.test.ts): three headers; a doubled official round's
  cell holds the event and "Counts twice · Official".

## 6. Dates in the app's language (format.ts, CLAUDE.md)
- `dateLocale()` in format.ts: the app's language with the device's region,
  from `new Intl.Locale(deviceLocale()).maximize().region`, e.g. `en-SE`;
  the language alone when there is no region or Intl.Locale throws.
  `formatDate`, `formatDayMonth`, `formatMonth` and `formatDateTime` default
  to it; numbers keep `deviceLocale()`. An English app on a Swedish phone
  then shows "Aug" and "6 Aug" but still 2026-08-06 (checked in Node:
  en-SE gives 2026-08-06, Aug, 6 Aug; sv-US gives 2026-08-06, aug.).
  The app's language alone would give an English app on a Swedish phone
  08/06/2026.
- `render()` already runs after a language change, so the chart's months follow.
- The native date pickers (custom range, manual entry, target date) are
  drawn by the browser and keep the phone's language; nothing to do there.
- Tests (format.test.ts): `dateLocale('en', 'sv-SE')` is `en-SE`; a Swedish
  device with the English app gives "Aug" and 2026-08-06; a Swedish app on an
  US device gives "aug."; an unknown tag falls back to the language.
- CLAUDE.md, Language and locale: "Dates follow the app's language with the
  device's region (an English app on a Swedish phone shows 2026-08-06 and
  Aug); numbers follow the device locale (976,45)." The comment at the top
  of format.ts says the same.

## 7. Shorter window option (views/period.ts, views/chart.ts, views/top8.ts, locales)
- `period.windowOption`: "Rating window ({months})" / "Ratingperioden ({months})".
- Chart: the legend's band item names the dates: new key `chart.bandRange`,
  "Rating window, {start} to {end}", from `chart.window` (the whole window,
  not the part the period shows); "Rating window" alone without one.
- Top 8 has no legend: with the rating window picked, a hint line under the
  select, "{start} to {end}" (`stats.windowRange`), added by
  `periodControls` when the caller asks for it (`windowDates: true` from the
  Top 8 only, so the chart does not show the dates twice).
- Tests (views.test.ts / chart-view.test.ts): the option text without dates,
  the legend with the dates, the Top 8 hint only for the window period.

## 8. Docs
- docs/finished-steps.md: a "Polish from phone testing" section; CLAUDE.md:
  Built list, "Done so far" and the locale rule (point 6).
- docs/plan-phone-testing-polish.md: this plan.

## Verification
Typecheck, tests, the i18n check and the build. You test on the phone
after the merge.

## Decisions
Taken from your answers: 1a (each platform's trouble items only for that
platform, plus the shared ones), 2a (Safari's English message), 3a (Android
browsers), 4a (generic Android wording), plus the changes in your review.
