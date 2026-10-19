# Project: next-rating

A PDGA rating predictor: mobile-first rebuild of a Google Apps Script tool.

## Background
I had a Google Sheets + Apps Script tool (legacy/rating-calculator.gs) that fetched
my PDGA ratings history from pdga.com/player/<number>/details and predicted my next
rating, including hypothetical or not yet rated rounds entered manually.
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
   round where the page shows it. Shared by the bookmarklet and the paste import.
3. Bookmarklet, fully self-contained (never loads remote code, so no external
   code ever runs on pdga.com):
   - On any player page (/player/<nr> or /player/<nr>/details): read the current
     page, then fetch the other one with a same-origin GET in the user's session.
     Collect rated rounds, name and current rating. Find recent events from the
     profile page that are not yet in the ratings details, fetch those event
     pages and keep only this player's unofficial round ratings. Max 10 event
     pages, sequential, about 1 second apart, one attempt per page.
   - On an event results page: extract the results table; the app picks the
     user's rows by PDGA number.
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
   - Read only visible page content. Never read cookies, storage or form fields.
   - Keep the minified bookmarklet small (target under 5 kB), since on phones it
     is pasted into the bookmark URL field.
4. Web app (PWA, works offline after first load):
   - Enter a PDGA number once (default player; the app works for any player).
     A button opens that player's ratings details page on pdga.com with a short
     hint to run the bookmarklet there.
   - Import from the URL fragment, then remove it with history.replaceState.
   - Paste import as fallback (tab-separated and HTML clipboard content).
   - Quick manual entry of rounds (rating, date defaulting to today, optional
     event name and hole count), usable one-handed on a phone.
   - Results: predicted rating, change vs current official rating, and a round
     list marking included, dropped and double-weighted rounds, plus the stats
     panel from the legacy sheet.
   - Setup page with step-by-step bookmarklet installation for Safari on iPhone,
     Chrome on Android (run it by typing its name in the address bar) and
     desktop browsers, with a copy button.
   - Store locally only: PDGA number, language override, last import (show its
     timestamp) and manual rounds. On iOS, home screen web apps do not share
     storage with Safari tabs, so the full flow must work in a normal browser
     tab; installing is optional.
5. Optional, later: an iOS Shortcut variant (Safari share sheet, "Run JavaScript
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

## Process
Start with a plan for my approval. Build in this order and commit after each
working step: engine + tests, parsers + tests, web app, GitHub Pages workflow,
bookmarklet, setup page.
