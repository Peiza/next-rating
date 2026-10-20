# Project: next-rating

A PDGA rating predictor: mobile-first rebuild of a Google Apps Script tool.
Finished steps are specified in docs/finished-steps.md; their rules still apply.

## Background
My Google Sheets + Apps Script tool (legacy/rating-calculator.gs) predicted my
next PDGA rating from my rated rounds, including new rounds with unofficial
round ratings and ratings I added myself. This app never calculates a rating
from a score. The old tool stopped working because pdga.com answers
server-side requests with a Cloudflare challenge, and the official PDGA API
developer program is closed. A bookmarklet runs on pdga.com and its
same-origin fetches pass without a challenge (verified on my phone), so the
one-tap bookmarklet flow is the primary path. Details in
docs/finished-steps.md.

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
  (bookmarklet). Keep request volume minimal: no
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
Built (docs/finished-steps.md, same numbering): 1 rating engine, 2 parsers,
3 bookmarklet, 4 web app (import, results, theme, manual entry, data age,
local storage, offline PWA), 5 favorites, 6 change explanation, 7 polish
after favorites, 8 deadline-aware prediction, 9 target calculator, 10 Top 8
panel.

Bookmarklet rules every change keeps:
- Fully self-contained: it never loads remote code, so no external code runs
  on pdga.com. It parses nothing; it sends the HTML of the page parts the
  app's parsers read, so a pdga.com markup change is fixed by deploying the app.
- Read only page content, including content hidden behind a toggle (read with
  textContent; never click the toggle). Never read cookies, storage or form
  fields.
- At most 10 event pages, sequential, about 1 second apart, one attempt per
  page. On a Cloudflare challenge or a failure, stop fetching and hand off
  what was collected, with the URLs of the pages that failed.
- Hand off by navigating the current tab to the app with the data compressed
  and base64url-encoded in the fragment (#d=...), reserved for this hand-off.
  Never window.open after async work.
- No text of its own: a minimal progress indicator and a status code that the
  app translates. Minified size under 5 kB.

Open:

4. Web app, the open part: a setup page with step-by-step bookmarklet
   installation for Safari on iPhone, Chrome on Android (run it by typing its
   name in the address bar) and desktop browsers, with a copy button.
5. Favorites, optional, later: a transfer link that moves favorites and manual
   rounds to another device through the same URL-fragment hand-off, without a
   server.
11. Optional, later: an iOS Shortcut variant (Safari share sheet, "Run JavaScript
    on Web Page") reusing the same extractor, with setup instructions in the app.

## Security
- Treat all imported data (URL fragment) as untrusted: strict schema
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
- Outlier drop (leave-one-out): compare each round in the window with the
  plain (unweighted) mean and population stdev of the OTHER rounds in the
  window, all taken before any exclusion, so the rule is not iterated. Drop it
  when it is below max(mean - 100, mean - 2.5 * stdev), only if at least 7
  rounds are in the window. Verified against several players' Included flags;
  one limit from the mean of all rounds, and a mean with double weighting,
  both fail (the local rule check in tests/engine/fixture.test.ts).
  Previously excluded official rounds can become included again when new rounds
  are added, so never trust PDGA's Included flag for prediction; recompute.
- Double weighting: the most recent 25% (rounded up) of included rounds count
  twice, only if at least 9 rounds are included.
- If the 25% boundary falls inside an event, double-weight the HIGHEST rated
  rounds of that event, not the first/last by table order (confirmed by the
  PDGA Ratings team).
- Hole weighting: weight = min(holes, 18) / 18 where hole count is known. A
  round longer than 18 holes counts as one round (verified against an official
  rating); shorter rounds are weighted down (not yet verified against a
  fixture).
- DNF rounds never count.
- Multi-day date ranges like "1-Aug to 2-Aug-2026" use the last date.

## Test fixtures
pdga.com cannot be fetched from this environment either, so tests/fixtures/
(local only, see Repository and hosting) contains pages saved from my browser:
- details-188063.html (ratings details page)
- player-188063.html (player profile page)
- event-rated.html (an event already included in my rating)
- event-unofficial.html (a recent event with unofficial round ratings)
The engine must reproduce PDGA's Included flags for every round in
details-188063.html and the official rating shown in player-188063.html.
The other required tests are listed in docs/finished-steps.md.
Committed code and tests never contain personal data from the fixtures (names,
PDGA numbers, event ids, event names or results); fixture-specific expected
values live in the git-ignored tests/fixtures/expected.json.

## Process
Start with a plan for my approval. Ask questions as plain text in the reply:
numbered questions, each with lettered options and your recommendation, so I
can copy them. Don't use interactive question boxes. Changes reach main through pull requests
that I merge; the workflow builds and tests every pull request and deploys
every merge, so each version can be tested live on my phone. Done so far:
engine, parsers, web app commits 1 and 2, Pages workflow, bookmarklet with a
minimal setup page, fixes after phone testing, favorites, the change
explanation, the polish after favorites, the deadline-aware prediction,
web app commit 3 (manual entry, data age, offline PWA), the target
calculator and the Top 8 panel (docs/finished-steps.md). Build the rest in
this order, committing after each working step:
- Rating tab design pass (docs/plan-design-pass.md): one card pattern for
  every section, remembered open cards and Top 8 period, How to refresh,
  and a Top 8 period select
- Setup page: complete the minimal one with the full step-by-step
  installation

Verification runs typecheck, tests, the i18n check and the build only: no
local preview servers or handoff runs. I test on my phone after merging.

Ideas that are not planned: docs/ideas.md. Don't build them unless asked.
