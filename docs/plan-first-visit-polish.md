# Plan: first visit polish

## Context
Feedback from testing in a fresh browser: the start view and the players
panel still had a heading line of their own below the phone top bar, while
Settings and How it works show theirs in the bar; and a first-time user who
does not know their PDGA number had no way to find it from step 1.

Branch `first-visit-polish`, one commit per point, then a docs commit and a PR.

## 1. Phone top bar title on the start view and in the players panel (main.ts, views/start.ts, views/players.ts)
- Start view: `barTitle()` returns `t('app.name')` on the Rating tab with no
  player, so "Next Rating" sits at the left of the bar next to Players. The
  view's own h1 gets `class: 'wide-only'`, like Rating and Settings. The
  tagline and "Get started" stay at the top of the view. For a stored player
  without data the bar names that player like the Rating view
  (`ratingPlayer()` no longer requires an import).
- Players panel: while the menu is open the bar title is
  `t('players.switch')`, next to Close. The panel's h2 drops its phone-only
  "Switch player" span and becomes a wide-only "Players"; the nav keeps
  `aria-labelledby` on it (works while hidden).
- Focus: opening the menu on a phone focuses `topbar-title` instead of
  `favorites-title`; wide screens keep `favorites-title`. Covers
  `toggleMenu`, `showLayers` (back gesture) and `removeFromPanel`, through
  one helper like `overlayTitleId`.
- Tests: main.test.ts checks the bar title on the start view, with the menu
  open and after closing, and the focus target on phones and wide screens;
  views.test.ts updates the panel heading test.

## 2. Step 1: "PDGA number" and "Search by name" tabs (views/start.ts, views/pdga.ts, views/players.ts, views/segmented.ts, main.ts, locales)
- Inside the step 1 box, a two-part segmented control (native radios, like
  the theme picker) under the step title, its legend visually hidden since
  the step title says what it is for. Radio ids `start-by-number` /
  `start-by-name` so focus returns after the render.
- `startTab: 'number' | 'name'` in memory in main.ts; not stored, so a page
  load (e.g. coming back from pdga.com) starts on PDGA number.
- Number tab: today's `pdgaNumberForm`, unchanged.
- Name tab: the panel's name search moves from players.ts to pdga.ts as
  `nameSearchForm(onSearch, { id, label, hint })`, shared by both. Same
  `playerSearchUrl`, same empty-name error, same `window.location.assign`
  (same tab). Id `start-search`, since the panel's `player-search` can be on
  the page at the same time.
- Hint: "Opens pdga.com's player search in this tab. Your number is in the
  PDGA # column there. Come back and enter it under PDGA number."
- New keys in en.json and sv.json: `start.findBy` (hidden legend),
  `start.byNumber`, `start.byName`, `start.searchLabel`, `start.searchHint`.
- Tests: views.test.ts (both tabs, the search builds the pdga.com URL, empty
  name error); main.test.ts (switching tabs keeps focus on the radio, saving
  the number still works).

## 3. Docs
- docs/finished-steps.md: a "First visit polish" section; CLAUDE.md: Built
  list and "Done so far".
- docs/plan-first-visit-polish.md: this plan.

## Verification
Typecheck, tests, the i18n check and the build. Tested on the phone after
the merge.

## Decisions
Taken with the recommended answers to the plan's questions:
- The tabs are the existing segmented radio control, not an ARIA tab list.
- A stored player without data is named in the bar like the Rating view.
- The name tab's hint also says to come back and enter the number.
