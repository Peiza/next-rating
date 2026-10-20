# Next Rating

Predicts your next PDGA rating update from your rated rounds, including new
rounds with unofficial round ratings and ratings you add yourself.

**Unofficial tool. Not affiliated with or endorsed by the PDGA (Professional
Disc Golf Association).**

App: https://peiza.github.io/next-rating/

## How it works

- Your rounds are read from pdga.com in your own browser, or pasted by you.
  The app has no server: nothing you enter or import leaves your browser.
- The prediction follows the rating rules in the
  [PDGA ratings guide](https://www.pdga.com/ratings/guide): a 12-month window
  (24 months with fewer than 8 rounds), low outliers dropped (each round is
  compared with your other rounds in the window), the most recent 25% of
  rounds counted twice, and rounds shorter than 18 holes weighted by hole
  count.
- "Why it changed" lists what moved the prediction away from the official
  rating: new rounds, rounds that left the window, started or stopped
  counting twice, or were dropped or brought back. Each one shows how many
  points it adds or takes away, and together they add up to the change.
  The starting point is the set of rounds PDGA itself counted; if that still
  does not give the official rating, the gap shows as its own line,
  "Difference from PDGA's last calculation".
- The app works in English and Swedish, follows the device language (with a
  manual override in Settings), and follows the device's light or dark mode.

## Players and favorites

The app keeps the data of several players, each separately, so you can
follow friends as well as yourself:

- Save players as favorites from the Players menu (a sidebar on wide
  screens). Each favorite shows when it was last imported and links to its
  ratings details on pdga.com, where the bookmarklet refreshes it.
- One favorite is you. The app always opens on you.
- Running the bookmarklet on another player's page shows that player without
  touching anyone else's data. A player who is not a favorite is kept until
  the next such import, with an "Add to favorites" button.
- Event results go to every stored player who played the event.
- Data saved by earlier versions of the app is moved over the first time a
  new version opens.

## The bookmarklet

The bookmarklet is a bookmark that brings your rounds from pdga.com into the
app in one tap. Install it from the app: on the getting-started page, or in
Settings, choose "Install bookmarklet" and follow the steps for your browser
(Safari on iPhone, Chrome on Android, or a desktop browser).

Run it on your ratings details page or player page on pdga.com. It:

- reads the page you run it on, then fetches the other player page and the
  pages of recent events that are not in your ratings details yet: at most
  12 requests, one at a time, about a second apart, in your own browser
  session;
- sends the app only the HTML of the tables it needs (from event pages, only
  your own rows) in the address fragment, which is never sent to any server;
- never reads cookies, stored data or form fields, and never loads code from
  anywhere.

The app parses that HTML, so when pdga.com changes its pages, an update of
the app fixes the import without installing the bookmarklet again. If
pdga.com asks for a browser check, the bookmarklet stops and the app lists
the pages to open and run it on.

## Development

Requires Node.js 24 (see `.nvmrc`).

```sh
npm ci                # install the pinned dependencies
npm test              # unit tests
npm run typecheck     # TypeScript checks for src, tests and scripts
npm run check:i18n    # lists keys missing from the translation catalogs
npm run build         # production build in dist/
```

Translations live in `src/i18n/locales/`, one JSON file per language. To add a
language, add a file named by its language code (for example `de.json`) with
the same keys as `en.json`. Missing keys show in English.

### Preview on your computer

- `npm run dev` serves the app at http://localhost:5173/ and reloads on every
  change. It runs without the Content Security Policy, since the dev server
  injects inline styles.
- `npm run build` then `npm run preview` serves the production build at
  http://localhost:4173/, with the real Content Security Policy.

**Phone-sized view:** in Chrome or Edge, press F12 and then Ctrl+Shift+M
(Cmd+Shift+M on a Mac) to open the device toolbar, and pick a phone such as
"iPhone 14 Pro" or "Pixel 7". In Firefox, press Ctrl+Shift+M directly.

**Dark mode:** in Chrome or Edge DevTools, open the ⋮ menu, then More tools >
Rendering, and set "Emulate CSS media feature prefers-color-scheme" to dark.
The same panel can emulate `prefers-contrast: more` and `forced-colors`.
Switching the operating system to dark mode works too.

**On your phone:** run `npm run dev -- --host` and open the printed network
address (such as http://192.168.1.20:5173/) on a phone on the same Wi-Fi.
Allow Node.js through the firewall if asked.

### Trying the bookmarklet locally

The bookmarklet hands off to the app address in `APP_URL` in
`vite.config.ts`. It is built into every installed bookmarklet, so it never
changes. To try a local build, override it for that build only:

```sh
NEXT_RATING_APP_URL=http://localhost:4173/ npm run build   # sh
$env:NEXT_RATING_APP_URL='http://localhost:4173/'; npm run build   # PowerShell
npm run preview
```

Then install the bookmarklet from the local Setup page into a separate
bookmark and run it on pdga.com. In PowerShell, remove the variable
afterwards (`Remove-Item Env:NEXT_RATING_APP_URL`). Only https addresses, or
http on localhost or a LAN address, are accepted.

`npm run handoff -- <saved pdga.com pages...>` builds a hand-off link from
pages saved in a browser instead, without visiting pdga.com.

### Test fixtures

Tests that use pages saved from pdga.com read them from `tests/fixtures/`.
That folder is local only and never committed, since the pages contain
personal data, so those tests are skipped when it is missing (as in CI).

## Deployment

`.github/workflows/pages.yml` runs the type checks, tests, translation check
and build on every pull request and every push to `main`. Pushes to `main`
are then deployed to GitHub Pages; pull requests are never deployed.

One-time setup in the GitHub web UI: **Settings > Pages > Build and
deployment > Source: GitHub Actions.** The `github-pages` environment that
this creates only accepts deployments from `main`.

Settings > About in the app shows the short commit id of the build that is
live ("dev" in a local build). GitHub Pages lets browsers cache pages for up
to 10 minutes, so a new version can take a few minutes to show up on a phone.

The workflow's actions are pinned to full commit SHAs. When updating one,
pick a release that is at least 14 days old and pin its commit SHA, with the
version in a comment.
