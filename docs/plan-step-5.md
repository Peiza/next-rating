# Step 5 plan: the bookmarklet, with a minimal setup page

## Context

Until now, data reaches the app only through paste or the `npm run handoff`
dev helper. The bookmarklet is the one-tap import the app was designed for,
and installing it on a phone needs a setup page. Building it now, ahead of
Favorites, commit 3 and Top 8, means every later step can be tested on the
phone with real imports.

A first build bundled the shared extract layer into the bookmarklet and came
to 6.1 kB, over the 5 kB target, since record keys cannot be minified. The
design was changed: **parsing lives in the app.** The bookmarklet decides
which pages to fetch, fetches them, and sends the HTML of the parts the
extractors read. A pdga.com markup change is then fixed by deploying the
app, without anyone reinstalling the bookmarklet. The bookmarklet is now
about 4.3 kB.

Branch `step-5-bookmarklet`, one pull request, three commits.

## Commit 1: Build the bookmarklet before favorites

The Process list in `CLAUDE.md` moves the bookmarklet, with this minimal
setup page, ahead of Favorites, commit 3 of `docs/plan-step-3.md` and the Top
8 panel. The full Setup page stays last and completes the minimal one.
`docs/plan-step-3.md` names the new order, and this plan is saved here.

## Commit 2: Bookmarklet and HTML hand-off

**App URL, one build-time setting.** `APP_URL` in `vite.config.ts`
(`https://peiza.github.io/next-rating/`), overridable with the env variable
`NEXT_RATING_APP_URL` for local testing only. `checkAppUrl` in
`scripts/bookmarklet.ts` accepts https, or http on localhost or a LAN
address, ending in `/`; anything else fails the build. CI never sets it.

**Envelope v2** (`src/handoff/envelope.ts`):
`{ v: 2, status, page, bookmarklet, pages?: { url, html }[], failed? }`.
At most 12 pages (`MAX_PAGES`: the current page, the other player page and
10 event pages); each `url` must be a pdga.com player or event page (else the
envelope is rejected); each `html` at most `LIMITS.paste` characters. The
fragment limit (512 kB) and the streaming decompression limit (4 MB) stay.
No bookmarklet was installed anywhere, so v1 (raw records) is no longer
accepted. Stored data (`StoredImport`, raw records) is unchanged.

**Bookmarklet source** (`src/bookmarklet/`, bundling only `detectPage` from
`src/parsers/page.ts` and `src/handoff/pack.ts`):
- `version.ts`: `BOOKMARKLET_VERSION`, sent with every hand-off. Bump it
  whenever the bookmarklet changes.
- `src/handoff/pack.ts`: `packText` (Response + `CompressionStream`, base64url)
  and `MAX_PAYLOAD`, with no imports; the codec re-exports both.
- `collect.ts`:
  - `pageHtml(doc, kind)`: the `outerHTML` of the parts the extractors read,
    by one selector list per kind: details: canonical link, `#page-title`,
    `.current-rating`, `.tooltip-templates`, `#player-results-details`;
    profile: canonical link, `#page-title`, `.current-rating`,
    `table[id^="player-results-"]`; event: canonical link, `#page-title`,
    `.tournament-date`, `.leaderboard`. When the main content (the last
    selector of each list) matches nothing, as after a markup change, it sends
    the canonical link and a copy of the whole body, made in an inert
    document with its scripts and styles removed; the live page is never
    changed.
  - On a details or profile page: send it, wait about 1 s, fetch the other
    player page and send it. Event picking: rows of
    `table[id^="player-results-"]` give event ids and dates (`dateKey`, the
    last `d-Mon-yyyy` of the row text as a sortable number). Profile events
    not in the details, dated on or after the newest details row,
    deduplicated, newest first, at most 10; none when the details table
    cannot be found. Each event page is fetched about 1 s after the previous
    one, one attempt; `keepPlayerRows` removes every results row whose
    `td.pdga-number` is not the player's (nothing when the page has no such
    cells), then the event is sent.
  - On an event page: send it with all rows, fetch nothing.
  - Stop rules: `cf-mitigated: challenge` or a challenge page → `challenge`;
    a network error, non-2xx or a redirect to another kind of page →
    `partial`. Both stop fetching and list the failed page and every page
    still planned. A challenge page → `challenge` with its URL; other pages →
    `unsupported-page`; exceptions → `error`.
  - `packEnvelope`: while the payload exceeds the fragment limit and a
    fetched event page is last, drop it, list it as failed and pack again.
- `main.ts`: ignores a second tap while running, shows a 4 px progress bar
  (`role="progressbar"`, styled through `style.cssText`, no text), runs
  `collect`, then `location.assign(APP_URL + '#d=' + payload)`. Without
  compression streams it hands off an empty payload, and the app explains
  that the browser cannot read imports.

**Build** (`scripts/bookmarklet.ts`): `buildBookmarklet(appUrl)` bundles
`src/bookmarklet/main.ts` with the pinned Vite's `build()` API into a
minified IIFE. `toBookmarkletUrl` appends `void 0`, since a script that ends
in a string would replace the page, and percent-encodes only `%` and line
breaks: browsers percent-decode the URL before running it and keep
everything else. A plugin in `vite.config.ts` serves it as
`virtual:bookmarklet`, so no built copy is kept in git.

**App side** (`src/app/handoff.ts`): `readPages(pages)` parses each page with
`parseInert` (`src/app/inert.ts`, shared with paste), takes the kind from
`detectPage(doc, url)`, runs the extractors and validates with the
`clean*` functions of `src/handoff/records.ts`. It returns `ImportParts`, the
owner (the PDGA number in a player page URL, so rows never land on another
player when the header cannot be read) and the pages it could not read. An
empty details or profile table is left out, so it never replaces stored
data. Unreadable pages join the failed list, and turn `ok` into `partial`.

**Security**: reading `outerHTML` is allowed (the bookmarklet sends HTML that
way); assigning it stays forbidden. The build test scans the minified code
for cookies, storage, `innerText`, `.click(`, `window.open`, `.value`,
`eval`, `Function(` and `import(`.

**Dev helper**: `npm run handoff` builds v2 envelopes with `pageHtml`.

**Tests**: `tests/bookmarklet/collect.test.ts` (synthetic pages: runs from
both player pages, page parts, hidden ratings, event picking, stop rules,
event, challenge and unsupported pages, the whole-body fallback, the
fragment limit), `tests/bookmarklet/build.test.ts`,
`tests/bookmarklet/fixture.test.ts` (real pages: the official rating is
reproduced through the whole path, the reduced event keeps exactly the
player's ratings, and hand-off sizes are printed), `tests/app/handoff.test.ts`
and `tests/handoff/codec.test.ts` for v2.

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
- New keys in `en.json` and `sv.json`; README: what the bookmarklet sends
  (the HTML of the page parts it needs, at most 12 requests about 1 s apart),
  how to install it, and local testing with `NEXT_RATING_APP_URL`
  (PowerShell and sh syntax).
- Tests in `tests/app/views.test.ts`: setup view renders the code as text,
  copy fallback, update hint shown only for older versions.

## Verification

- `npm run typecheck`, `npm test` (fixture tests run locally), `npm run
  check:i18n`, `npm run build`; the build test prints the bookmarklet size.
- Desktop before merging: set `NEXT_RATING_APP_URL=http://localhost:4173/`,
  `npm run build`, `npm run preview`, copy the bookmarklet from Setup into a
  bookmark, run it on your ratings details page on pdga.com. Expect the
  progress bar, then the app with the prediction and no fragment in the
  address bar; DevTools Network on pdga.com shows one player page request
  and at most 10 event requests about 1 s apart.
- Phone after merging: install from the live Setup page in Safari (iPhone)
  and Chrome (Android), run it on the details page, the profile page, an
  Unofficial Results event page and a non-PDGA page.
- Before each commit, check the staged diff for fixture names and numbers.
