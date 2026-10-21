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
- Some unofficial events may miss the next update, and you can leave out any
  of them with one tap: an event whose report reaches PDGA after the
  deadline, a league (tier L) that counts only when the whole league is
  finished and reported, and an X-tier event with non-standard rules, such
  as mulligans, whose ratings PDGA leaves out of player ratings
  (Competition Manual 5.10; other X-tier events count normally). Rounds of
  leagues and X-tier events are marked. An official round PDGA did not
  evaluate although it is inside the window PDGA used never counts.
- "Why it changed" lists what moved the prediction away from the official
  rating: new rounds, rounds that left the window, started or stopped
  counting twice, or were dropped or brought back. Each one shows how many
  points it adds or takes away, and a net total at the top says what they
  add up to and what that rounds to, so lines that cancel out do not look
  like a big change. The starting point is the set of rounds PDGA itself
  counted; if that still does not give the official rating, the gap shows as
  its own line, "Difference from PDGA's last calculation".
- A rating only changes when new rated rounds are added. When no unofficial
  or manual round counts in the next update, the prediction is the official
  rating, and Why it changed says the rating stays.
- "How it works", opened from Settings or from the link in each card's
  explanation, explains all this in the app, including which rules are not
  yet checked against a real player.
- The app works in English and Swedish, follows the device language (with a
  manual override in Settings), and follows the device's light or dark mode.
- It opens on you, or, with "When the app opens: Show the last viewed player"
  in Settings, on the player you looked at last. A bookmarklet import always
  opens the imported player.

## The Rating tab

Under the player's name (on phones in the top bar, with the PDGA number
under it and the Players button beside it) come the predicted rating, the change against the
official rating (with the value the app calculates for it, such as "978
(calculated 977.65)", when it reproduces it), the next ratings update and
how old the data is. "How to
refresh" next to the data age explains the round trip to pdga.com, with the
Refresh button under it. When the data is more than 7 days old, it opens by
itself as a warning.

Below that, each part is a card that opens and closes: Why it changed,
Chart, Add a round, Reach a target rating, Top 8, Details and Rounds. Each starts with a
one-line explanation that links to its part of "How it works". Rounds is
open at first; the app remembers which cards you open, also when you start
it from the home screen. While closed, Why it changed shows its largest
effect in its header, such as "907 no longer counts twice, +0.7", or the net
total when the change rounds to nothing, Chart shows how many rounds its
period has, and Top 8 shows its average and period, such as "Average 1014 ·
2026".

Rounds starts with the unofficial events, each with a Count checkbox. Clear
it for an event the next update won't count, for example one whose report
arrives after the deadline; Why it changed then says what counting it would
give. Leagues and X-tier events say why they may not count. The choice is
kept per player.

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

"Reach a target rating" takes a target, such as 1000, a number of upcoming
rounds (3 by default) and the date of the last one (today by default, up to
a year ahead). It shows the average round rating those rounds need to reach
the target at the update they count in. The app works this out with the
same rules as the prediction: it adds that many 18-hole rounds on that date
and finds the lowest whole rating that gets there, with the window, dropped
outliers and double weighting all applied. It also says when the target is
already reached (and what keeps it there), or when even rounds rated 1150
would not reach it.

The date matters twice. It decides the update: the first one whose report
deadline is on or after it, so a date on the Monday or Tuesday of update
week counts only in the following update. And since the new rounds are the
newest, the date ends the 12-month window: the answer lists the rounds that
leave the window because of it, with their ratings, so it is clear why an
early or a late date changes the answer. The date can be no earlier than
today, or than the newest stored round when that is later.

## Top 8

The Top 8 card on the Rating tab is laid out like a Global Masters Series
player card, for any player: the sum, average and highest of the player's 8
highest rated rounds, then those rounds. Official and unofficial rounds
count, and manual rounds when you tick "Include manual rounds"; they show
as "Manual". DNF rounds never count. The period is picked from one
list: any calendar year the player has rated rounds in (the current year by
default), the same window the prediction uses, or a custom range of dates.
The app remembers the choice.

## Rating chart

The Chart card draws the player's round ratings over time, newest to the
right, as an SVG drawn by the app itself (no chart library). The shape shows
where a round comes from: a circle for official, a square for unofficial and
a triangle for manual rounds. The fill shows what the next update does with
it: filled counts, a ring counts twice, hollow does not count, and a cross
marks a round that is dropped, left out or not counted by PDGA. The
prediction's window is shaded, with lines across it for the official rating
(dashed) and the prediction (solid), or one line when they are equal. They
are today's values, so a period that does not reach the window has none; a
link under the chart opens the player's ratings history on pdga.com for the
official rating over time. Tap a point, or use the arrow keys, to see its
event, date and rating above the chart; on a computer, holding the pointer
over a point shows them in a tooltip. The same rounds are also available as
a table. The chart is drawn at the card's width, and the button in its top
right corner shows it full screen, on its own with the tapped round in a
corner label (in landscape on Android; on iPhone, turn the phone). The
period is the last 24 months by default (ending at a planned manual round
when that is later than today), or a year, the rating window or a
custom range, picked like the Top 8's and remembered. The x-axis follows
time, or with Even spacing gives every round the same width, so a busy
summer spreads out; that choice is remembered too.

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
  screens; on phones it opens as "Switch player", with the shown player
  marked "Now"). Each favorite shows when it was last imported and links to its
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
browser (Safari on iPhone, the only iPhone browser that can save it; a
browser on Android, tested in Chrome, Brave, Ghost Browser and Samsung
Internet; or a desktop browser; you can switch) and shows numbered steps,
from copying the code to trying it on your ratings details. While the setup
page is open, its title is "Next Rating: get data", so a bookmark made there
gets that name and is not mistaken for a bookmark to the app. Settings and
the setup page also say whether the bookmarklet you last ran in this
browser is up to date.

Run it on your ratings details page or player page on pdga.com. It:

- reads the page you run it on, then fetches the other player page and the
  pages of recent events that are not in your ratings details yet: at most
  12 requests, one at a time, about a second apart, in your own browser
  session;
- from 1 January until the January ratings update, also fetches your
  previous season's results (one more request), since your player page then
  lists only the new season and a December event not rated yet would be
  missed;
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
