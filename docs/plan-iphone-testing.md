# Plan: fixes from iPhone testing

## Context
Testing on an iPhone turned up seven problems:
- An English app on the iPhone shows US dates (10/21/2026).
- Every select opens a second time after you choose an option.
- "Show as table" closes after each re-render.
- The date field in "Add a round" goes past the margin, and nothing shows that it opens a date picker.
- Full screen can't be real full screen on an iPhone.
- The Top 8 says "own rounds" where the rest of the app says "manual rounds".
- On large screens, full screen could show the period and x-axis controls.
- On Android, the full-screen round label covers the top of the plot and wraps.

Branch `iphone-testing-fixes`. One commit per point, then a docs commit and a PR.

## 1. Date format setting (storage.ts, format.ts, views/settings.ts, main.ts, locales)
- storage.ts: `DATE_ORDERS = ['year', 'day', 'month']` and `dateOrder: DateOrder | null` in AppData. Null means Automatic, the default, the same way `theme` works. `validateData` reads it, and anything that is not valid becomes null.
- format.ts gets module state, `setDateOrder(order)`, with today's behaviour when it is null:
  - `formatDate`: Year first `2026-10-21`, Day first `21/10/2026`, Month first `10/21/2026`. These are built from the PlainDate with fixed separators. Automatic still uses Intl as today.
  - `formatDateTime` (import time): the date as above plus Intl's short time.
  - `formatDayMonth` (chart range ends and similar): the month name first only for Month first ("Oct 21"), else "21 Oct".
  - `formatMonth` and numbers don't change.
- Settings: a "Date format" select under Language. Each option shows today's date as an example: "Automatic (10/21/2026)", "Year first (2026-10-21)", "Day first (21/10/2026)", "Month first (10/21/2026)". main.ts applies the setting on load, when it changes and on the `storage` event, and then re-renders with focus on the select.
- The native date pickers are drawn by the browser and keep the phone's format. The README notes this.
- Tests: format.test.ts (each order, Automatic unchanged, date and time), storage.test.ts (validation and default), views.test.ts (options and examples), main.test.ts (kept across launches, and dates on the Rating tab follow it).
- CLAUDE.md "Language and locale": "…unless Settings picks a date format (Year, Day or Month first)."

## 2. iOS select reopens (main.ts)
- `render()` restores focus through one helper. On touch screens (`matchMedia('(pointer: coarse)')`) it does not call `focus()` on a `<select>` or `<input type="date">`, because iOS opens the picker again. Computers keep today's focus restore, so keyboard use doesn't change. Date fields are included because the custom-range dates re-render in the same way.
- Instead of the control, focus goes to the nearest stand-in that opens no picker, so a screen reader stays near it. The first one that applies:
  1. inside a Rating card, the card's header button (`.card-toggle`);
  2. in the full-screen chart, its heading (`CHART_FULL_TITLE_ID`);
  3. otherwise, the view's heading: the top-bar title on phones (`TOPBAR_TITLE_ID`), `view-title` on wide screens. This is the Settings case for language and date format.

  The stand-in is found in the new tree from the control's old position (`closest()` on the new element with the same id).
- This covers every select (period ×2, language, date format, full-screen period) and the custom-range dates in one place.
- Tests (main.test.ts): with coarse pointer stubbed, after a chart period change focus is on the Chart card's header button. After a language change in Settings it is on the view heading. With fine pointer it is on the select. Note: the existing stub at main.test.ts:264 answers true to every query, so the helper reads a named `TOUCH_QUERY`.

## 3. Remember "Show as table" (storage.ts, views/chart.ts, main.ts)
- `chartTable: boolean` (default false) in AppData, the same for every player like the cards.
- `table()` sets `open` from props. Its `toggle` listener calls `onTable(open)`, which only stores the value and doesn't re-render (like "How to refresh"). It skips writing when the value hasn't changed.
- Tests: open stays open after switching tab and back, and after a language change. Stored and validated.

## 4. Date field on iPhone (styles.css, a small helper in views/, the three date fields)
- CSS for `.input[type='date']`: `appearance: none; -webkit-appearance: none; display: block; min-width: 0`, and `::-webkit-date-and-time-value { text-align: start }` so iOS keeps it inside the margin, left-aligned with the other fields. A min-height keeps an empty field from shrinking.
- Cue: a calendar icon as inline SVG (the CSP blocks `data:` images). A helper `dateInput(input)` wraps the input in `span.date-input`. The icon sits right, has `pointer-events: none`, is `aria-hidden` and uses the theme colour. The input gets padding on the right. It applies to all three date fields: Add a round, custom range and target date. The icon shows only in iOS Safari (`@supports (-webkit-touch-callout: none)`); other browsers keep their own cue.
- Tests (views.test.ts): each date field is wrapped and has its icon.

## 5. Full-screen hint on iPhone (views/chart.ts, main.ts, styles.css, locales)
- `chartFullView` gets `rotateHint: boolean`. main.ts passes `!document.fullscreenEnabled`, which is true on iPhone and false on Android, iPad and computers.
- A line under the chart frame: "Turn your phone sideways for a wider chart. If it doesn't turn, switch off rotation lock in Control Center." / "Vänd telefonen på sidan för ett bredare diagram. Om den inte vänds, stäng av rotationslåset i Kontrollcenter." It is hidden in landscape (`@media (orientation: landscape)`), so it doesn't take height when it isn't needed.
- `guide.chart.read`: "turn the phone sideways (with rotation lock off) for more room".
- Tests: the hint shows with `rotateHint` and is missing without it.

## 6. "Manual rounds" everywhere (locales, README, docs, comments)
| key | en | sv |
|---|---|---|
| top8.own | Include manual rounds | Ta med manuella rundor |
| top8.ownLabel | Manual | Manuell |
| top8.ownRound | Manual round | Manuell runda |
| chart.kind.own | Manual (was "Your own") | Manuell (was "Egen") |

- `guide.chart.points` ("a triangle for a manual one" / "en triangel för en manuell"), `guide.chart.read` ("ending at a planned manual round" / "en planerad manuell runda") and `guide.top8.rounds` are reworded to match.
- Check that the Top 8 label column fits "Manuell" (`.top8-label` min-width).
- README (Top 8 and chart paragraphs), finished-steps.md and the CLAUDE.md Built list ("Top 8 with manual rounds"), plus code comments and test names. Old plan-*.md files stay as they were written.
- Stored field names and ids (`top8Own`, `top8-own`, PointKind `'own'`) stay, so stored settings keep working.
- Tests: update the expected texts in views.test.ts and chart-view.test.ts.

## 7. Full-screen controls on wide screens (views/chart.ts, styles.css)
- `chartFullView` puts `div.chart-full-controls.wide-only` above the frame. It holds `periodControls({ id: 'chart-full', recent: true, … })` and the axis segmented control with its own ids (`axisOptions(prefix)` instead of the fixed `AXIS_OPTIONS`). The custom range dates show there too when they are picked.
- It shows from 64rem (WIDE_QUERY), so CSS handles a resize. Phones stay below that even in landscape (the largest iPhone is about 956px wide) and keep the chart only. In the wide media query: `display: flex; flex-wrap: wrap; gap`, and the frame fills the rest.
- Focus restore after a change works through the ids. The full-screen view is re-rendered in place.
- Tests (chart-view.test.ts): the controls are present with distinct ids, a period change calls `onPeriod`, and an axis change calls `onAxis`.

## 8. The chosen round in its own strip, on one line (views/chart.ts, styles.css, locales)
- Full screen, the chosen round moves out of the plot into a strip of its own above the frame. The strip keeps its one-line height while it is empty, so the chart never jumps on a tap and nothing covers points or axis labels. The order in the full view: wide controls (point 7), strip, frame, rotate hint (point 5).
- `placeLabel`, `LABEL_CLEARANCE`, `.chart-label-right` and `.chart-label:empty` go. The corner button stays in the plot's top margin.
- One shared builder, `detailParts(point)`, gives this order: **rating** (in `<strong>`), date, event and round, status, source. For example: "**1019** · 2026-08-23 · Example Open, round 3 · Counts twice · Official".
  - The event and round come from a new key `chart.eventRound`, "{event}, round {number}" / "{event}, runda {number}". A named round such as "Finals" is used as it is.
  - The X-tier note follows the status.
  - A manual round without an event name has no event part.
- Full-screen strip: a centred flex row with `white-space: nowrap`. Only the event span may shrink (`min-width: 0; overflow: hidden; text-overflow: ellipsis`), so a long event name gets an ellipsis and the rest stays whole. The full text stays in the DOM for screen readers (`aria-live` as today).
- Card details line: the same parts in the same order, with the rating in bold. It still wraps, since the card on a portrait phone is narrow.
- How it works (`guide.chart.read`) and the README: the tapped round shows above the chart, not in its corner.
- Tests (chart-view.test.ts): the order of the text in the card and in full screen; the strip is outside the frame and present (empty) before a tap and after a clear; the event sits in its own span; a named round; a manual round without a name.

## 9. Docs
- docs/finished-steps.md: a "Fixes from iPhone testing" section. CLAUDE.md: the Built list, "Done so far" and the locale rule.
- docs/plan-iphone-testing.md: this plan.

## Verification
Typecheck, tests, the i18n check and the build. You test on the iPhone and Android after the merge.

## Decisions
From your answers:
- 1a: day-and-month dates follow the setting.
- 2a: the calendar icon shows only in iOS Safari.
- 3a: no refocus on touch screens, with a stand-in that opens no picker (point 2).
- 4a: the hint shows only on iPhone, while the phone is upright.
