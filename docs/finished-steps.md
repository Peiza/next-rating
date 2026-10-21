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
   - Keep the minified bookmarklet small (target under 5 kB), since on phones it
     is pasted into the bookmark URL field.
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
     players list order, which Rating tab cards are open, the Top 8 period,
     the bookmarklet version from the last hand-off and the players' data. Each player (each favorite)
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

## Phone polish and Top 8 with own rounds
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
4. Top 8: a switch "Include my own rounds", off by default and remembered.
   When it is on, manual rounds count in the Top 8, are marked as my own,
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
  "Own" in place of the round label, with its event name or "Own round", no
  link.
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
- Phone polish and Top 8 with own rounds (docs/plan-phone-polish.md) (done)
