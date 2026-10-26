# Plan: official rating and membership from the PDGA REST API

**Status: Parked: waiting for PDGA API access and for the owner to email
dev@pdga.com. Nothing is built, and no API feature goes live before PDGA
answers.**

The email draft is docs/pdga-api-email.md. The background is
docs/pdga-map-handoff.md.

## Sources (read 2026-10-26)
- pdga.com/dev (the developer program: terms, attribution, when to contact
  dev@pdga.com), /dev/api/rest/v1/auth and /dev/api/rest/v1/services.
- pdga.com/branding, its "Style Guide Cheat Sheet V2" (updated 2024-02-05)
  and the logo family download, which also holds "PDGA Brand Guide V1"
  (2024-01-19). The files are not in the repo (see PDGA branding below).
- The license agreement itself needs a login. Its terms in this plan and in
  docs/pdga-map-handoff.md are the owner's paraphrase and are not checked
  against the text; the section numbers come from the owner's copy.
- Not documented anywhere public: rate limits, caching rules and CORS.

## Context

The owner signed the PDGA API License Agreement in October 2026, which
reopens a path CLAUDE.md calls closed (registration and the license are
open to current members; the "closed" lines get their dated note in
Step 0). `api.pdga.com` gives a player's current
`rating`, `rating_effective_date`, membership status and expiry,
classification and name. It gives **no rounds and no ratings history**, so the
bookmarklet stays the only source for everything the engine needs.

What this adds for the user:
- After a monthly update, the app knows the new official rating and date
  without a bookmarklet run, and says that the stored rounds are from before it.
- Membership status and expiry next to the rating (PDGA gives no rating to
  members who are not current).
- Step 1 of setup confirms a typed PDGA number with the player's name and
  rating before the first import.

The API needs a login with the owner's personal account, so a small Cloudflare
Worker holds the credentials as secrets, logs in, exposes one narrow route and
caches for hours.

Calling `api.pdga.com` straight from the user's browser does not work,
whatever CORS headers PDGA might send:
- A browser may not set the `Cookie` header itself. The session would have to
  travel as a third-party cookie (`credentials: 'include'`), which Safari
  blocks by default, and api.pdga.com would have to answer with
  `Access-Control-Allow-Credentials` and the app's origin. Nothing suggests
  it does.
- Every user would need their own pdga.com account linked to a membership,
  their own signed license, and would type their pdga.com password into Next
  Rating. That is the wrong thing to ask for and breaks "no secrets".
So the Worker is the only workable shape, and whether PDGA accepts it
(license section 6.c, "on behalf of others") decides the whole plan. Building this would change three hard constraints in
CLAUDE.md (no backend, no secrets, `default-src 'self'`), narrowly: the Worker
talks to `api.pdga.com` only, never to `www.pdga.com` pages, which stays
forbidden. **Until PDGA answers and the owner approves the new wording, the
hard constraints stay as they are.**

## Step 0, before code: CLAUDE.md and the email to PDGA

- CLAUDE.md, Hard constraints, rewritten (owner approves the wording):
  - Server-side fetching of `www.pdga.com` pages stays forbidden in every form.
  - One exception: the Next Rating Worker calls the official API at
    `api.pdga.com` with the owner's account, under the signed license.
  - "No backend, no secrets" becomes "no backend except that Worker; its
    PDGA credentials are Cloudflare secrets only, never in the app, the repo or
    GitHub".
  - CSP: `connect-src 'self' <Worker origin>`.
  - The "API developer program is closed" lines in Background and in
    docs/finished-steps.md get a dated note.
- The owner sends docs/pdga-api-email.md to dev@pdga.com. It covers:
  - the use: one player at a time, looked up by the person using the app
  - the Statement of Work and the NDA that the signed agreement refers to:
    whether either is needed for this app
  - whether a Worker that calls the API with the owner's account for the
    app's users is allowed (section 6.c, "on behalf of others"), and that a
    browser cannot send the session cookie itself
  - the Ko-fi tip link, disclosed openly, since the API is for
    non-commercial use and commercial use is a reason to contact dev@pdga.com
  - the cache times and the call volume
  - whether the attribution may be translated into Swedish
  - "PDGA Authorized Developer" and the logo (see PDGA branding below)
  - the review before public launch, with screenshots
  - whether CORS is meant to be supported (the answer confirms the Worker)
- **The API part only goes live after PDGA answers**: the Worker URL is a
  build-time setting, and while it is empty, every API feature is off.

## What the bookmarklet still must do

Nothing changes in the bookmarklet (no version bump, size unchanged). It still
collects:
- the ratings details: the official rounds with their Evaluated and Included
  flags
- event pages: unofficial rounds
- the profile: the season's events and tiers, and the previous season in
  January
- the ratings history: the chart's steps

The API cannot replace any of it. The player header that the bookmarklet
imports stays the engine's `currentRating` and `ratingDate`.

## Architecture

```
app (GitHub Pages) ──GET /v1/player/:n──► Worker (login, edge cache 6 h) ──► api.pdga.com
```

### Worker (`worker/`, own tsconfig, tests in `tests/worker/`)
- **Secrets**: `PDGA_USERNAME` and `PDGA_PASSWORD`, set by the owner with
  `wrangler secret put` (wrangler pinned as a devDependency, run only through
  npm scripts). They are never in GitHub.
- **Session**:
  - Logs in on demand with `POST /services/json/user/login`
    (`Content-Type: application/json`, body `{username, password}`) and keeps
    `session_name`/`sessid` in isolate memory. GET calls send only
    `Cookie: <session_name>=<sessid>`, so the CSRF `token` from the login is
    not kept.
  - Never calls `/user/logout`, and does not use `/system/connect`: a new
    login on 401/403 is enough to find a dead session.
  - On 401/403 it logs in again, once, and retries once.
  - Logins are never looped or rate-free: after a failed login it waits
    10 minutes before the next one.
- **Route** `GET /v1/player/:pdgaNumber`:
  - The number is validated like `RANGES.id` (src/parsers/values.ts); anything
    else gets a 400.
  - One upstream call: `/services/json/players?pdga_number=N&limit=1`.
  - The upstream answer is `{ sessid, status, players: [...] }`. "Not found"
    is an empty `players` list, not a 404. Every value is a string
    (`"rating": "1000"`), so each field is parsed and validated, and
    `rating`/`rating_effective_date` may be missing or empty (PDGA gives no
    rating to members who are not current).
  - Membership: only `current` is documented. `current` maps to current, a
    `membership_expiration_date` in the past to expired, and anything else
    to none, instead of assuming exact strings.
  - Ignored: `official_status`/`official_expiration_date` (a certified
    official, not the rating), `last_modified`, the city and region.
  - Answers a trimmed object only: `{ pdgaNumber, name, rating | null,
    ratingDate | null, membership: 'current' | 'expired' | 'none',
    membershipExpires | null, classification, fetchedAt }`.
  - Upstream text is never forwarded.
- **Cache**:
  - `caches.default`, keyed by the normalized route.
  - Found players: 6 h. Not found: 1 h.
  - Upstream errors are not cached.
  - Responses carry `Cache-Control: max-age=3600`.
- **Errors**, as a JSON `{ error: code }` with no PDGA text: `not-found`,
  `unavailable` (upstream 5xx, timeout after 8 s, login failure), `bad-request`
  and `rate-limited`.
- **CORS**:
  - `Access-Control-Allow-Origin` only for the app origin, from a Worker var.
  - localhost only in a dev var.
  - GET and OPTIONS only, no credentials.
- **Abuse**: a Cloudflare rate-limit rule per IP (owner sets it in the
  dashboard, documented in the README). No PDGA data in logs (`observability`
  off or errors only).
- No other routes (no name search, no lists) in this step.

### App
- `src/app/api.ts`:
  - `lookupPlayer(n)` with `fetch` to `__API_URL__`, a 10 s timeout, a 4 KB
    size limit and a strict schema check (same style as `validateManualRound`
    in src/app/storage.ts).
  - Returns `{ ok, data } | { ok: false, code }`.
  - Makes no request when `__API_URL__` is empty, the Settings switch is off or
    `navigator.onLine` is false.
- **Build setting**: `NEXT_RATING_API_URL` in vite.config.ts next to `APP_URL`,
  https-checked like `checkAppUrl`. The CSP gets `connect-src 'self' <origin>`
  only when it is set.
- **Temporary cache (license: no permanent storage)**:
  - Its own key `next-rating:api-cache`, never part of `AppData`, never
    validated into it, never in any future transfer link.
  - Entries `{ fetchedAt, data }` per PDGA number, max age 12 h.
  - Expired entries are deleted on every read and on app start.
  - Removing a favorite deletes its entry.
  - With the Settings switch off, everything is deleted at once.
- **Request volume**:
  - One lookup when a player is shown and the cache has no fresh entry.
  - No polling, no background or scheduled fetching, no lookups for the whole
    players list in this step.
- **Service worker**: unchanged. It only handles requests in the app's scope,
  so Worker answers are never precached (a test covers it).
- **Engine and model unchanged**:
  - The API rating is never fed into `predictRating`/`explainChange` and
    never added to the chart's history (no self-built history).
  - The model gets `api: ApiState | null` and `newerOfficial` (the API date is
    later than the imported `ratingDate`).

### UI
- **Rating tab, official line** (src/app/views/rating.ts `officialLine`):
  - Unchanged from the import.
  - When `newerOfficial`, a notice above the result: "PDGA published a new
    rating on {date}: {rating}. The prediction still uses the rounds from
    before it. Get data again to update it." It links to the setup steps.
- **Membership row** in the Stats card:
  - "Membership: current until {date}" or "Membership not current: PDGA shows
    no rating".
  - Shown only from API data.
- **Start view and setup step 1**:
  - After a number is saved, "{name}, rating {rating} ({date})" confirms the
    number.
  - The name links to `https://www.pdga.com/player/{n}`.
- **Attribution**: already built for the bookmarklet data
  (`pdgaNotice` in src/app/views/pdga.ts, docs/finished-steps.md "PDGA
  attribution and the player link"), at the bottom of every view, in the
  wording the dev page gives:
  - "Player, event, and course data provided by PDGA." linking to
    https://www.pdga.com, then the translated unofficial line.
  - The player's name links to its pdga.com page; this step links every
    player name that comes from the API too (the setup step 1 confirmation).
  - No logo and no "PDGA Authorized Developer" in this step (see PDGA
    branding below).
- **Settings**: a switch "Look up the official rating online" (default on when
  `__API_URL__` is set), with a hint that only the PDGA number is sent to the
  app's own server, which asks PDGA.
- **How it works**: a short paragraph about what the lookup does and does not
  give (no rounds), and the attribution.
- **Error and offline behavior** (always quiet, the bookmarklet data stays the
  main view):
  - Offline, with a fresh cache entry: shown with "Checked {time}".
  - Offline, without one: nothing shown, no error.
  - `unavailable` or a timeout: one muted line "Could not check the official
    rating right now". No retry loop: the next try comes when the player is
    shown again.
  - `not-found`: "PDGA has no player with number {n}" in the setup step 1
    confirmation only.
  - `rating: null` with membership not current: the membership row explains
    it.
  - `rate-limited`: the same as unavailable.

### i18n (en.json, sv.json; `npm run check:i18n`)
- The keys are under `api.*`:
  - `confirm` (the attribution keeps its existing `app.attribution` and
    `app.attributionLink`)
  - `newerOfficial`
  - `membership.current`, `membership.expired`, `membership.none`
  - `checkedAt`
  - `error.unavailable`, `error.notFound`
  - `settings.switch`, `settings.hint`
  - `guide.*`
- Dates go through the existing `formatDate`. Ratings get no thousands
  separator.
- Swedish: everything is translated. `app.attribution` already stays the
  exact English sentence in sv.json until PDGA approves a translation (see Q4).

## PDGA branding and "PDGA Authorized Developer"

What PDGA allows, from the dev page:
- The app **may** show "PDGA Authorized Developer" on one or more screens.
- It **may** use PDGA branding elements to meet the attribution
  requirements. The branding page says to follow the style guide cheat sheet
  for any logo use. Exceptions to the attribution rules need the Developer
  Program's approval; logo questions go to branding@pdga.com.

The style guide rules that would apply to a logo in the app:
- **Which file**: the digital (RGB) files, never the CMYK print files. On a
  phone the logo is always smaller than 2.5 in (6.35 cm), so it is the
  Standard wordmark ("No Title"), not the Title wordmark. The zip has SVG
  and PNG of each in Blue, Green, Black and Reverse (white).
- **Contrast**: the Blue (or Black) version on the light theme, the Reverse
  version on the dark theme. Never on a similar color or over a photo.
- **Clearspace**: at least one capital "X" in Montserrat Bold around the
  logo, about half the wordmark's height. Next to another mark (the app's
  own icon) the Standard wordmark keeps 1.5 X between them.
- **Violations**: no stretching or distortion; no "Professional Disc Golf
  Association" text above it; no separating its elements or changing its
  colors (color changes need branding@pdga.com's approval); no combining it
  with other elements such as baskets or discs; no colored glows or dark
  shadows.
- **Palette and typefaces** (PDGA Blue #003462, Medium Blue #00628F,
  Highlight Blue #007DA4, PDGA Green #009E91, Chartreuse #D0DD28; Montserrat
  and Source Sans) are for PDGA's own material. The app keeps its own blue
  and system fonts, so it does not look like an official PDGA app, and the
  CSP forbids web fonts from elsewhere anyway.

Redistributing the files: none of the dev page, the branding page, the
cheat sheet or the brand guide grants a license to redistribute the logo
files or says they may sit in a public repository. They only allow use
"within your application". So the logo files are **not committed** to the
public repo for now.

The plan for Next Rating:
- **Now**: nothing changes in the app. No logo and no "PDGA Authorized
  Developer". The text attribution and the unofficial line already meet the
  attribution requirement.
- **Why not yet**: the label is about API use, and the app's data still
  comes from the bookmarklet only. Showing "PDGA Authorized Developer" before
  the API is live, or next to "not affiliated with or endorsed by PDGA",
  would mislead. The email asks PDGA how they want the two to sit together.
- **Later, only if PDGA's answer allows it** and the API part is live: the
  line "PDGA Authorized Developer" in How it works and Settings > About, as
  text. If a logo is wanted, one Standard wordmark SVG in Blue and one in
  Reverse, at most 24 px high, beside the attribution with its clearspace,
  linked to pdga.com, committed only after dev@pdga.com or branding@pdga.com
  confirms the files may be in a public repository (with a note in the
  README that they are PDGA's marks and not covered by the repo's terms).

## Tests (invented data only: names like "Test Player", numbers like 1 and 99999; no real PDGA data in the repo)
- **Worker** (vitest, handler with injected `fetch`, cache and env):
  - login, then a lookup
  - session reuse
  - a new login once on 401/403
  - the login backoff
  - trimming and field mapping from an API-shaped fixture written by hand
  - the `rating` null case
  - the 400 on bad numbers
  - CORS for the allowed and other origins, and OPTIONS
  - cache hit and miss and the TTLs
  - error mapping that never leaks upstream text
  - credentials never in a response or a log call
- **App**:
  - api.ts: schema rejects, size limit, timeout, offline (no fetch), switch
    off (no fetch), empty URL (no fetch)
  - The cache: 12 h expiry, purge on start, delete on favorite removal and on
    switch off, never in `next-rating:v2`
  - The model: `newerOfficial` conditions, the engine gets the same inputs as
    before
  - Views: the attribution and the name link present whenever API data
    shows, absent otherwise; the error lines
- **Build**: the CSP with and without `NEXT_RATING_API_URL`; `checkAppUrl`-like
  rejects for the API URL.
- Existing tests unchanged: the bookmarklet size test and the fixture tests.

## Delivery

Two pull requests, each from a fresh branch made from main as CLAUDE.md's
Process describes. One command per shell call; Claude merges each pull
request when CI is green, as CLAUDE.md's Process says.
1. `pdga-api-worker`:
   - Step 0 docs
   - `worker/` with its tests
   - `npm run worker:test`, folded into `npm test`
   - `npm run worker:deploy`, which the owner runs
   - the README section on Cloudflare setup, secrets and the rate-limit rule
   CI only tests the Worker; it does not deploy it.
2. `pdga-api-app`:
   - api.ts, the cache, the CSP and the setting
   - the UI and i18n
   - How it works and docs/finished-steps.md
   - CI builds with an empty `NEXT_RATING_API_URL` until PDGA has answered.
     The owner then sets it as a repository variable, so turning it on is a
     setting, not a code change.

## Verification
- `npm run typecheck`, `npm test`, `npm run check:i18n`, `npm run build`, each
  as its own command. No preview servers or handoff runs.
- Before each commit, check the staged diff for real names, numbers, ratings
  and any credential.

## Phone checklist (after the merge and the Worker deploy, iPhone Safari and Android Chrome)
1. Settings shows the switch and its hint, in English and Swedish.
2. Setup step 1: a number shows the name, rating and date, and the name opens
   pdga.com.
3. A bad number shows "no player". Airplane mode shows nothing and no error.
4. Rating tab: the membership row; the attribution at the bottom, the link
   opening pdga.com.
5. After a monthly update without a new import: the newer-rating notice. After
   getting data again, it is gone.
6. Airplane mode within 12 h: the cached line with "Checked {time}". After
   12 h: gone.
7. The switch off: no lookup, the attribution gone, the cache cleared (reopen
   the app offline to confirm).
8. The bookmarklet flow works exactly as before on both phones.
9. The large text size: the confirmation, the notice and the attribution wrap
   cleanly.

## Open questions (recommendation first)
1. **Wait for PDGA before going live?** (a) Build both PRs now, live only after
   PDGA's answer through the build variable. (b) Send the email first, build
   after the answer. (c) Go live now. → **a**. The owner chose to park the
   plan until PDGA answers, which is (b) for now.
2. **Where the API rating is used.** (a) Shown alongside, plus the
   newer-rating notice; the engine keeps the imported rating. (b) Feed it into
   the engine as `currentRating` when newer. → **a**: the stored rounds and
   flags belong to the imported update, so mixing them breaks Why it changed.
3. **The temporary cache in the browser.** (a) A separate localStorage key, a
   12 h maximum, purged on read. (b) Memory only, nothing offline.
   (c) sessionStorage. → **a**, named in the email so PDGA can object.
4. **The attribution in Swedish.** (a) The exact English sentence in both
   languages until PDGA approves a translation. (b) Translate it now. → **a**
5. **The players list.** (a) Not in this step; the shown player only. (b) Each
   favorite's API rating in the list (up to 30 lookups). → **a**, later if
   PDGA is fine with the volume.
6. **The Worker session store.** (a) Isolate memory with one re-login on
   401/403 and a login backoff. (b) Workers KV for the session. → **a**:
   logins happen only on edge cache misses; move to KV if logins turn out
   frequent.
7. **The cache times.** (a) Edge 6 h for found players, 1 h for not found; the
   browser 12 h. (b) Shorter around the monthly update day. → **a**
8. **Worker deploys.** (a) The owner runs `npm run worker:deploy`; CI only
   tests. (b) A CI job with a Cloudflare token in GitHub secrets. → **a**:
   fewer secrets in GitHub; revisit if deploys get frequent.
9. **The Settings switch default.** (a) On, with the hint about what is sent.
   (b) Off until the user turns it on. → **a**
10. **One Worker shared with the future map app?** (a) A separate Worker for
    Next Rating, with only its own route. (b) One shared Worker. → **a**:
    narrow scope, independent review and revocation.
11. **A name search through the API in setup step 1** (it replaces the
    pdga.com search link). (a) Not now, in ideas.md. (b) In this step. → **a**
12. **"PDGA Authorized Developer"**. (a) Not shown until the API part is
    live and PDGA has answered, then as text in How it works and Settings >
    About. (b) Never. (c) Now, on every view. → **a**: it describes API use,
    which the app does not have yet.
13. **The PDGA logo**. (a) No logo; the text attribution is enough. (b) The
    Standard wordmark beside the attribution, after PDGA confirms the files
    may be in the public repo. → **a**, revisit with PDGA's answer.
14. **The Ko-fi link** if PDGA counts tips as commercial use. (a) Ask first
    (the email does) and follow the answer. (b) Remove it before sending.
    → **a**: it is disclosed, so PDGA can decide.
