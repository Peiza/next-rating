# Step 5 plan: the bookmarklet, with a minimal setup page

## Context

Until now, data reaches the app only through paste or the `npm run handoff`
dev helper. The bookmarklet is the one-tap import the app was designed for,
and installing it on a phone needs a setup page. Building it now, ahead of
Favorites, commit 3 and Top 8, means every later step can be tested on the
phone with real imports. The hand-off codec (`src/handoff/`), the extract
layer (`src/parsers/`), the status banner and the failed-page links are
already in place, so this step adds the collector, its build, and the setup
view.

Branch `step-5-bookmarklet`, one pull request, three commits.

## Commit 1: Build the bookmarklet before favorites

The Process list in `CLAUDE.md` moves the bookmarklet, with this minimal
setup page, ahead of Favorites, commit 3 of `docs/plan-step-3.md` and the Top
8 panel. The full Setup page stays last and completes the minimal one.
`docs/plan-step-3.md` names the new order, and this plan is saved here.

## Commit 2: The bookmarklet

**App URL, one build-time setting.** `vite.config.ts` gets
`APP_URL = 'https://peiza.github.io/next-rating/'`, overridable with the env
variable `NEXT_RATING_APP_URL` for local testing only (must be https, or http
on localhost or a LAN address, and end in `/`; the build fails otherwise). CI
never sets it.

**Source, readable, in `src/bookmarklet/`:**
- `version.ts`: `BOOKMARKLET_VERSION = '1.0.0'`. Bump it whenever the
  bookmarklet or the extract layer changes; the app also imports it.
- `pack.ts`: `packText` moved out of `src/handoff/codec.ts` with no imports,
  rewritten smaller with `Response` + `CompressionStream('deflate-raw')` and
  base64url. `codec.ts` re-exports it, so `encodeHandoff` and the existing
  codec tests keep working and prove the round trip.
- `collect.ts`: `collect(doc, url, deps) → Envelope`, with injected
  `fetchPage`, `wait` and `progress`, so it is testable in jsdom. Reuses
  `detectPage`, `extractPlayer`, `extractRatingsDetails`,
  `extractProfileEvents`, `extractEvent` and `parsePdgaDate`.
  - Page kind from `detectPage(document, location.href)`, player number from
    the URL path.
  - **details** or **profile**: read the current page (player plus details or
    profile events), wait about 1 s, then fetch the other page
    (`/player/<n>` or `/player/<n>/details`, same-origin GET, default
    credentials, nothing else).
  - **Event selection**: profile events whose id is not in the details, dated
    on or after the newest details round (all of them when there are no
    details), deduplicated by id, newest first, at most 10. If the details
    could not be read, no events are fetched (the app links to the details
    page instead). Each event page is fetched about 1 s after the previous
    one, one attempt each, and reduced to this player's rows (divisions
    without them dropped; an event without the player's rows is still kept,
    so the app shows "no rated rounds yet" for it).
  - Fetched HTML is parsed with `DOMParser` (inert: no scripts, no loading)
    and read with `textContent` through the extract layer only, so hidden
    round ratings on Unofficial Results pages are read without clicking the
    toggle.
  - **Stop rules**: HTTP 403 with `cf-mitigated: challenge`, or
    `detectPage(parsed, response.url)` = `challenge` → status `challenge`;
    any other failure (network error, non-2xx, a redirect to a different page
    kind) → `partial`. Both stop fetching and put the failed URL plus every
    page still planned into `failed`, as canonical
    `https://www.pdga.com/...` URLs (the format `envelope.ts` accepts).
  - **event** page: the whole event, no fetching (the app picks rows).
  - challenge page → `challenge` with the current URL; any other page →
    `unsupported-page`; an exception, or a player page without a player
    header → `error`.
- `main.ts` (entry): ignore a second tap while running (a marker element),
  show the progress indicator, run `collect`, encode, then
  `location.assign(APP_URL + '#d=' + payload)`. No `window.open`. Without
  `CompressionStream` it hands off an empty `#d=`, and the app (same browser,
  so no `DecompressionStream` either) shows its existing "browser cannot read
  imports" message.
- **Progress indicator**: a fixed 4 px bar at the top of the page with
  `role="progressbar"` and `aria-valuenow`, width done/planned, styled through
  `element.style` (CSSOM). No text.

**Build, `scripts/bookmarklet.ts`**: `buildBookmarklet(appUrl)` runs the
pinned Vite's `build()` API (`configFile: false`, lib mode, IIFE, minified,
`write: false`, `define: __APP_URL__`) on `src/bookmarklet/main.ts`, wraps it
as `javascript:void function(){…}()` so it never returns a value (a returned
string would replace the page), and percent-encodes `%`, `#`, whitespace,
quotes, `<`, `>` and backticks. A plugin in `vite.config.ts` serves it as
`virtual:bookmarklet` (`export default code`), typed in `src/build.d.ts`, so
dev, build and tests all get it without a generated file in git.

**Tests:**
- `tests/bookmarklet/collect.test.ts` (jsdom, synthetic pages built in the
  test, no fixture data): details-page and profile-page runs; request order
  and count, the 10-event cap and the waits between requests; event selection
  (in details, older than the newest round, duplicates); rows reduced to the
  player; challenge by header and by page markers; HTTP 500 and network
  errors → `partial` with all remaining URLs; event page, challenge page,
  unsupported page; hidden round ratings read. Each envelope goes through
  `encodeHandoff` → `decodeHandoff` to prove the app accepts it.
- `tests/bookmarklet/fixture.test.ts` (skipped without fixtures): run on the
  details fixture with fetch served from the profile and event fixtures; the
  decoded import reproduces the official rating from the profile page (as
  `tests/handoff/fixture.test.ts` does), expected values from expected.json.
- `tests/bookmarklet/build.test.ts`: starts with `javascript:`, under 5 kB,
  percent-decodes to code that compiles (`node:vm` `Script`), contains the
  app URL, and contains none of `cookie`, `Storage`, `indexedDB`,
  `innerText`, `.click(`, `window.open`, `.value`, `eval`, `Function(`,
  `import(` (minified code keeps property names, so a string scan works).
- If tree-shaking leaves normalize code from `src/parsers/` in the bundle and
  it misses 5 kB, move the extract functions into modules of their own.

## Commit 3: Minimal setup page

- **Setup view** (`src/app/views/setup.ts`), opened from the getting-started
  view, Settings and the update hint, not a tab (Setup next to Settings would
  confuse), with a Back button:
  - "Bookmarklet version 1.0.0".
  - A read-only textarea with the code (selected on focus) and a large
    "Copy bookmarklet" button (`navigator.clipboard.writeText`; when that
    fails, select the textarea and say "Copy the selected text").
  - Short steps for Safari on iPhone (bookmark this page, edit the bookmark,
    replace its address with the copied code, run it from Bookmarks on
    pdga.com), Chrome on Android (same, then type its name in the address bar
    on pdga.com and pick the starred suggestion) and desktop (new bookmark
    with the code as URL).
  - No draggable `javascript:` link yet: `el()` refuses non-https links and
    stays that way; the desktop drag link waits for the full Setup page step.
- **Getting-started steps**: 1 PDGA number, 2 Install the bookmarklet (button
  to Setup), 3 Open ratings details and run it there, 4 Or paste a table.
- **Settings**: "Bookmarklet version X" and an "Install or update" button.
- **Update hint**: when a hand-off's `bookmarklet` version is older than
  `BOOKMARKLET_VERSION`, the banner adds "A newer bookmarklet is available"
  with a button to Setup.
- New keys in `en.json` and `sv.json`; README: what the bookmarklet reads
  (only page content of player and event pages, at most 12 requests, about
  1 s apart), how to install it, and local testing with
  `NEXT_RATING_APP_URL` (PowerShell and sh syntax).
- Tests in `tests/app/views.test.ts`: setup view renders the code as text,
  copy fallback, update hint shown only for older versions.

## Verification

- `npm run typecheck`, `npm test` (fixture tests run locally), `npm run
  check:i18n`, `npm run build`; the build test prints the bookmarklet size.
- Desktop before merging: set `NEXT_RATING_APP_URL=http://localhost:4173/`,
  `npm run build`, `npm run preview`, copy the bookmarklet from Setup into a
  bookmark, run it on your ratings details page on pdga.com. Expect the
  progress bar, then the app with the prediction and no fragment in the
  address bar; DevTools Network on pdga.com shows one profile request and at
  most 10 event requests about 1 s apart.
- Phone after merging: install from the live Setup page in Safari (iPhone)
  and Chrome (Android), run it on the details page, the profile page, an
  Unofficial Results event page and a non-PDGA page.
- Before each commit, check the staged diff for fixture names and numbers.
