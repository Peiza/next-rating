# Plan: phone polish and Top 8 with own rounds

## Context
Feedback from phone testing: spacing in the players panel, the back gesture
leaving the app instead of closing an open page, a separate heading line on
Settings / How it works / setup, Top 8 without manual rounds, and a December
event missed in early January because the profile page only lists the
current season. The profile fixture shows the way to the previous season: a
`.year-link` tab list, `2026` → `/player/<nr>` (active), `2025` →
`/player/<nr>/stats/2025`, and so on.

Branch `phone-polish`, one commit per point, then a docs commit and a PR.

## 1. Players panel spacing (src/app/styles.css, views/players.ts)
- "Edit list" gets a class `players-edit`: `display: flex; width: fit-content;
  margin: 0 0 1rem`. Above it the list's 1rem bottom margin, below it 1rem;
  the "Unsaved" h3 in the panel gets `margin: 1rem 0 0.5rem` so collapsing
  margins keep it at 1rem.
- Add-by-number to name search: the add form's empty status line reserves
  0.5rem + 1.45em today, plus the 1rem field margin (about 3rem). In the
  panel an empty status takes no space (`.favorites .status:empty { min-height: 0;
  margin: 0 }`), so the gap is the normal 1rem field gap; an error message
  pushes the search down while it shows.

## 2. Back closes How it works, setup and the players panel (src/app/main.ts, new src/app/layers.ts)
- The open layers (overlay `setup` | `guide` | null, and `menu` true/false)
  live in `history.state` as `{ nr: 1, overlay, menu }`. Opening one calls
  `history.pushState(state, '', location.pathname + location.search)`: same
  address, no fragment.
- `popstate` applies the entry's state (no state = everything closed), keeps
  the in-memory opener, and renders with focus as today: the opener for an
  overlay, the Players button for the menu.
- In-app closing (Back buttons, Close, Escape) goes through history too: when
  this page pushed the entry, `history.back()`; otherwise `replaceState` with
  the closed state and render directly. Actions that close everything at once
  (picking a player, switching tab, an import banner) call
  `history.go(-depth)` for the entries this page pushed, and the popstate that
  follows is idempotent.
- A fresh load reads `history.state`, so an entry always shows what it stands
  for (e.g. back from pdga.com's "Try it" to the setup page without bfcache),
  and the next back still lands where it should.
- Stack order works naturally: open How it works, then Players → back closes
  Players, back again closes How it works, back again leaves the app.
- `layers.ts` holds the pure part (state shape, validation of
  `history.state`, which is untrusted, and the next state per action); main.ts
  wires it.
- Tests (tests/app/main.test.ts, jsdom): back closes setup / guide / menu
  and returns focus; the in-app Back leaves no extra entry (`history.length`
  stable after open + close + open); picking a player from the menu over an
  overlay unwinds both; the URL never changes. Unit tests for layers.ts.

## 3. Phone top bar title (views/players.ts topBar, main.ts, views/settings.ts, guide.ts, setup.ts)
- `topBar` takes `title: string | null` besides `player`: Settings,
  How it works and the setup page pass their title, shown as the bar's h1 at
  the left with the Players button at the right (same layout as the player
  name, `topbar-title`, `tabindex: -1`).
- Those views' own h1 gets `class: 'wide-only'` (as the Rating view's), so
  phones show one h1 and wide screens are unchanged. `aria-labelledby` keeps
  pointing at the view's h1.
- Focus on open: on phones `TOPBAR_TITLE_ID`, on wide screens the view's h1
  (`isWide()`), so focus never lands on a hidden element. Guide sections keep
  focusing their h2.
- The start view (no import yet) keeps its heading; not part of this request.
- Tests: views.test.ts / main.test.ts check the bar's title per view and that
  only one h1 is visible at phone width (class check).

## 4. Top 8: "Include my own rounds" (engine/top8.ts, app/top8.ts, views/top8.ts, storage.ts, main.ts)
- Engine: `isTopRound(round, { own })` and `topRounds(rounds, from, to,
  { own })`; with `own` true manual rounds count, otherwise as today.
- `periodYears` and `topEight` pass it, so manual rounds' years appear in the
  year list when on.
- Setting `top8Own: boolean`, default false, validated in `parseSettings`;
  missing field loads as false, storage key unchanged. Same for every player,
  like the period.
- UI: a checkbox under the period select, "Include my own rounds", in the
  same checkbox style as the Rounds card's Count; focus stays on it.
- A manual round in the list: the label column reads "Own" (instead of
  "RD 1"), the event name as typed or "Own round", no link.
- How it works (guide.top8.rounds) and the card hint mention the switch, in
  en.json and sv.json.
- Tests: engine top8.test.ts (own on/off, years), app top8.test.ts, storage
  validation, main.test.ts remembers the switch across launches.

## 5. Previous season in January (bookmarklet; parsers/page.ts; app/handoff.ts)
- Bookmarklet (collect.ts): from 1 January to the January update (second
  Tuesday, inclusive; device date), after the profile, fetch the previous
  season only when the profile links to it (`.year-link a[href$="/stats/<year-1>"]`):
  one extra request, through the same `fetchPage` (gap, one attempt, stop on
  challenge). Players with no earlier season cost nothing extra.
- `newEventIds(details, ...profiles)` takes the current and previous season
  rows; the existing `date >= newest rated` filter keeps only events after the
  last rated one, so it adds at most the December events. Still at most 10
  event pages.
- `detectPage` learns `season` (`/player/<nr>/stats/<yyyy>`). The season page
  is sent cut to its results tables like the profile (`pageHtml`), never
  dropped by `packEnvelope` (only event pages are), and the app's `readPages`
  merges its events into `profileEvents`, so a December X-tier event keeps its
  tier mark. Its header is not used.
- `BOOKMARKLET_VERSION` → 1.1.0 (it changes what is sent), so the app tells
  me to reinstall. Size stays under 5 kB (build test).
- Tests: collect.test.ts with injected dates (inside / outside the window, no
  year link, challenge on the season page), page.test, handoff merge; a
  fixture test on the saved season page, skipped when absent.

## 6. Docs
- docs/finished-steps.md: a "Phone polish" section with points 1-5 as specified
  and "Built as" notes; Top 8 text updated (manual rounds count when switched
  on); bookmarklet section mentions the previous-season page.
- CLAUDE.md: add it to the Built list and the Process "Done so far" list.
- docs/plan-phone-polish.md: this plan.

## Verification
`npm run typecheck`, `npm test`, the i18n check and `npm run build` (bookmarklet
size test included). No preview server or hand-off runs; I test on the phone
after the merge (point 5 can only be seen live between 1 January and the
January update).

## Decisions
Taken with the recommended answers to the plan's questions:
- The season page is sent to the app, cut to its results tables, so a
  December X-tier event keeps its mark.
- The Top 8 switch shows only when the player has a rated manual round.
- A manual round in the Top 8 reads "Own" in place of the round label, with
  its event name or "Own round".
- A fresh load on a history entry with a layer shows that layer.
- The season page's markup was checked against a saved copy (`season` in
  expected.json): the same results tables as the profile, so no parser or
  selector change was needed.
