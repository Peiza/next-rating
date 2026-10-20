# Next Rating

Predicts your next PDGA rating update from your rated rounds, including new
rounds with unofficial round ratings and ratings you add yourself.

**Unofficial tool. Not affiliated with or endorsed by the PDGA (Professional
Disc Golf Association).**

App: https://peiza.github.io/next-rating/

## How it works

- Your rounds are read from pdga.com in your own browser, by a bookmarklet.
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
  points it adds or takes away, and a net total at the top says what they
  add up to and what that rounds to, so lines that cancel out do not look
  like a big change. The starting point is the set of rounds PDGA itself
  counted; if that still does not give the official rating, the gap shows as
  its own line, "Difference from PDGA's last calculation".
- "How it works", opened from Settings or from the link in each card's
  explanation, explains all this in the app, including which rules are not
  yet checked against a real player.
- The app works in English and Swedish, follows the device language (with a
  manual override in Settings), and follows the device's light or dark mode.

## The Rating tab

Under the player's name come the predicted rating, the change against the
official rating (with the value the app calculates for it, such as "978
(calculated 977.65)", when it reproduces it), the next ratings update and
how old the data is. "How to
refresh" next to the data age explains the round trip to pdga.com, with the
Refresh button under it. When the data is more than 7 days old, it opens by
itself as a warning.

Below that, each part is a card that opens and closes: Why it changed, Add a
round, Reach a target rating, Top 8, Details and Rounds. Each starts with a
one-line explanation that links to its part of "How it works". Rounds is open at first; the app remembers which
cards you open, also when you start it from the home screen. While closed,
Why it changed shows its largest effect in its header, such as "907 no
longer counts twice, +0.7".

## Adding rounds yourself

"Add a round" on the Rating tab takes a round rating, a date (today by
default) and, optionally, an event name and hole count. The prediction
updates straight away. Rounds with the same event name and date count as one
event. The date can be up to a year ahead, so a round you expect to play at
an upcoming event gets that event's date: if it falls after the report
deadline of the next update, it is marked as counting in the following one.
Manual rounds are kept per player, listed under the form with a delete
button each, and never sent anywhere. A deleted round can be brought back
with Undo.

## Reaching a target rating

"Reach a target rating" takes a target, such as 1000, and a number of
upcoming rounds (3 by default). It shows the average round rating those
rounds need for the next update to reach the target. The app works this out
with the same rules as the prediction: it adds that many 18-hole rounds dated
today and finds the lowest whole rating that gets there, with the window,
dropped outliers and double weighting all applied. It also says when the
target is already reached (and what keeps it there), or when even rounds
rated 1150 would not reach it. On the Monday and Tuesday of update week,
rounds played that day count only in the following update, and the answer
is for that update.

## Top 8

The Top 8 card on the Rating tab is laid out like a Global Masters Series
player card, for any player: the sum, average and highest of the player's 8
highest rated rounds, then those rounds. Official and unofficial rounds
count; manual rounds and DNF rounds do not. The period is picked from one
list: any calendar year the player has rated rounds in (the current year by
default), the same window the prediction uses, or a custom range of dates.
The app remembers the choice.

## Offline and the home screen

After the first visit, the app works without a connection: a service worker
keeps a copy of the app in the browser. Only refreshing data needs pdga.com.
When a new version has been deployed, the app offers "Reload" to switch to
it.

Adding the app to the home screen is optional. The icon opens the app in a
normal browser tab, so the bookmarklet round trip (app, pdga.com, back to the
app in the same tab) works the same way and the data is shared with the
browser.

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
Settings, choose "Install bookmarklet". The setup page picks your kind of
browser (Safari on iPhone, Chrome on Android, or a desktop browser; you can
switch) and shows numbered steps, from copying the code to trying it on your
ratings details. Settings and the setup page also say whether the
bookmarklet you last ran in this browser is up to date.

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
npm run build         # production build in dist/, with the service worker
npm run icons         # redraws the app icons in public/icons/ (committed)
```

Translations live in `src/i18n/locales/`, one JSON file per language. To add a
language, add a file named by its language code (for example `de.json`) with
the same keys as `en.json`. Missing keys show in English.

### Preview on your computer

- `npm run dev` serves the app at http://localhost:5173/ and reloads on every
  change. It runs without the Content Security Policy, since the dev server
  injects inline styles.
- `npm run build` then `npm run preview` serves the production build at
  http://localhost:4173/, with the real Content Security Policy and the
  service worker. After a new build, the preview keeps showing the cached
  version until you tap Reload in the app's notice, or tick "Update on
  reload" under DevTools > Application > Service workers.

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
live ("dev" in a local build). The app finds a new version the next time it
loads (browsers check `sw.js` past their HTTP cache), installs it in the
background and shows "A new version of the app is available" with a Reload
button.

The workflow's actions are pinned to full commit SHAs. When updating one,
pick a release that is at least 14 days old and pin its commit SHA, with the
version in a comment.
