# Ko-fi support line: handoff brief

A self-contained description of the Ko-fi support line in Next Rating
(https://peiza.github.io/next-rating/, repo Peiza/next-rating), written so
that a Claude Code session in another app can add the same line there. The
last two sections are a ready-to-paste prompt and a list of the apps that
carry the line.

## What it is

One short line of plain text with one link, near the bottom of a few views:

> Like Next Rating? [Buy me a coffee on Ko-fi](https://ko-fi.com/peiza)

- A plain `<a>` link. No Ko-fi button image, widget, overlay or script, so
  nothing from Ko-fi loads in the app and the Content Security Policy needs
  no exception.
- No icon: no coffee emoji, SVG or image. The words carry it.
- Opened in the same tab, like the app's other external links.
- Quiet: normal body text in the normal text color, the link styled like any
  other link. It sits just above the "unofficial tool" notice or the Back
  button, never at the top of a view and never in a dialog.

## The URL and where it is configured

`https://ko-fi.com/peiza`, in one constant, exported so tests can use it:

```ts
// src/app/views/support.ts
export const KOFI_URL = 'https://ko-fi.com/peiza';
```

The README repeats it in its Support section (below). Nothing else holds
the URL: no environment variable or build setting.

## The code

The whole module, `src/app/views/support.ts`:

```ts
import { t } from '../../i18n';
import { el, textWithNodes } from '../dom';

export const KOFI_URL = 'https://ko-fi.com/peiza';

/**
 * A plain link to support the app on Ko-fi, opened in the same tab like the
 * pdga.com links. No Ko-fi script or widget. The class gives it the same
 * spacing in every view (styles.css).
 */
export function supportLink(): HTMLElement {
  const link = el('a', { href: KOFI_URL, rel: 'noreferrer' }, t('support.link'));
  return el('p', { class: 'support' }, ...textWithNodes(t('support.text'), { link }));
}
```

The markup it renders:

```html
<p class="support">Like Next Rating? <a href="https://ko-fi.com/peiza" rel="noreferrer">Buy me a coffee on Ko-fi</a></p>
```

The helpers it uses, from `src/app/dom.ts` (the app has no framework and no
runtime dependencies; views are plain DOM built with `el()`):

- `el(tag, props, ...children)` creates an element. Attributes are set with
  `setAttribute`, text children become text nodes, so no data ever goes
  through `innerHTML`. An `href` must start with `https://` or `el()` throws.
- `textWithNodes(text, nodes)` splits a translated sentence on `{name}`
  placeholders and puts the given nodes in their places, so the link can sit
  anywhere in the sentence in each language:

```ts
export function textWithNodes(text: string, nodes: Readonly<Record<string, Node>>): (Node | string)[] {
  return text
    .split(/\{(\w+)\}/)
    .map((part, i) => (i % 2 === 1 ? (Object.hasOwn(nodes, part) ? nodes[part]! : `{${part}}`) : part))
    .filter((part) => part !== '');
}
```

In an app without such helpers, the same thing in plain DOM is a `<p>` with
the class `support`, the sentence's text before and after `{link}` as text
nodes, and the `<a>` in between, its text set with `textContent`.

## Translations

Two keys in each catalog (`src/i18n/locales/<lang>.json`). The sentence
holds a `{link}` placeholder, and the link text is its own key, so word
order can differ per language:

| Key | en | sv |
| --- | --- | --- |
| `support.text` | `Like Next Rating? {link}` | `Gillar du Next Rating? {link}` |
| `support.link` | `Buy me a coffee on Ko-fi` | `Bjud mig på en kaffe på Ko-fi` |

The app name is written into the sentence, not passed as a parameter. English
is the fallback for a missing key, and `npm run check:i18n` fails when a
catalog has a key English lacks or a placeholder that differs from English.

## CSS

At the end of `src/app/styles.css`, last so it wins over the top margin of
the element that follows:

```css
/*
 * The Ko-fi line (views/support.ts): the same space in every view, closer to
 * what follows it (the unofficial notice, or Back) than to what is above.
 * Last, so it wins over that element's own top margin.
 */
.support {
  margin: 1.75rem 0 1rem;
}

.view > .support + * {
  margin-top: 1rem;
}
```

The point of the shared rule: the line gets the same space above and below
in every view, whatever comes before it (a card, a hint, a guide section)
and whatever follows it. What follows has its own larger top margin
elsewhere, which this rule overrides:

```css
.notice {            /* the unofficial notice under the Ko-fi line */
  margin-top: 2rem;
  padding-top: 1rem;
  font-size: 0.95rem;
  color: var(--text-muted);
  border-top: 2px solid var(--border);
}

.guide > .button {   /* the Back button at the end of How it works */
  margin-top: 1.5rem;
}
```

Every view's root element has the class `view`. Margins are in `rem`, so the
spacing follows the app's text size setting. There is no extra rule for the
link itself: it uses the app's normal link color and focus style.

## Link opening, CSP and referrer

- Same tab: no `target` attribute. The tests check that there is none.
- `rel="noreferrer"`, as on every external link in the app, and
  `index.html` has `<meta name="referrer" content="no-referrer">` as well, so
  Ko-fi does not learn which page the visitor came from.
- The CSP is a meta tag injected at build time (`vite.config.ts`), since
  GitHub Pages cannot send headers:
  `default-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'`.
  A plain link that navigates away is not limited by these directives, so
  the Ko-fi line needed no change to the CSP. A Ko-fi widget or button image
  would need `script-src`, `img-src` or `frame-src` exceptions for a third
  party, which the app does not allow.

## Where it appears

| View | File | Place |
| --- | --- | --- |
| Rating tab | `src/app/views/rating.ts` | Last child but one: after the last card (Rounds), just before the unofficial notice |
| Settings | `src/app/views/settings.ts` | Last child but one: after the version line, just before the unofficial notice |
| How it works | `src/app/views/guide.ts` | After the last guide section, just before the Back button |
| README | `README.md` | Its own `## Support` section, after the bookmarklet sections and before Development |

It is called once per view, as `supportLink()` in the view's list of
children. It is not on the start view (first visit), the setup page or the
players panel, so a new visitor first sees what the app does.

The README section:

```md
## Support

Like Next Rating? [Buy me a coffee on Ko-fi](https://ko-fi.com/peiza).

The app has the same plain link at the bottom of the Rating tab and of
Settings, and at the end of How it works, opened in the same tab. There is no Ko-fi button, widget or
script, so nothing from Ko-fi loads in the app.
```

## Tests

All in `tests/app/views.test.ts` (Vitest with jsdom), importing `KOFI_URL`
from the module so the URL is written once:

- Settings, "links to Ko-fi in the same tab, just before the unofficial
  notice": the link text and the whole line's text in English, `rel` is
  `noreferrer`, no `target`, the parent's class is `support`, exactly one
  `.support` in the view, and the line is right before the view's last child.
- Rating view, "links to Ko-fi in the same tab at the bottom, just before the
  unofficial notice, as in Settings": exactly one Ko-fi link, the same checks,
  the last child has the class `notice`, and after `setLanguage('sv')` the
  line reads `Gillar du Next Rating? Bjud mig på en kaffe på Ko-fi`.
- Rating cards, "follow the summary in a fixed order, then the Ko-fi link
  and the unofficial notice": the element after the Rounds card holds the
  link, and the notice follows it.
- How it works, "says the app is unofficial, and links to the PDGA pages it
  follows, in the same tab": the page's links in order end with `KOFI_URL`,
  and no link has a `target`.
- How it works, "ends with the Ko-fi link, just before Back": the line's
  text, its class, one `.support`, and the Back button right after it.

The tests check structure and text, not pixels: the spacing is covered by
the one shared CSS rule, and checked by eye on the phones.

## Prompt for the other app

Paste this into a Claude Code session in the other app's repository, with
this file attached or pasted below it.

```text
Add a small Ko-fi support line to this app, the same one Next Rating has.
The attached docs/kofi-handoff.md from Next Rating describes it in full:
the URL https://ko-fi.com/peiza, the markup, the translation keys, the CSS,
the link behavior, the tests and where it appears.

Adapt it to this codebase rather than copying it blindly:
1. First read how this app does i18n (if it has any), styling and views:
   its translation files and how text with a link inside is translated, its
   CSS conventions (tokens, units, class naming) and how views are built
   (framework components, templates or plain DOM). Use those patterns, not
   Next Rating's el() and textWithNodes() helpers, unless this app already
   has the same ones.
2. Put the URL in one constant or setting, used by the code and the tests.
3. The line: "Like <this app's name>? Buy me a coffee on Ko-fi", the link
   on "Buy me a coffee on Ko-fi". If the app has translations, add the
   sentence (with a placeholder for the link) and the link text as keys in
   every language it ships, and keep its translation checks passing.
4. A plain link only: no Ko-fi script, widget, button image or icon. Same
   tab (no target), rel="noreferrer". Check that the app's Content Security
   Policy, if any, still needs no change, and do not loosen it.
5. Place it near the bottom of the views where an "about" or "support" line
   fits (for example settings, an about or help page, the main view's
   bottom), just above any disclaimer or back button, never at the top or in
   a dialog. Propose the views in the plan before changing anything.
6. Keep spacing consistent: one shared class with one margin rule, so the
   line has the same space above and below in every view, overriding the
   top margin of whatever follows it. Use the app's own units.
7. Add a test, in the app's existing test setup, that checks the URL, the
   text, no target attribute, rel="noreferrer", one line per view and its
   position. Add a short Support section to the README with the same link.
8. Follow this repository's CLAUDE.md and process (plan first, branch, its
   checks). Commit on a branch, open a pull request, wait for CI and report
   the result. Never merge: the owner merges.
```

## Homepage list of apps

The apps that carry the Ko-fi line, for a homepage or Ko-fi page that lists
them all. Add a row when another app gets the line.

| App | What it does | App link | Repository |
| --- | --- | --- | --- |
| Next Rating | Predicts your next PDGA rating update | https://peiza.github.io/next-rating/ | https://github.com/Peiza/next-rating |
| | | | |
