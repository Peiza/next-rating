# Step 3 plan: the web app

Step 3 is split into three commits, each done in one session. Commits 1 (app
shell, theme, translations and settings) and 2 (import and results) are done;
this document holds the approved plan, updated with the decisions made while
building commit 2.

Commit 3 now comes after the GitHub Pages workflow, the bookmarklet and the
Favorites step (see Process in CLAUDE.md). Its plan below is revised for
that: manual rounds are stored per player (`docs/plan-favorites.md`), and the
data age display joins it.

## Already in place (commit 1)

- Vite 8.3.2 build with `base: './'`, no inlined assets, and no modulepreload
  polyfill. A build-only plugin in `vite.config.ts` injects the CSP meta tag;
  `npm run dev` runs without it, and `npm run preview` serves the real one.
- `src/app/dom.ts`: `el(tag, props, ...children)` is the only way the app
  builds DOM. It adds text as text nodes, refuses non-https links and inline
  styles, and `tests/security.test.ts` fails on `innerHTML`, `eval` and the
  like anywhere in `src/`.
- `src/app/styles.css`: hex colour tokens for light and dark, checked by
  `tests/app/contrast.test.ts` (text 7:1, borders and focus ring 3:1). New
  colours, such as round status colours, must be added as tokens and to the
  pairs in that test.
- `src/i18n/`: one JSON catalog per language, `t(key, params)` with English
  fallback and plurals (`key.one` / `key.other`, passed `{ count }`).
  `npm run check:i18n` and `tests/i18n/catalogs.test.ts` keep Swedish complete.
- `src/app/format.ts`: `formatDate`, `formatRating` (no grouping),
  `formatAverage`, `formatChange` (true minus sign), all in the device locale.
- `src/app/storage.ts`: one localStorage key, `next-rating:v1`, holding
  `AppData`. `validateData` reads it back field by field. Commits 2 and 3
  add `lastImport` and `manualRounds` to `AppData` and to `validateData`.
- `src/app/main.ts`: tabs switch in memory (no URL routing; the fragment is
  reserved for the hand-off). `render()` rebuilds the page and puts focus back
  on the element with the same id.
- The Rating tab shows the getting-started view (`src/app/views/start.ts`)
  while there is no data: 1. PDGA number, 2. open ratings details on pdga.com.
- The unofficial notice ends the Settings view and the getting-started view,
  and is in the README. There is no fixed footer, since it would compete with
  the tab bar.

## Commit 2: Import and results

**Hand-off codec (`src/handoff/`)**, shared with the bookmarklet. (Step 5
replaced envelope v1 with v2, which carries page HTML that the app parses;
see `docs/plan-step-5.md`.)
- Envelope schema v1: `{ v: 1, status, page, bookmarklet, player?, details?,
  profileEvents?, events?, failed? }`, where the payload fields are the
  existing `Raw*` records from `src/parsers/types.ts`. `status` is one of
  `ok | partial | challenge | unsupported-page | error`.
- `encodeHandoff` (used by tests now, by the bookmarklet later) and
  `decodeHandoff`: base64url, then `DecompressionStream('deflate-raw')`, then
  JSON, then strict validation through `normalizePlayer`,
  `normalizeRatingsDetails`, `normalizeEvent` and `normalizeProfileEvents`.
- Limits: fragment at most 512 kB; decompressed bytes counted while streaming
  and stopped at 4 MB, against decompression bombs; an unknown `v` is
  rejected. `failed` URLs are kept only if they are
  `https://www.pdga.com/player/<n>`, `.../player/<n>/details` or
  `.../tour/event/<n>`; anything else is dropped.
- `tests/handoff/codec.test.ts`: round-trip, oversized fragment,
  decompression bomb, bad base64, bad JSON, wrong version, foreign URLs.

**Import flow (`src/app/import.ts`)**:
- On start, if `location.hash` starts with `#d=`, decode it and call
  `history.replaceState` straight away, whether decoding succeeded or not.
- An import never erases data it does not contain. For the same player (or
  an import without a player, such as an event page or a paste), it replaces
  only the fields it brings, so a partial import keeps the stored ratings
  details and profile events. An import for a different player replaces
  everything. An event-page import adds that event, replacing an earlier copy
  of the same event (by id, or by name and date without one). Events that the
  ratings details now include are dropped. Rows are picked by the imported
  player's number, or by the default PDGA number; with neither, the event is
  stored and the Rating tab asks for a number. If the imported player is not
  the default player, offer "Make this my default player".
- Store the validated raw records plus a timestamp as `lastImport`, and
  re-normalize them when reading back.
- A translated status banner from the status code. For `partial` and
  `challenge`, list the failed pages as links with "Open this page and run the
  bookmarklet there".

**Paste import (new Import tab)**:
- A large paste target. The paste handler reads `text/html` first and parses
  it with `DOMParser` (an inert document: no scripts, no loading), trying
  `parseRatingsDetails`, then `parseEvent`, then the TSV extractors on
  `text/plain`.
- A pasted ratings details table without a player header asks whose rounds
  they are, with a PDGA number field prefilled with the default player. The
  same player as the stored import merges; a different player replaces.
  (Added after commit 2, with the GitHub Pages workflow.)
- Pasted event results have no date, so ask for one (default today) and an
  optional event name, so two pasted events on the same date stay apart. The
  date is stored in the event record in pdga.com format.
- Add step 3, "Paste the table", to the getting-started view, linking to the
  Import tab.

**Display labels (`src/parsers/rounds.ts`)**: `RoundInput` has no event name
or round label. Add `ListedRound = RoundInput & { eventName; roundLabel }`,
returned by `detailsToRounds` and `eventToRounds` and kept by `mergeRounds`.
The engine ignores the extra fields. Update the parser tests.

**Results (Rating tab, `src/app/views/rating.ts`)**, shown once there is data:
- The predicted rating in large type, the change vs the current official
  rating (hidden when unknown), the official rating and its date, and "Last
  import: <date and time>".
- Round list, newest first: date, event and round, holes (when not 18),
  rating, source (official, unofficial or manual) and status (Counted, Counts
  twice ×2, Dropped, Outside window, DNF), each with a text label and a
  symbol, never colour alone.
- Stats panel in a `<details>` element with the `RatingStats` fields (the
  legacy sheet's panel).
- `src/app/model.ts` (pure): stored import plus manual rounds, to
  `ListedRound[]`, to `predictRating`. Unit tested with synthetic data.

**Dev helper**: `npm run handoff -- <html files...>` runs the extract
functions over saved pages (such as the local fixtures), encodes an envelope
and prints `http://localhost:5173/#d=...`, so the import can be tried before
the bookmarklet exists. It reads only the files given on the command line and
contains no fixture data. Node cannot run `src/` directly (extensionless
imports), so the npm script first bundles `scripts/make-handoff.ts` with the
pinned Vite (`vite build --ssr`) into a git-ignored folder, then runs it with
node, using the pinned jsdom for `DOMParser`. Never through npx.

**Fixture test** (skipped when the fixtures are absent): encode an envelope
from the fixtures, decode it, run the model, and compare the prediction with
the rating parsed from the player page, derived rather than hard-coded.

## Commit 3: Manual entry and offline PWA

**Quick manual entry** (top of the Rating tab, usable one-handed):
- The rating field comes first, with `inputmode="numeric"`. The date is an
  `<input type="date">` defaulting to today in local time. Event name and
  holes sit under "More". A large Add button at the bottom, near the thumb.
- Validate with the parser ranges (`RANGES` in `src/parsers/values.ts`).
  Manual rounds with the same event name and date share an event key, so the
  mid-event double-weight rule applies; without a name, each round is its own
  event.
- Manual rounds are listed with a delete button and a "Clear all manual
  rounds" action, confirmed with an inline confirm row (not
  `window.confirm`). The prediction updates immediately.
- Stored as `manualRounds` on each `StoredPlayer` (see
  `docs/plan-favorites.md`), validated on read. Stored players without the
  field load with an empty list, so no migration is needed.

**Data age** (see CLAUDE.md, Web app): "Updated X days ago" next to the
predicted rating with `formatAge` (`Intl.RelativeTimeFormat`, added with
the favorites panel), and a refresh notice with a
button to the player's pdga.com ratings details page when the data is more
than 7 days old.

**PWA**:
- `public/manifest.webmanifest`: `start_url: "./"`, `scope: "./"`,
  `display: standalone`, theme colours, icons (192, 512, maskable 512) and an
  `apple-touch-icon`. This also fixes the `favicon.ico` 404 seen in preview.
- Icons: `scripts/make-icons.ts`, a dependency-free generator (a simple
  geometric mark, PNGs written with `node:zlib`, run with node directly since
  it imports nothing from `src/`). The PNGs are committed so CI does not need
  to regenerate them.
- Service worker: a `src/sw.js` template. A Vite plugin fills in the list of
  built files and a build hash in `generateBundle` and emits `dist/sw.js`.
  Precache everything, serve cache-first, delete old caches on activate, and
  answer navigation requests with the cached `index.html`. Navigation
  requests carry no fragment, so a hand-off still works offline. Register it
  only in production builds.
- A small "New version available, reload" notice when an update is waiting.

**Tests**: manual-round validation and event keys (model level); the service
worker plugin's precache list (built files, no source maps).

## Verification (each commit)

- `npm run typecheck`, `npm test` (fixture tests run locally and skip in CI),
  `npm run check:i18n`, `npm run build`.
- `npm run preview`, then in DevTools: no CSP violations in the console;
  phone-sized view in light and dark; Lighthouse accessibility audit, plus the
  PWA audit and Application > Service Workers > Offline with a reload in
  commit 3.
- Commit 2: `npm run handoff -- tests/fixtures/details-188063.html
  tests/fixtures/player-188063.html`, then open the printed URL. The
  prediction appears, the fragment is gone from the address bar, and a reload
  keeps the data.
- Before each commit, check the staged diff for fixture names and numbers
  (values from `tests/fixtures/expected.json`).
- Stop preview and dev servers by stopping the background task, never with
  npx tools.
