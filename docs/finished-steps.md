# Finished steps

The specification of the steps that are built, moved here verbatim from
CLAUDE.md so that it keeps the rules and the open work. The rules below still
apply. The plans for each step are in the other files in docs/. Section
numbers match the Architecture list in CLAUDE.md.

Paste import, mentioned in 2, 4 and 5 below, was removed by Polish after
favorites, point 8: bookmarklet hand-offs are the only import.

## Background
I had a Google Sheets + Apps Script tool (legacy/rating-calculator.gs) that fetched
my PDGA ratings history from pdga.com/player/<number>/details and predicted my next
rating update from my rated rounds, including new rounds with unofficial round
ratings and ratings I added myself. This app never calculates a rating from a score.
It stopped working because pdga.com now answers server-side requests with a
Cloudflare challenge (verified from Apps Script: HTTP 403, header
"cf-mitigated: challenge", "Just a moment..." page). The official PDGA API
developer program is closed.

Verified on my phone: a bookmarklet runs on pdga.com, and a same-origin fetch
from /player/188063/details to /player/188063 returns HTTP 200 without a
Cloudflare challenge. Build the one-tap flow as the primary path and keep the
manual per-page fallback.

## Architecture
1. Rating engine: pure TypeScript, no I/O, fully unit tested.
2. Parsers: pure functions turning pdga.com HTML (ratings details page, player
   profile page, event results page) into typed data, including hole count per
   round where the page shows it. They run in the app, for bookmarklet
   hand-offs and the paste import alike.
3. Bookmarklet, fully self-contained (never loads remote code, so no external
   code ever runs on pdga.com). It parses nothing: it fetches pages and sends
   the HTML of the parts the app's parsers read, so a pdga.com markup change
   is fixed by deploying the app, without reinstalling the bookmarklet. It
   holds only the logic it needs to pick pages (page kind, event ids and
   dates) and to cut fetched event pages down to the player's rows.
   - On any player page (/player/<nr> or /player/<nr>/details): send the
     current page, then fetch the other one with a same-origin GET in the
     user's session and send it. Find recent events from the profile page that
     are not yet in the ratings details, fetch those event pages and send them
     with only this player's rows (a match on the PDGA number). Max 10 event
     pages, sequential, about 1 second apart, one attempt per page.
   - On an event results page: send its results tables; the app picks the
     user's rows by PDGA number.
   - Send only the page parts the parsers need. When a page's main content
     cannot be found (as after a markup change), send its whole body without
     scripts and styles instead, so an updated app can still read it. If the
     hand-off would exceed the fragment limit, drop event pages from the end
     and list them as failed.
   - On Unofficial Results pages, round ratings sit behind a "Show round
     ratings" toggle. The rating cells are in the page HTML either way, so the
     app reads them with textContent (never innerText or a visibility check);
     never click the toggle.
   - If a request returns a Cloudflare challenge or fails, stop fetching and
     hand off what was collected, including the URLs of the pages that could
     not be fetched, so the app can link to them and ask the user to run the
     bookmarklet there.
   - The bookmarklet shows no text of its own, only a minimal progress
     indicator. It always hands off to the app with a status code (also on
     unsupported pages), and the app shows the message in the user's language.
     This keeps the bookmarklet small and fully translatable.
   - Hand-off: navigate the current tab to the app with the data compressed
     (CompressionStream) and base64url-encoded in the URL fragment (#d=...).
     Do not use window.open after async work, since browsers block it as a
     popup. The fragment is never sent to any server and is reserved for this
     hand-off.
   - Read only page content (including content hidden behind a toggle, as
     above). Never read cookies, storage or form fields.
   - Keep the minified bookmarklet small, since on phones it is pasted into
     the bookmark URL field: at most 4,200 characters as a javascript: URL
     (see "Bookmarklet size" below).
4. Web app (PWA, works offline after first load). The full setup page was
   the last open part; it is built (see "Setup page" below).
   - Enter a PDGA number once (default player; the app works for any player).
     A button opens that player's ratings details page on pdga.com with a short
     hint to run the bookmarklet there.
   - Import from the URL fragment, then remove it with history.replaceState.
     The received HTML is parsed exactly like pasted HTML: an inert DOMParser
     document, size limits, textContent only, never inserted into the page.
     An import never erases data it does not contain: for the same player it
     replaces only what it brings, and an import for another player replaces
     everything.
   - Paste import as fallback (tab-separated and HTML clipboard content). A
     pasted ratings details table without a player header asks whose rounds
     they are, with a PDGA number field prefilled with the default player
     (the selected player once favorites exist). The same player as the stored
     import merges; a different player replaces.
   - Results: predicted rating, change vs current official rating, and a round
     list marking included, dropped and double-weighted rounds, plus the stats
     panel from the legacy sheet.
   - Theme: a segmented control on the Settings tab with Device (the
     default), Light and Dark. Both themes pass the contrast test.
   - Quick manual entry of rounds (rating, date defaulting to today, optional
     event name and hole count), usable one-handed on a phone.
   - Data age is obvious: "Updated X days ago" shows under the player's name
     (Polish 2). When the data is more than 7 days old, a clear notice with a
     button opens the player's pdga.com ratings details page to refresh.
   - Store locally only: the language override, the theme choice, the
     players list order, which Rating tab cards are open, the Top 8 and chart
     periods, the "When the app opens" choice and the last viewed player
     (kept only while that is set to it), the bookmarklet version from the
     last hand-off and the players' data. Each player (each favorite)
     keeps its own PDGA number, last import (show its timestamp), manual
     rounds and the unofficial events left out of its prediction. When the storage format changes, existing data is migrated,
     never silently dropped. On iOS, home screen web apps do not share
     storage with Safari tabs, so the full flow must work in a normal browser
     tab; installing is optional.
   Built as (web app commit 3, docs/plan-step-3.md):
   - Manual entry sits under the prediction behind an "Add a round" button,
     only once the player has an import. The date may be up to a year
     ahead, so a hypothetical round carries its event's date and the window
     and report deadline apply to it. Rounds with the same event name (any
     case) and date share an event key, prefixed "m:" to stay apart from
     imported events. Adding a round to the unsaved player saves it as a
     favorite. Manual rounds are stored as `manualRounds` on each stored
     player (at most 200), validated one at a time; data without the field
     loads with none, so the storage key stays `next-rating:v2`.
   - Deleting a single manual round happens at once: the status line shows
     "Removed 985" with an Undo button that puts the same round back in its
     place. Only "Delete all manual rounds" asks first (built with the
     target calculator).
   - The stale notice replaces the plain Refresh button, so it shows once.
   - The manifest uses `display: browser`: the home screen icon opens a
     normal browser tab, where the bookmarklet round trip works and storage
     is shared. Icons come from `npm run icons` (scripts/make-icons.ts) and
     are committed. The service worker template `src/sw.js` is filled in by
     scripts/service-worker.ts after each build: every built file is
     precached, served cache-first, navigations get the cached index.html,
     and a new version waits until the user taps Reload.
5. Favorites (the optional transfer link is still open, in CLAUDE.md):
   - Save several players as favorites. Each favorite keeps its own last
     import and its own manual rounds, so switching shows the prediction
     instantly from stored data, within browser storage limits.
   - On wide screens the favorites sit in a left sidebar; on phones they open
     from a menu. Each favorite shows when it was last imported and links to
     its pdga.com ratings details page, where the bookmarklet refreshes it.
   - An import updates that player's stored data instead of replacing
     everything. Pasted details tables default to the selected player.
   - Paste import stays as a fallback but becomes less prominent once the
     bookmarklet works; manual entry is the main way to add rounds by hand.
6. Change explanation, on the Rating tab:
   - Under the change line, a short "Why it changed" list compares the last
     official update with the prediction, using the real engine.
   - The official state is exactly what PDGA counted: the official rounds
     with PDGA's own Evaluated and Included flags, and only the doubling rule
     and hole weights on top. The new state is all rounds, recomputed.
   - If the official state still differs from the official rating, a
     "Difference from PDGA's last calculation" line makes the lines add up
     to the change shown. A new import is suggested only when the ratings
     details were imported before the official rating date.
   - List what differs: new rounds with their ratings, rounds that left the
     window, rounds that started or stopped counting twice, and rounds newly
     dropped or no longer dropped.
   - Estimate each effect with the engine, mark it with an arrow for up or
     down, and show the largest effects first. Example: a 985 round that no
     longer counts twice can outweigh a new 938 round.
   - Each effect is the round's weight change times its distance from the
     official unrounded average, over the new total weight, so the effects
     add up exactly to the unrounded change (docs/plan-change-explanation.md).
7. Polish after favorites:
   1. Links to pdga.com (ratings details, events, player search) open in the
      same tab, not a new one. The bookmarklet brings the user back to the
      app in that same tab, so repeated imports don't pile up tabs.
   2. Main page header: show the data age as relative time ("58 minutes
      ago") right after the player's name and number; keep the exact import
      date further down.
   3. Main page: a "Refresh on pdga.com" button that opens the shown player's
      ratings details page, like the link in the players list.
   4. Players list: "me" always first; the others sorted A to Z by default,
      with a switch for "last updated".
   5. Round list: each official or unofficial round's event name links to its
      pdga.com event page. A plain link; the app loads nothing itself.
   6. Player search by name: one name field in the players panel that opens
      pdga.com's player search in this format:
      https://www.pdga.com/players?FirstName=Anna&LastName=Svensson. With one
      word, search it as the last name; with two or more words, the first
      word is the first name and the rest the last name. The search matches
      parts of names, so partial names work. The user picks the player there
      and runs the bookmarklet.
   7. Text size: on laptop-sized screens the text is too large; scale the
      type down from tablet width and up.
   8. Remove paste import completely: the Import tab, the phone hint and the
      tab-separated parsing. It doesn't work from a computer either, because
      of how pdga.com marks up the table headers. The page parsers stay,
      since bookmarklet hand-offs use them. This replaces the paste import
      text in 2, 4 and 5 above, in Hard constraints and in Security, which
      is removed when this is built.
   9. Next to the prediction, show the expected date of the next ratings
      update and its event report deadline: updates come on the second
      Tuesday of each month, and the deadline is the Sunday before, for
      example "Next ratings update: 10 Nov (events reported by 8 Nov)". Link
      to https://www.pdga.com/faq/ratings/when-updated, where PDGA publishes
      the rule.
   10. Main page: the player's name shows twice at the top, in the top bar
       and under the heading. Keep it once, and use the freed line for the
       data age from point 2.
   Built as: the Rating tab's heading names the player, and the phone top
   bar keeps only the menu button (it is hidden on wide screens, so the name
   could not stay there). The players list order is stored with the other
   settings, and the next update date comes from `nextRatingUpdate` in
   src/engine/dates.ts.
8. Deadline-aware prediction: the next update counts events reported by the
   deadline, the Sunday before the second Tuesday
   (https://www.pdga.com/faq/ratings/when-updated). Unofficial and manual
   rounds from events dated after that deadline are left out of the
   next-update prediction and marked in the round list as counting in the
   following update.
   Built as: the `deadline` option of `predictRating` gives those rounds the
   status 'after-deadline' and leaves them out of the window, the stats and
   the change explanation; official rounds always count. On update day,
   once the official rating is dated that day, the next update is the
   following month's, so the prediction does not fall back to the new
   official rating.
9. Target calculator, on the Rating tab:
   - Input: a target rating (for example 1000) and a number of upcoming
     rounds (default 3). Output: the average round rating needed in those
     rounds to reach the target at the next update.
   - Computed with the real engine, never a shortcut formula: add that many
     hypothetical 18-hole rounds dated today to the player's rounds (manual
     rounds included) and search for the lowest whole round rating whose
     prediction reaches the target. Window, outlier drops and double
     weighting are then all applied as in the prediction.
   - Say so when the target is already reached without new rounds, or out of
     reach within a plausible rating range.
   - Between the report deadline and the update (Monday and Tuesday of
     update week), rounds dated today count only in the following update
     (Architecture 8); handle that case.
   Built as (docs/plan-target-calculator.md): `targetAverage` in
   src/engine/target.ts scans whole ratings down from `MAX_TARGET_ROUND`
   (1150, the plausible range's ceiling) and stops at the first one that
   falls short. The answer is the lowest rating from which every higher
   rating reaches the target, so playing better never shows as worse; a very
   low round can be dropped as an outlier while still moving the window.
   "Reaches" means the rounded prediction is at least the target. When the
   target is already reached, the answer also says what average keeps it.
   On the Monday and Tuesday of update week the answer is for the following
   update and says why (`targetUpdate` in src/app/target.ts). The scan
   leaves out rounds that cannot matter (outside the window, DNF, after the
   deadline), and main.ts memoizes the answer, so a re-render does not run
   it again. The rounds dated today became a chosen date later (Target
   date, below).
10. Top 8 panel, in its own collapsible panel on the Rating tab, styled like
   the PDGA Global Masters Series (GMS) player card but for any player. Visual
   style only: no PDGA logos or other PDGA assets.
   - Show Sum, Average (rounded to a whole number, as GMS does) and High, and
     below them the 8 highest-rated rounds, each with round label, event name
     and rating, highest first.
   - Count every rated round: official rounds from the details page and
     unofficial rounds from imported events. No tier filter and no hole
     weighting. DNF and manual rounds do not count (manual rounds can be
     switched on since Phone polish, point 4).
   - Period: by default the current calendar year, following today's date (as
     GMS does). A switch offers instead exactly the window the rating
     prediction uses, with the same anchor (the most recent rated round) and
     the same 24-month fallback.
   - With fewer than 8 rounds, show how many were found and the average of
     those.
   Built as (docs/plan-top8.md): `topRounds` in src/engine/top8.ts takes the
   rounds in a date range, both ends inclusive; rounds the prediction drops
   as outliers still count. The calendar year counts unofficial rounds after
   the report deadline, since they were rated that year. The rating window is
   the prediction's `windowStart` to `windowEnd`, so those rounds fall
   outside it, and a manual round can be its anchor without being listed.
   Equal ratings list the newer round first. The panel comes after
   Statistics, in the app's own themes, with the round label as "RD 1". Its
   open state and period, and Statistics' open state, live in main.ts: they
   survive a re-render and last until the page reloads. (The Rating tab
   design pass below stores them and replaces the switch with a select.)

## Rating tab design pass
Built after the Top 8 panel (docs/plan-design-pass.md):
- One card pattern for every section of the Rating tab: a frame around a
  header and its content, the header a disclosure button inside an h2 with
  the title and an arrow that turns when the card opens. The content is
  built only while open, and starts with a one-line explanation. Focus stays
  on the header when a card opens, so no phone keyboard pops up.
- Order: the summary (name, predicted rating, change, official rating, next
  update, data age), then Why it changed, Add a round, Reach a target
  rating, Top 8, Statistics, Rounds. Rounds is open by default, the others
  closed. Which cards are open is stored with the settings (`cards`), the
  same for every player, and survives launches from the home screen icon.
- Why it changed shows its largest effect in the header while closed, as
  "907 no longer counts twice, +0.7" (the difference line when that is
  largest). Opened, the top 5 and "Show all" for the rest.
- "Updated 3 days ago · How to refresh" is a small `<details>` with one line
  about the round trip and the exact import time; the Refresh button stays
  visible under it. Data older than 7 days turns the block into a warning
  that opens by itself, replacing the separate stale notice.
- The Top 8 period is one select: each calendar year with a rated round the
  Top 8 can take (newest first, the current year as default), the rating
  window with its length and dates in the option, and a custom range with
  from and to dates (both inclusive, stored only when from ≤ to). The
  period is stored with the settings (`top8Period`); the current year is
  stored without a year, so it follows New Year. The band line that
  repeated the period is gone.
- After testing on the phone (built with the setup page): Why it changed
  starts with the net total of its lines, such as "Net +0.3, rounds to no
  change", so offsetting effects do not look like a big change. Statistics
  is renamed Details; "Unrounded prediction" is labelled the weighted
  average, and the window and counted-rounds averages unweighted. The
  official rating line shows the value the engine calculates from the
  official state, such as "978 (calculated 977.65)", only when that state
  rounds to the official rating.

## Setup page
Spec (from CLAUDE.md, Architecture 4): a setup page with step-by-step
bookmarklet installation for Safari on iPhone, Chrome on Android (run it by
typing its name in the address bar) and desktop browsers, with a copy button.
Added to it: a bookmarklet status from the last import, and a "How it works"
page.

Built as (docs/plan-setup-page.md):
- A segmented picker (iPhone / Android / Computer), guessed from the user
  agent (an iPad reports itself as a Mac with a touch screen), shows only
  that browser's numbered steps: copy (with the code and the copy button,
  which falls back to selecting the text), bookmark, paste the code as the
  address, and "Try it", which opens your ratings details on pdga.com. "If it
  doesn't work" is a closed `<details>`.
- The version of the last valid hand-off is stored (`bookmarklet`), whatever
  the import brought. Settings and the setup page say "Your bookmarklet:
  1.0.0, up to date", "…, a newer one (1.1.0) is available", or that this
  browser has had no import yet.
- How it works has sections on what the app does (and that it is
  unofficial), the data, the rating rules (with what is not yet checked
  against a real player, and where the calculated decimals come from), the
  kinds of rounds and the report deadline, Why it changed, the target
  calculator, and the Top 8 with the Global Masters Series. It opens from
  Settings, and from a "How it works" link at the end of each card's
  explanation, with focus on the matching section. It shows over the
  current tab like the setup page, and Back returns focus to what opened it.

## X-tier events and rounds PDGA leaves out
Spec: PDGA's Competition Manual 5.10: X-tier events with non-standard
rules, such as mulligans, may generate round ratings, but those ratings are
not included in player ratings. Other X-tier events (restricted eligibility,
charity payouts) are rated and count normally. Example: a player's ratings
details show an XA event inside the 12-month window with Evaluated No.
1. Engine: an official round that PDGA marks Evaluated No although its date
   is inside PDGA's evaluated window never counts, also in the prediction
   after the window moves.
2. Unofficial rounds from X-tier events (tier starting with X) count by
   default but are marked "X-tier: may not count", and the user can leave
   out any unofficial event with one tap. The choice is stored per player.
   Show the effect in Why it changed.
3. An X-tier section on the How it works page.
4. A player with two dropped rounds in one window and an excluded XA event
   in the rule check.

Feedback built first: the phone top bar names the player (the PDGA number
on a smaller line, the Players button at the top right, reading Close while
the panel is open, the panel headed "Switch player" with the shown player
marked "Now"; wide screens unchanged). Closed, Why it changed shows the net
total when the change rounds to nothing, and Top 8 shows its average and
period ("Average 1014 · 2026", "Average 1003 · 5 of 8 · 2026").

Built as (docs/plan-x-tier.md):
- `excludedByPdga` in src/engine/rating.ts reads PDGA's window from the
  Evaluated flags: 12 months back from the newest evaluated round, or 24
  when an evaluated round is older than that or fewer than 8 are inside 12
  months. Official rounds with Evaluated No inside it get the status
  'excluded' ("Not counted by PDGA") in the prediction and the official
  state, and are left out of everything, the anchor included. The tier alone
  decides nothing, since other X-tier events count.
- Unofficial rounds take their tier from the stored profile events by event
  id (event pages do not show it; no bookmarklet change). The Rounds card
  starts with the unofficial events, each with a Count checkbox; the
  `leaveOut` option of `predictRating` and `targetAverage` gives the
  rounds of left-out events the status 'left-out'. Stored per player as
  `leftOut` (event keys, at most 50); keys of events no longer stored are
  forgotten on import.
- Why it changed lists left-out rounds with 0.0, so the lines still add up,
  and under the list says what counting each left-out event would give,
  from the engine.
- The Top 8 still counts every rated round, including both kinds.
- Added after a sixth player whose calculated rating is 1 below the official
  one with no new rounds: a rating only updates when new rated rounds are
  added (PDGA ratings guide). With the current rating known and no
  unofficial or manual round counting in the next update, `predictRating`
  keeps the current rating (`unchanged`), `targetAverage` keeps it for
  "without", and Why it changed says "No new rated rounds since the last
  update, so the rating stays at 902" instead of a difference line. That
  player's pages are kept to check again after the next update.
- Rule check: the fifth player reproduces PDGA's flags and official rating;
  4 rounds excluded by PDGA, leave one out matches for all players.

## Target date
Spec (idea 3 of docs/ideas.md): a date in the target calculator.
1. A date field "Last round on", default today, up to one year ahead like
   manual rounds. The hypothetical rounds get that date. Since they are
   newer than all stored rounds, only the date of the last one matters: it
   anchors the 12-month window.
2. The result names the update it applies to, using the report deadline for
   that date.
3. Under the result, the rounds that leave the window because of that date,
   with their ratings, so it is clear why an early or a late date changes
   the answer.
4. The hint mentions the date: "Counts 18-hole rounds, the last one on
   {date}, with the same rules as the prediction."

Built as (docs/plan-target-date.md):
- `targetAverage` returns `leaving`: the rounds that count (included or
  doubled) without the new rounds and are outside the window with them.
  The probe run the scan already makes decides it, since the window follows
  from dates and round counts alone. Rounds already dropped as outliers are
  not listed. With fewer than 8 rounds the 24-month window applies, so the
  round count can matter as well as the date.
- The earliest date is today, or the newest stored round when that is later
  (`targetDates` in src/app/target.ts), so the new rounds are always the
  newest; the latest is `latestManualDate`.
- `targetUpdate` gives the first update whose report deadline is on or after
  the date. A date on the Monday or Tuesday of an update week misses that
  deadline (`missed`) and counts in the update after; up to the next
  update's deadline it is always the next update, as before.
- The answer starts with the update for the date ("With the last round on
  …, this is for the 10 Nov update (report deadline 8 Nov).", or "A last
  round on … misses the 8 Nov report deadline, so this is for the 8 Dec
  update."), and ends with the rounds that leave the window, oldest first,
  or "No rounds leave the window by …". The hint follows the date field as
  it changes.

## Phone polish and Top 8 with manual rounds
Spec:
1. Players page: the same space above and below the "Edit list" button, and
   less space between the add-by-number form and the name search.
2. Back button: opening How it works, the setup page or the players panel
   adds a history entry with the same address (no fragment, no path
   change), so the phone's back gesture or button closes it and returns to
   where you were, instead of leaving the app.
3. Top bar on phones: Settings, How it works and the setup page show their
   title on the left of the top bar, next to the Players button, instead of
   a separate heading line below it.
4. Top 8: a switch "Include manual rounds", off by default and remembered.
   When it is on, manual rounds count in the Top 8, are marked as manual,
   and their years appear in the year list.
5. Year boundary: the profile page lists only the current season, so in
   early January the bookmarklet misses a December event that is not rated
   yet. The profile's season tabs link to earlier seasons
   (/player/<nr>/stats/<year>), so from 1 January until the January update
   the bookmarklet also fetches the previous season, keeping the requests
   few.

Built as (docs/plan-phone-polish.md):
- Edit list has 1rem above and below it; in the players panel an empty
  status line takes no space, so the add form and the name search are one
  field gap apart.
- `history.state` says which layers an entry shows: `{ nextRating: 1,
  overlay, menu, depth }` (src/app/layers.ts, validated, since any page at
  the address can set it). Opening one pushes an entry; popstate shows the
  entry's layers, with focus on the opener when one closes. The app's own
  Back, Close and Escape go back over the entry too (`depth` > 0), so no
  entries pile up; picking a player, switching tab or an import banner goes
  back over all of them. A fresh load on an entry shows its layer, so back
  from pdga.com without the page kept in memory still lands right.
- The phone top bar's h1 holds the view's title (focused when the view
  opens on a phone); the view's own h1 shows from 64rem only, as on the
  Rating tab.
- `topRounds` and `isTopRound` take `{ own }`. The checkbox sits under the
  period select, only when the player has a rated manual round. Stored with
  the settings as `top8Own`, the same for every player. A manual round reads
  "Manual" in place of the round label, with its event name or "Manual
  round", no link.
- `previousSeasonPath` in src/bookmarklet/collect.ts: on the device's date
  from 1 January to the second Tuesday of January (inclusive), and only when
  the profile's `.year-link` tabs link to /player/<nr>/stats/<year - 1>.
  One extra request before the event pages, through the same fetch rules;
  `newEventIds` takes both seasons. The season page is sent cut to its
  results tables (page kind `season`, so `MAX_PAGES` is 13), and the app
  adds its events to the profile events, so a December X-tier event keeps
  its mark. Bookmarklet 1.1.0, 4743 bytes. Checked against a saved profile
  and a saved previous-season page (`season` in expected.json; the tests
  are skipped without it): the season page has the same results tables as
  the profile, so the profile's extractor and selector read it unchanged, and
  a January run on the saved pages fetches the season, sends only its tables
  and fetches no event already older than the rated rounds.

## Rating chart
Spec (idea 2 of docs/ideas.md), with a small step first:
1. Rounds card, "Unofficial events that count": a general hint, "Uncheck an
   event the next update won't count, for example one whose report arrives
   after the deadline." The reasons show only on the events they apply to:
   "X-tier: may not count" and, for tier L, "League: counts only when the
   whole league is finished and reported". How it works describes all three
   cases: a late report, an unfinished league and an X-tier event PDGA leaves
   out. In Swedish, "X-tier" stays ("X-tier: räknas kanske inte"), How it
   works explains it once as "X-tier (nivåerna XA, XB, XC och XM på
   pdga.com)", leagues are "liga", and the report deadline is "sista
   rapportdag" everywhere.
2. Settings, "Open with": You (the default) or Last viewed player. With the
   second, a reload or launch opens the player shown last, or you when that
   player has been removed. A bookmarklet import still opens the imported
   player.
3. A Chart card on the Rating tab after Why it changed, closed by default:
   inline SVG drawn by the app's own code, phone first, colours from the
   theme tokens, readable at 320 px. Round ratings over time, newest to the
   right; official, unofficial and manual rounds told apart by shape; rounds
   that count twice, are dropped, excluded or left out marked. The current
   window shaded, with lines for the official rating and the prediction.
   Period: the last 24 months by default, or a year, the rating window or a
   custom range. Tapping a point shows its event, date and rating; a text
   summary and a table cover screen readers.

Built as (docs/plan-chart.md):
- `isLeague` (tier L) next to `isXTier`; `eventNote` and `tierNote` in
  src/app/views/round-text.ts give the note on the event's checkbox, its
  rounds in the list, Why it changed and the target calculator. The How it
  works section keeps the id `xtier` and is titled "Events the next update
  may not count".
- `openWith` ('me' | 'last') and `lastViewed` in the settings. The player
  is written only while Last viewed player is chosen (choosing it stores the
  one shown, going back to You forgets it), so the default writes nothing on
  a player switch. `initialSelection` opens it only while it is stored.
- `chartData` in src/app/chart.ts (pure): the rated rounds in the period,
  oldest first, each with its kind and mark (`counts`, `twice`, `not` for
  outside the window or after the deadline, `ruled-out` for dropped,
  excluded by PDGA or left out); the window clipped to the period; the y
  range from the rounds and both lines, on steps of 5 to 500 with at most
  five gaps; month ticks every 1, 2, 3, 6 or 12 months, at most five. The
  last 24 months end today, or at a planned round when it is later.
- src/app/views/chart.ts draws a 300 by 200 viewBox, capped at 24rem wide:
  circles, squares and triangles; filled, ringed, hollow, or hollow with a
  cross; the window in `--surface`, the prediction solid in `--accent` and
  the official rating dashed in `--text-muted`, each with its value at the
  right. A tap picks the nearest point within 24 screen pixels; the arrow
  keys, Home and End step through the points. The chosen round shows in a
  polite live line under the chart, the SVG's label sums up the chart, the
  legend lists only what the period has, and a closed "Show as table"
  holds the same rounds, newest first. Forced colours keep the shapes.
- The period select is shared with the Top 8 (src/app/views/period.ts,
  `period.*` keys) and stored as `chartPeriod`, the same for every player.
- The contrast test requires the chart's colours to be theme tokens that
  reach 7:1 on the page and the shaded window.

## Chart follow-up
Spec, after testing the chart on the phone:
1. Rename "Open with" to "When the app opens", with "Show you" and "Show
   the last viewed player" (Swedish: "När appen öppnas", "Visa dig" and
   "Visa senast visade spelaren").
2. The official rating and the prediction are today's values, so in past
   periods their lines only confuse. Draw them only across the current
   rating window, leave them out when the period does not overlap it, and
   show the value once when they are equal. pdga.com's ratings history page
   (/player/<nr>/history) already shows the official rating over time, so
   the chart does not recalculate it: a link "Ratings history on pdga.com"
   under the chart opens it, in the same tab. (A calculated line at each past
   update was planned and dropped for this; idea 5 in docs/ideas.md keeps an
   exact line from that page for later.)
3. Draw the chart at the card's measured width and redraw on resize, so it
   fills the card on any screen while the text keeps a fixed size, instead
   of the 24rem cap.
4. A Full screen button opens the chart in a full-screen view, closed by
   back or Close. Where supported (Android) it asks for landscape; on iPhone
   the view follows the phone's rotation.
5. Show the tapped point's details above the chart, under the period select,
   so the finger does not cover them.

Built as (docs/plan-chart-follow-up.md):
- Labels only: the stored `openWith` field and its values stay.
- Both lines span the band, the prediction's window clipped to the period
  (one span for both, so they line up with the shading), with the value just
  after the line's end; without a band both are null and stay out of the y
  range. `same` in `chartData` draws one solid line with one label, and the
  legend and the SVG summary read "Official rating and prediction 978".
  `historyUrl` sits next to `detailsUrl` in src/app/views/pdga.ts; the link
  shows also for a period without rounds.
- `plot` draws in CSS pixels (viewBox = width × height) at the default 300 by
  200 first, then a `ResizeObserver` on the frame draws it at the measured
  whole-pixel width whenever that changes, keeping the chosen round; it
  stops observing once the frame leaves the page. In the card the height is
  two thirds of the width, 200 to 320 px; at least 240 by 160 px, narrower
  frames scale it down. The ticks moved from `chartData` (which returns
  `values` to fit) to the view: `monthTicks(from, to, maxTicks)` about one
  per 52 px of width, `ratingAxis(values, maxGaps)` about one gap per 32 px
  of height. The details line comes before the frame and keeps room for
  two lines.
- The full-screen chart is overlay `'chart'` in src/app/layers.ts, so it
  has a history entry like the setup and How it works. While it shows, it is
  all the page renders (header with the title and Close, the period select,
  the details line, and the chart filling the rest; no legend, link or
  table), with its own ids, as a modal dialog; focus goes to its heading and
  back to the Full screen button. The button's tap asks
  `requestFullscreen()` and then `screen.orientation.lock('landscape')`
  where `document.fullscreenEnabled`, both failures ignored; once the chart
  no longer shows, the app unlocks and leaves full screen. Android's back
  first leaves the browser's full screen: `fullscreenchange` closes the
  chart too, after 150 ms and only while the entry still shows it, so one
  back never goes back twice. A fresh load on the entry shows the chart
  without full screen, or the Rating tab when there is no player to chart.

## Chart polish
Spec, after testing the chart follow-up on the phone:
1. Full screen shows only the chart, without the period select. The tapped
   round's details show as a small label inside the chart, in a corner.
2. The Full screen button moves into the chart as a small, discreet icon in
   the top right corner, always visible so it can be found on a touch
   screen.
3. On a computer, hovering over a point shows its event, date, rating and
   status in a small tooltip by the pointer after about 100 ms. Touch keeps
   the tap.
4. An x-axis choice: "Time" as before, or "Even spacing", where every round
   gets the same width and the month labels follow, so a busy summer spreads
   out. Remembered with the settings.
5. Table: the event column wraps, so the rating and the date stay on one
   line.

Built as (docs/plan-chart-polish.md):
- The corner button (`.chart-corner`) is an 18 px icon at the top of a
  clear 36 px tap area in the frame's top right corner; the plot's top
  margin is 26 px, so it covers no point or line value. Full screen it is
  Exit full screen (`chart-full-close`); back and Escape close too.
- Full screen has no title bar, Close or period select; its `h1` is
  visually hidden. The chosen round is a polite live label (`.chart-label`)
  in the top left, empty and hidden until a round is chosen, moving to the
  top right while the chosen point is under it. The card keeps its details
  line above the chart.
- The tooltip (`.chart-tip`, `aria-hidden`) follows a mouse or pen within
  the tap radius, after `HOVER_DELAY` (100 ms) on the same point, placed
  through CSSOM, which the CSP allows (it blocks only style attributes).
  It hides on leaving the point or the chart and on a redraw.
- `chartAxis` ('time' | 'even') is stored next to `chartPeriod`, the same
  for every player, chosen with a segmented control under the period
  select. `xScale` in src/app/chart.ts places rounds, range ends and ticks.
  With even spacing a range starts in the gap before its first round and
  ends after its last, and a tick marks each month with a round, at least
  about 52 px apart, with the year on the first label and where it changes.
- In the table, dates and ratings do not wrap and event names wrap anywhere.

## First visit polish
Spec, after testing in a fresh browser:
1. Phone top bar on the start view and in the players panel: the view's
   title on the left of the first row, as Settings and How it works do.
   "Next Rating" goes next to the Players button on the start view, and
   "Switch player" next to Close in the panel, instead of a separate heading
   line below.
2. Start view, step 1: a way to find your PDGA number by name. Two tabs in
   the same box, "PDGA number" and "Search by name". The name tab opens
   pdga.com's player search with the name filled in, in the same tab, like
   the search in the players panel, with a hint that the number is in the
   PDGA # column there.

Built as (docs/plan-first-visit-polish.md):
- The bar shows "Next Rating" on the start view, and a stored player without
  data by name and number like the Rating view ("#12345" before the first
  import). The start view's `h1` and the panel's "Players" `h2` are
  wide-only. Opening the panel on a phone focuses the bar's heading
  (`topbar-title`); wide screens keep the panel's heading.
- The tabs are the segmented control of native radios, with a visually
  hidden legend under the step title. The chosen tab lives in memory only,
  so a page load, such as coming back from pdga.com, starts on PDGA number.
- The panel and the start view share `nameSearchForm` (views/pdga.ts) with
  their own ids, label and hint. The start view's hint says the search opens
  in this tab, the number is in the PDGA # column, and to come back and
  enter it under PDGA number.

## Polish from phone testing
Spec, after testing on phones:
1. Bookmark name: while the setup page is open, the page title is "Next
   Rating: get data" ("Next Rating: hämta data"), so a bookmark made there
   gets that name and is not confused with a bookmark to the app. The title
   comes back when the page closes. The steps use that name.
2. Android: the bookmarklet works in Chrome, Brave, Ghost Browser and Samsung
   Internet. The steps fit any of them, the tested browsers are listed under
   "If it doesn't work", and it runs by typing "get data" in the address bar
   and tapping the bookmark suggestion.
3. iPhone: only Safari works; Brave, Chrome and Firefox grey out Save when
   the bookmark address is a script. It runs from the address bar's book
   icon (iOS 27 shows it after a tap on the address bar). Starting it from
   the address bar suggestions fails with "Cannot Run Script", listed under
   "If it doesn't work" with the fix. New bookmarks go in Favorites.
4. Chart: full screen, the tapped round's label in body text size; in the
   card and full screen, a tap away from every point clears the chosen round.
5. Chart table on a phone: no word breaks. Date, Rating and Round, with the
   status and the source as a smaller second line in the Round cell
   ("Counts twice · Official").
6. Dates in the app's language: an English app on a Swedish phone showed
   Swedish month names on the chart.
7. The period select's window option was cut off on a phone: "Rating window
   (12 months)", with the dates elsewhere.

Built as (docs/plan-phone-testing-polish.md):
- `render()` sets `document.title` (`pageTitle()` in main.ts). The steps
  name the bookmark through a `{name}` parameter from `setup.bookmarkName`.
- The setup has an optional note per platform under its heading (only
  iPhone, Safari only) and trouble items per platform before the shared ones
  (iPhone: Cannot Run Script; Android: the tested browsers). The Android
  heading is "Android browsers", with one generic wording and Chrome's menu
  as the example; only Chrome is said not to run it from the bookmarks list.
  Safari's message stays in English in the Swedish catalog.
- `.chart-label` is 1rem. `clear()` in `plot()` hides the highlight and puts
  back the card's hint, or empties the full-screen label. The corner button
  is outside the svg, so tapping it does not clear.
- The table's Round cell holds two block spans, `chart-round-name` and
  `chart-round-status`. Headers, dates and ratings do not wrap; the Round
  cell uses `overflow-wrap: break-word` instead of body's `anywhere`.
- `dateLocale()` (format.ts): the app's language with the device's region
  (`Intl.Locale(...).maximize().region`), e.g. en-SE, which keeps
  2026-08-06 with English month names. All date formatters default to it;
  numbers keep `deviceLocale()`. The browsers' own date pickers keep the
  phone's language.
- The window's dates: the chart legend's band item ("Rating window,
  2025-08-27 to 2026-08-26", the whole window); the Top 8, which has no
  legend, shows them in a hint under the select while the window is picked
  (`windowDates` in period.ts).

## Fixes from iPhone testing
Spec, after testing on an iPhone (and one point from Android):
1. Date format: an English app on an iPhone showed US dates (10/21/2026).
   Settings has "Date format": Automatic (the default, as before), Year
   first (2026-10-21), Day first (21/10/2026) and Month first (10/21/2026),
   stored with the settings.
2. On iOS, choosing an option in a select opened it again. Fixed for every
   select and for the custom range's date fields.
3. "Show as table" under the chart stays open across views, language
   changes and launches, like the cards.
4. iPhone date fields stay inside the margin and show a calendar icon.
5. Full screen on iPhone: Safari has no real full screen there, so the view
   says to turn the phone, with rotation lock off.
6. "Manual rounds" ("manuella rundor") everywhere, also in the Top 8
   ("Include manual rounds", rows marked "Manual") and the chart legend.
7. Full screen on wide screens (64rem, the wide layout): the period select
   and the x-axis choice above the chart. Phones keep the chart only.
8. Full screen, the chosen round is in a strip of its own above the chart,
   on one centred line: the rating in bold, the date, the event and round,
   the status and the source ("1019 · 2026-08-23 · Example Open, round 3 ·
   Counts twice · Official"). A long event name gets an ellipsis. The card's
   details line uses the same order.

Built as (docs/plan-iphone-testing.md):
- `dateOrder` in AppData (null is Automatic). `setDateOrder()` in
  format.ts; `formatDate` and `formatDateTime` build a fixed order from the
  date, and `formatDayMonth` puts the month name first only for Month first.
  Each option shows today as its example. The browsers' own date pickers
  keep the device's format, which the hint under the select says.
- `restoreFocus()` in main.ts: on a touch screen (`(pointer: coarse)`) a
  select or date field is not focused after a render, since iOS then opens
  its picker. Focus goes to a stand-in that opens none: the card's header,
  the full-screen chart's heading, or the view's heading.
- `chartTable` in AppData; the table's `<details>` uses `disclosure()` and
  stores its state without a render.
- `dateInput()` (views/date-input.ts) wraps the three date fields with an
  inline SVG icon (the CSP blocks `data:` images). The icon and
  `appearance: none` apply only in iOS Safari
  (`@supports (-webkit-touch-callout: none)`).
- `rotateHint` on `chartFullView`, from `!document.fullscreenEnabled`; the
  line hides in landscape.
- Stored names stay (`top8Own`, `top8-own`, PointKind `'own'`); only the
  texts changed. The Top 8 label column widens while a manual row shows
  (`:has(.top8-row-own)`).
- `.chart-full-controls.wide-only` holds `periodControls` with id
  `chart-full` and `axisControl('chart-full-axis')`.
- `plot()` returns the details line before the frame in both views; the
  corner label and its placement (`placeLabel`) are gone. `detailParts()`
  builds the parts as spans after a `<strong>` rating. Full screen, the strip
  is a flex row where only `.chart-detail-event` shrinks, with
  `white-space: pre` so each part keeps its leading space.

## Polish from computer and Android testing
Spec, after testing on a computer and a Pixel 8:
1. The chart's period select and x-axis choice are equally tall, their
   labels on one line, and "Even spacing" on one line. Side by side where
   both fit (the card on a computer, full screen), stacked on phones; a
   custom range's dates under them.
2. Full screen, the period and x-axis show only on screens wide and tall
   enough. A phone turned sideways (the Pixel 8 is wider than 64rem) keeps
   the chart only.
3. Rating and Settings each open where they were last scrolled while the
   app is open. Tapping the tab already shown scrolls it to the top; a new
   launch, another player and an import start at the top.
4. The Rounds card lists the rounds newest first down to the oldest round
   that counts or is dropped, and one more. Rounds above that which don't
   count still show where they are. "Show N more rounds" shows the rest at
   once, kept for that player while the app is open. With no round that
   counts, the newest round and the button show.
5. Claude opens the pull request with gh and reports CI; I merge.

Built as (docs/plan-computer-android-polish.md):
- `chartControls(prefix, …)` in views/chart.ts, used by the card and full
  screen: `div.chart-controls` (flex, wrap, `align-items: flex-start`) with
  the period field and the x-axis fieldset, then the custom range. Segment
  labels are `calc(3rem - 4px)` tall, so a segmented control with its
  border is as tall as an `.input` (every segmented control). The legend
  floats at full width, so it lays out like a block `.label`. In the row the
  segment labels don't wrap, are sized by their words, and keep room for the
  check mark on both.
- `.chart-full-controls` (no longer `.wide-only`) shows from
  `(min-width: 64rem) and (min-height: 40rem)`.
- `scrollTops` in main.ts, in memory only; `saveScroll()` records the tab's
  `scrollY` when its own view is left or covered (`selectTab`,
  `openOverlay`, the players panel, `selectPlayer`, `showBanner`).
  `selectTab` restores it, or scrolls to the top for the tab already shown.
  A card chart not yet measured is limited to 200–320px high (CARD_HEIGHT),
  so the page keeps its height when the chart is drawn again.
- `shownRounds()` in views/rating.ts; `RatingProps.rounds` with `expanded`
  and `onExpand`, and `roundsExpanded` in main.ts, reset when another player
  is shown. `#rounds-more` uses `rounds.more.one|other`; the first round it
  adds is `#rounds-next` with `tabindex="-1"` and gets focus.
- CLAUDE.md "Process": the branch routine at the start of a step, and pull
  requests opened with gh.

## Rating history line
Spec (idea 5 of docs/ideas.md), with a fix for times:
1. The bookmarklet also fetches the player's ratings history page
   (pdga.com/player/<nr>/history), and the app reads the official rating at
   each update from its table.
2. The chart draws the official rating as a stepped line across the chosen
   period, with the prediction as the last step at the next update.
3. A new bookmarklet version means a reinstall for everyone. Build it so
   that new pdga.com pages need no reinstall later, without letting a link
   make it fetch any page it likes, and report its size against 5 kB.
4. With a year-first date format, times showed as "2:50 PM". Year first
   implies a 24-hour clock ("14:50"); the default US English format keeps
   AM/PM. No extra setting.

Built as (docs/plan-rating-history.md):
- Page kind `history`; src/parsers/history.ts reads `#player-results-history`
  (effective date, rating, rounds used), oldest first. Stored as
  `StoredImport.history`, replaced only by an import that brings it;
  `Model.history` adds the player header's rating when its date is newer.
- Bookmarklet 1.2.0, 5036 bytes: on a details or profile page it fetches the
  history last, after the season and event pages, so a failure there costs
  no event page, and the fragment limit drops event pages, never the
  history. On any other page of a player (`/player/<nr>/<word>`, with a year
  after it as on a season page) it sends that page alone and fetches
  nothing, so a page the app learns later is read by a run on it; only
  fetching it in the one-tap run needs a new version. Nothing outside the
  bookmarklet decides what it fetches. `PDGA_PAGE` accepts those pages,
  `MAX_PAGES` is 14.
- `ratingSteps` and `ChartData.steps` and `next` in src/app/chart.ts: each
  update's rating to the next update's date, clipped to the period, the last
  one to the next ratings update; the prediction at that update when it is
  in the period. With a history the last 24 months and the rating window run
  on to the next update, and the flat lines across the window are gone,
  also before the first update; without a history the chart is as before.
  One dashed path, a solid rise held to the period's end with its value,
  even spacing included; not tappable. Legend "Official rating after each
  update" and "Prediction 978 at the 10 Nov update", and both in the SVG
  summary. The ratings history link stays.
- `formatDateTime` uses `hourCycle: 'h23'` with Year first and Day first;
  Month first and Automatic keep the clock of the device's region, also in
  the English app (24-hour on a Swedish phone, AM/PM on a US one). It is the
  only clock time in the app (the "Last import" line).

## Bookmarklet size
Spec, after a cut-off paste on a Pixel:
1. Bookmarklet 1.2.0 was 5034 characters as pasted (the build test said
   5036, measured with a longer test URL). Pasted into the URL field of a
   bookmark in Chrome on Android, it was cut off near its end.
2. Measured on a Pixel with test strings whose end shows their length: the
   bookmark URL field in Chrome on Android keeps exactly 5,000 characters,
   and cuts the rest of a paste. On a computer all 10,000 fit. No documented
   limit was found for it or for Safari on iPhone.
3. The app already copies the whole code with its Copy button, so copying
   was not the problem. A short loader that fetches the code from the app
   was turned down: it would run remote code on pdga.com.
4. Shrink the code to at most 4,200 characters, with the same behavior and
   the same v2 hand-off, and check that in the build test with the live app
   URL. The setup page gives the code's length and ending, so a pasted
   bookmark can be checked.

Built as:
- Bookmarklet 1.3.0, 4171 characters. `pageKind` and `isChallenge` in
  src/bookmarklet/collect.ts tell pages apart by path, as `detectPage` does
  from a URL, so the bookmarklet no longer bundles src/parsers/page.ts; a
  test checks they agree. A fetched page counts when it is no challenge and
  either was not redirected or was redirected to a page of the same kind.
- `PARTS` holds each kind's main content and other parts; `read()` fetches a
  page and keeps it, an event page with only the player's rows; the status
  is a local variable until the envelope is built at the end.
- After a markup change, the whole document is sent with its scripts and
  styles cut from the serialized HTML by a regex, instead of an inert copy of
  the body.
- `packText` encodes base64url with one replace. The progress bar has no
  transition, a width in `vw` (no `%25` in the URL) and its role and value
  through ARIA reflection.
- `LIVE_APP_URL` in scripts/bookmarklet.ts is the one place for the app URL;
  vite.config.ts and the build test use it. The build test fails above
  4,200 characters.
- `setup.trouble.address` gives `{length}` (`formatCount`, grouped as on the
  device) and `{end}` (";void 0").

## Prediction in the players list
Spec (idea 1 in docs/ideas.md):
1. Each stored player in the players panel, favorites and the unsaved
   player, shows the predicted rating with the change under it at the right
   of the button, so the whole group shows at a glance.
2. Only data that is already stored: no bookmarklet change (it stays 1.3.0,
   4171 characters) and no fetching. It counts manual rounds and left-out
   events as the Rating tab does.
3. No import, or no prediction (no rated round and no official rating): no
   figures, as before. No new round that counts: the official rating with
   "→ 0". No official rating yet: the rating without a change line.

Built as:
- `playerModel` in src/app/model.ts gives a stored player's model, for the
  Rating tab, the full-screen chart and the list alike. `listPrediction`
  takes `{ rating, change, unchanged }` from it.
- `createPredictionCache` remembers each player's result while the content
  stays the same: `import.at`, the manual rounds, the left-out keys and the
  day. Storage hands out new objects after every change, so the key is the
  content, not the object.
- `playersPanel` takes `predictions` by PDGA number. `.player-select` is a
  two-column grid: `.player-text` (name and import age, wrapping) and
  `.player-prediction` (tabular figures, never wrapping). The arrow and sign
  carry the change, with the Rating tab's `change-up/down/none` colours;
  `direction` moved to src/app/views/change.ts for both views.
- The figures are `aria-hidden`; a visually hidden `players.prediction` or
  `players.predictionChange` reads "Predicted rating 985, +7 vs official
  rating" instead.

## Test fixtures
Requirements (built; the tests keep them):
- Unit tests for: the 24-month fallback, fewer than 7 / 9 rounds, the mid-event
  double-weight boundary, a previously dropped round becoming included, and
  hole weighting.
- Parser and bookmarklet extraction tests against the fixtures (jsdom).
- Round-trip tests for fragment encoding/decoding, including oversized and
  malformed input.
- A check that lists keys missing from non-English translation catalogs.

## Process
Built in this order:
- Engine + tests (done)
- Parsers + tests (done)
- Web app, commits 1 and 2 of docs/plan-step-3.md (done)
- GitHub Pages workflow (done)
- Bookmarklet (docs/plan-step-5.md), with a minimal setup page (version, copy
  button, short install steps for Safari on iPhone, Chrome on Android and
  desktop), so it can be installed and tested on my phone (done)
- Fixes after testing on a phone: rating change arrow and colour, theme
  setting, stats layout, paste hint (done)
- Favorites (docs/plan-favorites.md; before manual entry, so manual rounds
  are stored per player from the start) (done)
- Change explanation: why the prediction differs from the official rating
  (docs/plan-change-explanation.md) (done)
- Polish after favorites (Architecture 7) (done)
- Deadline-aware prediction (Architecture 8) (done)
- Web app, commit 3 of docs/plan-step-3.md: quick manual entry, data age and
  the offline PWA (done)
- Target calculator (Architecture 9, docs/plan-target-calculator.md), with
  Undo for deleting a manual round (done)
- Top 8 panel (Architecture 10, docs/plan-top8.md), with Statistics kept
  open through a re-render (done)
- Rating tab design pass (docs/plan-design-pass.md) (done)
- Setup page, with the bookmarklet status and How it works
  (docs/plan-setup-page.md), after the design pass feedback (done)
- X-tier events and rounds PDGA leaves out (docs/plan-x-tier.md), after the
  top bar and closed-card header feedback (done)
- Target date: a date in the target calculator (docs/plan-target-date.md)
  (done)
- Phone polish and Top 8 with manual rounds (docs/plan-phone-polish.md) (done)
- Rating chart, with notes for leagues and late reports and Open with the
  last viewed player (docs/plan-chart.md) (done)
- Chart follow-up: lines across the window, the ratings history link,
  measured size, full screen and the details above the chart
  (docs/plan-chart-follow-up.md) (done)
- Chart polish: only the chart full screen, the corner button, the hover
  tooltip, even spacing and the table (docs/plan-chart-polish.md) (done)
- First visit polish: top bar headings and finding your PDGA number by name
  (docs/plan-first-visit-polish.md) (done)
- Polish from phone testing: the bookmark name, the Android and iPhone
  steps, the chart label and table, dates in the app's language and the
  window option (docs/plan-phone-testing-polish.md) (done)
- Fixes from iPhone testing: the date format, selects on iOS, the chart
  table, date fields, the full-screen hint, controls and round strip, and
  manual rounds (docs/plan-iphone-testing.md) (done)
- Ko-fi link: a plain link at the bottom of Settings, at the end of How it
  works and in the README, opened in the same tab (done)
- Polish from computer and Android testing: the chart controls, full-screen
  controls only where there is height, remembered scroll positions and a
  shorter Rounds card (docs/plan-computer-android-polish.md) (done)
- Rating history line: the official rating after each update as steps in
  the chart, bookmarklet 1.2.0 with the history page, and 24-hour times
  with Year first and Day first (docs/plan-rating-history.md) (done)
- Bookmarklet size: bookmarklet 1.3.0 under 4,200 characters (done)
- Prediction in the players list: each stored player's predicted rating and
  change, from stored data (done)
