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
4. Web app (PWA, works offline after first load), the built parts. The open
   parts (manual entry, data age, setup page, local storage) are in CLAUDE.md.
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
