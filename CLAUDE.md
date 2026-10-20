# Project: next-rating

A PDGA rating predictor: mobile-first rebuild of a Google Apps Script tool.

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

App URL: https://peiza.github.io/next-rating/
It is hard-coded in the bookmarklet, so it must not change later. Keep it as a
single build-time setting.

## Hard constraints
- No server-side fetching of pdga.com in any form (Apps Script, serverless
  functions, backend or CORS proxy). It hits the same challenge. Do not propose it.
- Never try to bypass bot protection: no headless browsers, proxy rotation,
  CAPTCHA solving or fingerprint spoofing.
- pdga.com cannot be embedded (X-Frame-Options: SAMEORIGIN) and sends no CORS
  headers, so no iframes and no cross-origin fetch from the app.
- PDGA data is read only inside the user's own browser session on pdga.com
  (bookmarklet) or pasted by the user. Keep request volume minimal: no
  background polling, no scheduled fetching.
- No backend, no accounts, no secrets.
- Mobile-first: must work well in Safari on iPhone and Chrome on Android.
- The app and README state that this is an unofficial tool, not affiliated
  with the PDGA.

## Repository and hosting
- Public GitHub repo "next-rating". A GitHub Actions workflow builds dist/,
  runs the tests and deploys to GitHub Pages on every push to main.
- Relative asset paths, no path-based routing and no server rewrites, so dist/
  also works on any other static HTTPS host.
- legacy/ and tests/fixtures/ are local only and git-ignored: the fixtures are
  copies of pdga.com pages, and the legacy script is a Swedish-language
  reference that quotes private email correspondence. Never commit them.
- CI must not depend on git-ignored files: fixture-based tests are skipped
  when the fixtures are absent and run locally.
- The README documents the one-time setup I do myself in the GitHub web UI
  (Settings > Pages > Source: GitHub Actions).

## Language and locale
- Code, identifiers, comments, commit messages, README and other docs in
  English. legacy/rating-calculator.gs has Swedish names and comments; use it
  as reference only and never carry its Swedish identifiers over.
- UI language: English is the default and the fallback. All user-facing text
  (UI, setup instructions, status and error messages) comes from one
  translation catalog per language, so a language can be added without code
  changes. Ship English and Swedish. Pick the language from the device
  settings, allow a manual override, and set <html lang> to the active
  language. Missing keys fall back to English.
- Dates and numbers follow the user's locale through Intl (a Swedish phone
  shows 2026-08-06 and 976,45). Ratings never get a thousands separator
  (a 1024 round shows as 1024).

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
4. Web app (PWA, works offline after first load):
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
   - Quick manual entry of rounds (rating, date defaulting to today, optional
     event name and hole count), usable one-handed on a phone.
   - Results: predicted rating, change vs current official rating, and a round
     list marking included, dropped and double-weighted rounds, plus the stats
     panel from the legacy sheet.
   - Data age is obvious: next to the predicted rating, show "Updated X days
     ago" from the last import's timestamp, using Intl.RelativeTimeFormat. When
     the data is more than 7 days old, show a clear notice with a button that
     opens the player's pdga.com ratings details page to refresh.
   - Setup page with step-by-step bookmarklet installation for Safari on iPhone,
     Chrome on Android (run it by typing its name in the address bar) and
     desktop browsers, with a copy button.
   - Theme: a segmented control on the Settings tab with Device (the
     default), Light and Dark. Both themes pass the contrast test.
   - Store locally only: the language override, the theme choice and the
     players' data. Each
     player (each favorite, see 5) keeps its own PDGA number, last import
     (show its timestamp) and manual rounds. Until the Favorites step, one
     player's data is stored. When the storage format changes, existing data
     is migrated, never silently dropped. On iOS, home screen web apps do not
     share storage with Safari tabs, so the full flow must work in a normal
     browser tab; installing is optional.
5. Favorites:
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
   - Optional, later: a transfer link that moves favorites and manual rounds
     to another device through the same URL-fragment hand-off, without a
     server.
6. Change explanation, on the Rating tab:
   - Under the change line, a short "Why it changed" list compares the last
     official update with the prediction, using the real engine.
   - The official state is the official rounds only, which reproduces the
     official rating; the new state is all rounds.
   - List what differs: new rounds with their ratings, rounds that left the
     window, rounds that started or stopped counting twice, and rounds newly
     dropped or no longer dropped.
   - Estimate each effect with the engine, mark it with an arrow for up or
     down, and show the largest effects first. Example: a 985 round that no
     longer counts twice can outweigh a new 938 round.
7. Target calculator, on the Rating tab:
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
8. Top 8 panel, in its own collapsible panel on the Rating tab, styled like
   the PDGA Global Masters Series (GMS) player card but for any player. Visual
   style only: no PDGA logos or other PDGA assets.
   - Show Sum, Average (rounded to a whole number, as GMS does) and High, and
     below them the 8 highest-rated rounds, each with round label, event name
     and rating, highest first.
   - Count every rated round: official rounds from the details page and
     unofficial rounds from imported events. No tier filter and no hole
     weighting. DNF and manual rounds do not count.
   - Period: by default the current calendar year, following today's date (as
     GMS does). A switch offers instead exactly the window the rating
     prediction uses, with the same anchor (the most recent rated round) and
     the same 24-month fallback.
   - With fewer than 8 rounds, show how many were found and the average of
     those.
9. Optional, later: an iOS Shortcut variant (Safari share sheet, "Run JavaScript
   on Web Page") reusing the same extractor, with setup instructions in the app.

## Security
- Treat all imported data (URL fragment, paste) as untrusted: strict schema
  validation and size limits, render with textContent only. No innerHTML with
  data, no eval or new Function.
- Strict Content Security Policy for the app, set with a meta tag since GitHub
  Pages cannot send custom headers: default-src 'self'. No third-party
  scripts, fonts, CDNs or analytics.
- Minimal, pinned dependencies with a lockfile; prefer zero runtime dependencies.
- When adding or upgrading a dependency, pick a version that was published at
  least 14 days ago, and run npm audit afterwards.
- Never let npx or npm exec download packages. Run tools only through npm
  scripts or packages already pinned in package.json, and stop background
  servers by stopping the task directly. Never use curl or similar tools to
  check a local server.
- Bookmarklet source kept readable in the repo, minified by a build script,
  with a version number the app can display.
- GitHub Actions: least-privilege permissions per job, every action pinned to
  a full commit SHA.

## Rating rules (from pdga.com/ratings/guide plus confirmed clarification)
- Window: 12 months back from the most recent rated round; if fewer than 8
  rounds, use 24 months.
- Outlier drop: compute mean and population stdev over ALL candidate rounds
  (before exclusion, to avoid circularity). Drop rounds below
  max(mean - 100, mean - 2.5 * stdev), only if at least 7 candidates exist.
  Previously excluded official rounds can become included again when new rounds
  are added, so never trust PDGA's Included flag for prediction; recompute.
- Double weighting: the most recent 25% (rounded up) of included rounds count
  twice, only if at least 9 rounds are included.
- If the 25% boundary falls inside an event, double-weight the HIGHEST rated
  rounds of that event, not the first/last by table order (confirmed by the
  PDGA Ratings team).
- Hole weighting: weight = holes / 18 where hole count is known.
- DNF rounds never count.
- Multi-day date ranges like "1-Aug to 2-Aug-2026" use the last date.

## Test fixtures
pdga.com cannot be fetched from this environment either, so tests/fixtures/
(local only, see Repository and hosting) contains pages saved from my browser:
- details-188063.html (ratings details page)
- player-188063.html (player profile page)
- event-rated.html (an event already included in my rating)
- event-unofficial.html (a recent event with unofficial round ratings)
Requirements:
- The engine must reproduce PDGA's Included flags for every round in
  details-188063.html and the official rating shown in player-188063.html.
- Unit tests for: the 24-month fallback, fewer than 7 / 9 rounds, the mid-event
  double-weight boundary, a previously dropped round becoming included, and
  hole weighting.
- Parser and bookmarklet extraction tests against the fixtures (jsdom).
- Round-trip tests for fragment encoding/decoding, including oversized and
  malformed input.
- A check that lists keys missing from non-English translation catalogs.
Committed code and tests never contain personal data from the fixtures (names,
PDGA numbers, event ids, event names or results); fixture-specific expected
values live in the git-ignored tests/fixtures/expected.json.

## Process
Start with a plan for my approval. Changes reach main through pull requests
that I merge; the workflow builds and tests every pull request and deploys
every merge, so each version can be tested live on my phone. Build in this
order, committing after each working step:
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
- Web app, commit 3 of docs/plan-step-3.md: quick manual entry, data age and
  the offline PWA
- Target calculator
- Top 8 panel
- Setup page: complete the minimal one with the full step-by-step
  installation
