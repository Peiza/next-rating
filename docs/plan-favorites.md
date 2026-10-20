# Favorites plan

## Context

Today the app stores a single player's data: `AppData` (`src/app/storage.ts`,
key `next-rating:v1`) has one `pdgaNumber` (the default player) and one
`lastImport`. `applyImport` (`src/app/import.ts`) replaces everything when an
import for another player arrives. Running the bookmarklet on a friend's page
erases my own data.

The Favorites step (CLAUDE.md, Architecture 5) stores several players side by
side, each with its own import, so switching players is instant. It comes
before manual entry (commit 3 of `docs/plan-step-3.md`), so manual rounds are
stored per player from the start. The bookmarklet does not change, so nobody
reinstalls it.

Decisions:
- **Non-favorites**: an import for a player who is not a favorite goes into
  one unsaved slot, with an "Add to favorites" button. The next non-favorite
  import replaces that slot.
- **A fixed "me" player**: one favorite is marked as me. Every page load
  opens on it. Selecting another player lasts only until the page closes.
- **Event pages** (no player of their own): every stored player with a row in
  the event gets it, trimmed to that player's rows. If no stored player has a
  row, the selected player gets it, so "No rated rounds yet" shows.

Two additions:
- A small fix to the stats panel layout.
- A new step after Favorites, written into CLAUDE.md only and not built yet.

Branch `favorites`, one pull request, four commits.

## Commit 1: Save the plan and add the change-explanation step

- This plan goes into `docs/plan-favorites.md`.
- `docs/plan-step-3.md`, commit 3: `manualRounds` is added to each
  `StoredPlayer`, not to `AppData`.
- **CLAUDE.md**:
  - Process: a new line right after Favorites, "Change explanation (why the
    prediction differs from the official rating)".
  - Architecture: a new item 6 after Favorites. The current 6 to 8 become
    7 to 9, and every cross-reference is checked. The new item says:
    - Under the change line on the Rating tab, a short "Why it changed" list
      compares the last official update with the prediction, using the real
      engine.
    - The official state is the official rounds only, which reproduces the
      official rating. The new state is all rounds.
    - The list shows what differs:
      - new rounds, with their ratings
      - rounds that left the window
      - rounds that started or stopped counting twice
      - rounds newly dropped, or no longer dropped
    - Each effect is estimated with the engine and marked with an up or down
      arrow, and the largest effects come first. For example, a 985 round
      that no longer counts twice can outweigh a new 938 round.

## Commit 2: Show the window length next to its label

In the stats panel (`statsPanel` in `src/app/views/rating.ts`), "Window" and
"12 months" share one line. The date range goes on the line below.
- **Markup**: the window row gets a second `<dd>` (valid inside a `<dl>`)
  with the class `stat-detail`.
- **Styles**: `.stat-detail` gets `flex-basis: 100%` and muted text, so it
  always wraps onto its own line under the label and the value.
- **Translations**: `stats.windowValue` is split into `stats.windowMonths`
  ("{months} months", with plural forms) and `stats.windowRange` ("{start}
  to {end}"), in both `en.json` and `sv.json`.
- **Tests**: a view test checks that the months and the range are in
  separate elements.

## Commit 3: Store data per player, with migration

**Storage format v2** (`src/app/storage.ts`, new key `next-rating:v2`):
```ts
interface StoredPlayer {
  pdgaNumber: number;
  favorite: boolean;            // false only for the one unsaved slot
  import: StoredImport | null;  // commit 3 of plan-step-3 adds manualRounds here
}
interface AppData {
  language: string | null;
  theme: Theme | null;
  me: number | null;            // must be a favorite's number, else null
  players: StoredPlayer[];      // favorites in the order added, plus at most one unsaved
}
```
- `validateData` reads it back one field at a time, like today, and one player
  at a time, so a single corrupt player loses only that player's import.
  Rules: unique numbers, at most `MAX_FAVORITES = 30` favorites, at most one
  unsaved player, and `me` must be a favorite. If an import's player header
  has a different number from its slot, that import is dropped.
- **Migration** from v1 runs when `v2` is missing and `v1` exists:
  - The old `pdgaNumber` P becomes a favorite and `me`.
  - The old `lastImport` goes to its player Q (header number, else P). If Q
    is P, it goes to P's slot. Otherwise Q becomes the unsaved player.
  - Stored events are trimmed to their player's rows (see below).
  - Write v2. Remove v1 only when the write succeeds and nothing was left
    behind. The one case where something is left behind is an import with no
    player number at all (event pages only). Then v1 is kept, so data is
    never silently dropped.
- `persistent` now reflects the most recent write rather than turning false
  for good. Deleting a player can then free space, and the next write can
  succeed again.
- **Several tabs**: a `storage` event listener in `main.ts` reloads the
  in-memory copy (new `store.reload()`) and re-renders. Without it, an
  app tab that was already open would overwrite a newer import with stale
  data. With several players stored, that risk matters more.

**Pure player operations** (new `src/app/players.ts`, unit tested):
- `eventForPlayer(event, n)` keeps only the divisions with player n's row,
  and only that row. If n has no row, it keeps no divisions. This stops one
  full event page from being stored once per favorite.
- `routeImport(data, parts, owner, selected, at)` returns the new data, the
  numbers of the players that received data, and `noPlayer`.
  - With a player number (`parts.player`, or the owner from the page URL or
    the paste owner form), the import goes to that player's slot. If the
    player is not stored yet, a new unsaved slot replaces the old one.
    Events in the import are trimmed to that player's rows.
  - Event pages with no player go to every stored player with a row in the
    event. If none has a row, they go to `selected`. With no players at all,
    nothing is stored and `noPlayer` is set.
- `addFavorite(data, n)` (an unsaved player keeps its import when added),
  `removePlayer`, `setMe`, and `initialSelection(data)`. The app opens on
  `me`, else the first favorite, else the unsaved player.

**Import** (`src/app/import.ts`): `applyImport` now works on one player's
slot. Its "other player replaces everything" branch and its placeholder
player record go away, since the slot holds the number. The rest stays the
same: fields replaced only when present, events deduplicated by key, events
dropped once the ratings details include them, at most `MAX_EVENTS`.

**Model** (`src/app/model.ts`): `buildModel(player: StoredPlayer)`. Every
import now belongs to a player, so `needsNumber` and the
`rating.needsNumber` message are removed.

**Wiring** (`src/app/main.ts`):
- A new `selected` variable in memory, starting from `initialSelection`.
- A hand-off or paste with a player selects that player.
- A pasted ratings table without a header prefills the owner field with the
  selected player.
- The Rating tab shows the selected player's data.
- Banners:
  - An event import says who received it ("Event added for Anna, #12345").
  - With no player stored, the banner asks to add a PDGA number first
    and links back to the event page, to run the bookmarklet there
    again (it reuses the failed-pages list).
  - An import that could not be saved shows the "storage full" warning.
- **This commit keeps the existing screens working:**
  - The number form on the start view and in Settings adds a favorite and
    makes it "me".
  - "Make #X my default player" becomes "Add to favorites" for the unsaved
    player.

## Commit 4: Favorites sidebar and menu

**Layout** (`src/app/styles.css`, existing tokens only, so the contrast
test is unchanged):
- **Wide screens**: from `64rem`, a grid with a `16rem` sidebar next to the
  existing `40rem` main column. The favorites panel is always visible there.
- **Phones**:
  - A top bar shows a "☰ Players" button (`aria-expanded`, `aria-controls`)
    and the selected player's name or number.
  - The button opens the same panel in place of the current view, through a
    `menu-open` class and CSS only. Focus moves to the panel heading.
  - Close returns focus to the button.
  - Choosing a player closes the menu and switches to the Rating tab.

**Favorites panel** (new `src/app/views/players.ts`, a `<nav>`):
- **Each favorite** shows:
  - a large button to select it, with:
    - the name, or `#number` before the first import
    - a "You" badge on `me`
    - for the selected player, a ✓ and `aria-current`
    - "Imported 3 days ago", or "Not imported yet"
  - a "Ratings details on pdga.com ↗" link (`detailsUrl` from
    `src/app/views/pdga.ts`), where the bookmarklet refreshes that player.
- **Edit list**: an "Edit list" toggle shows "This is me" and "Remove" on
  each favorite. Remove asks for confirmation in an inline row, not
  `window.confirm`, because it deletes that player's data.
- **Unsaved player**: shown under its own heading ("Not saved"), with an "Add
  to favorites" button.
- **Add player**: a PDGA number form at the end of the panel. It reuses
  `pdgaNumberForm`, with the label, button and ids passed as parameters.
- **Relative times**: a new `formatAge(timestamp, now)` in
  `src/app/format.ts`, using `Intl.RelativeTimeFormat` with `numeric:
  'auto'`. The data age display in commit 3 of `plan-step-3.md` reuses it.

**Other views**:
- **Start view** (`src/app/views/start.ts`):
  - With no players, the four steps stay as they are. Step 1 adds a favorite
    and makes it "me".
  - When the selected player has no import yet, step 1 is left out and the
    remaining steps refer to that player.
- **Settings**: the PDGA number form and the details link move to the panel.
- **Rating summary**: "Add to favorites" stays for the unsaved player.
- **i18n**: new keys in `en.json` and `sv.json`. Removed keys go from both
  catalogs.
- **README**: favorites, the unsaved slot, and the fact that the app opens on
  "me".
- **CLAUDE.md**: mark Favorites as done in the Process list.

## Tests

- **`tests/app/storage.test.ts`**:
  - v2 round trip
  - validation: duplicates, too many favorites, two unsaved players, `me`
    not a favorite, an import under the wrong number
  - migration: number only; import of the same player; import of another
    player (goes to the unsaved slot); events trimmed; v1 removed after a
    successful write; v1 kept when the write fails or an import had no
    number
- **`tests/app/players.test.ts`**:
  - routing by header, by owner, and to a new unsaved player that replaces
    the old one
  - an event going to several players, to the selected player as a
    fallback, and `noPlayer`
  - `eventForPlayer`, add, remove, `setMe`, `initialSelection`
- **`tests/app/import.test.ts`, `model.test.ts`**: adapted to one slot per
  player.
- **`tests/app/views.test.ts`**:
  - the panel: selected and "You" marked in text, not by colour alone; the
    details links; the Remove confirmation
  - the top bar button's `aria-expanded`
  - the unsaved player's Add button
- **`tests/app/main.test.ts`**:
  - a hand-off for a second player keeps the first player's data
  - an event hand-off reaches two favorites
  - a reload opens on "me"
  - a `storage` event re-renders
  - the existing tests, updated for the new format
- **Fixture tests** (local only): updated for the new `buildModel` signature.
- All test data stays synthetic, with no fixture names or numbers.

## Verification

- `npm run typecheck`, `npm test`, `npm run check:i18n`, `npm run build`.
- **Migration on a real browser**:
  1. On `main`, run `npm run build` and `npm run preview`, then import with
     `npm run handoff -- <fixture pages>`.
  2. Stop the task, switch to the branch, build and preview again.
  3. Reload. The same prediction shows, and Application > Local Storage
     holds only `next-rating:v2`.
- **Two players**: run hand-offs for two players and an event page. Both keep
  their data, the panel shows both, and the event reaches each of them. Open
  the app in two tabs and import in one: the other tab updates.
- **Stats panel**: open it at phone width. "Window" and "12 months" are on
  one line, and the date range is on the line below.
- DevTools at phone width and at desktop width, in light and dark. Check that
  there are no CSP errors, and run Lighthouse accessibility.
- **After merging, on the phone**: run the bookmarklet on my own page and
  on a friend's page, switch between them, add the friend to favorites,
  reload, and check that it opens on "me".
- Before each commit, check the staged diff for fixture names and numbers.
  Stop preview servers by stopping the background task.
