# Next Rating

Predicts your next PDGA player rating from your rated rounds, plus rounds that
are not rated yet or that you enter yourself.

**Unofficial tool. Not affiliated with or endorsed by the PDGA (Professional
Disc Golf Association).**

App: https://peiza.github.io/next-rating/

## How it works

- Your rounds are read from pdga.com in your own browser, or pasted by you.
  The app has no server: nothing you enter or import leaves your browser.
- The prediction follows the rating rules in the
  [PDGA ratings guide](https://www.pdga.com/ratings/guide): a 12-month window
  (24 months with fewer than 8 rounds), low outliers dropped, the most recent
  25% of rounds counted twice, and rounds weighted by hole count.
- The app works in English and Swedish, follows the device language (with a
  manual override in Settings), and follows the device's light or dark mode.

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

### Test fixtures

Tests that use pages saved from pdga.com read them from `tests/fixtures/`.
That folder is local only and never committed, since the pages contain
personal data, so those tests are skipped when it is missing (as in CI).
