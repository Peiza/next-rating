# Rating tab design pass plan

## Context

The Rating tab grew one section at a time, and the sections no longer match:
Statistics and Top 8 are `<details>` with a border around the whole thing,
Add a round and Reach a target are plain buttons whose form gets its own
border, and Why it changed and Rounds are bare headings. Open state lives
only in memory, so opening the home screen icon starts with everything closed
again.

Requested:
1. One card pattern for every section: a header with the title and an arrow
   that turns when the card opens, and a border that encloses the whole card,
   content included. For Why it changed, Add a round, Reach a target rating,
   Top 8, Statistics and Rounds.
2. Remember across launches which cards are open, and the Top 8 period, with
   the other settings. Update the storage rule.
3. Order: the summary (name, predicted rating, change, next update,
   "Updated …"), then Why it changed, Add a round, Reach a target rating,
   Top 8, Statistics, Rounds. Rounds is open by default, the others closed.
4. Why it changed: when closed, the header shows the largest effect as a
   one-line teaser, such as "907 no longer counts twice, +0.7". Opened, it
   shows the top 5, and "Show all" the rest.
5. Refresh: next to "Updated …", a small expandable "How to refresh" with one
   line and the Refresh button. When the data is more than 7 days old it
   opens by itself, styled as a warning, replacing the warning box.
6. Top 8 period: one select with each calendar year the player has rated
   rounds in (newest first, the current year as default), the rating window,
   and a custom range with from and to dates. The chosen period is not
   repeated on the line below.
7. Each card gets a one-line explanation at the top of its content.

Agreed: the Refresh button stays visible under "How to refresh"; the
official rating line stays under the change line; the exact import time
moves into "How to refresh".

Branch `rating-cards`, one pull request.

## Decisions
- **Card pattern** is a disclosure button inside a heading, not `<details>`:
  one look for all six cards, room for a teaser in the header, heading
  navigation for screen readers, and control over focus.
  `section.card#<name>` > `h2.card-heading` >
  `button#<name>-toggle.card-toggle[aria-expanded][aria-controls]` with the
  title, an optional teaser and `span.card-arrow[aria-hidden]`. The body
  `div#<name>-body.card-body` is rendered only while open. Section ids stay
  (`why`, `manual`, `target`, `top8`, `stats`), Rounds gets `rounds`.
- **Look**: one 2px `--border` frame with a 0.5rem radius around header and
  body; the header is a full-width tap target of at least 3rem; the arrow is
  a CSS chevron that turns 90° when open, with no transition under
  `prefers-reduced-motion`. The forms inside lose their own border. Top 8
  keeps its inner GMS card. Existing colour tokens only.
- **Focus**: a toggle re-renders with focus on the header button. Opening
  Add a round no longer moves focus into the rating field, which popped up
  the phone keyboard.
- **Order**: summary, Why it changed, Add a round, Reach a target rating,
  Top 8, Statistics, Rounds, then the unofficial notice. The "No rated rounds
  yet in …" hint moves into the Rounds card.
- **Remembered state** is global, like the other settings. Drafts (manual
  form, target fields) still reset when the player changes; cards no longer
  close on a player switch.

## Commits
1. **Storage**: `AppData.cards` (`why`, `manual`, `target`, `top8`, `stats`,
   `rounds`; all closed except Rounds) and `AppData.top8Period`
   (`{ kind: 'year', year: number | null }` with null for the current year,
   `{ kind: 'window' }`, or `{ kind: 'custom', from, to }`). Each validated on
   its own with defaults, so data without them loads and the key stays
   `next-rating:v2`.
2. **Cards**: `src/app/views/card.ts`; `ratingView` builds the six cards in
   the new order; manual, target and Top 8 return only their body. The Why
   it changed teaser (`why.teaser`, "{reason}, {effect}") is the largest item
   by size of effect, the difference line included, shown only while closed.
   The "N manual rounds" hint becomes Add a round's teaser. A one-liner
   (`p.card-intro`) opens each body; Top 8 links "Global Masters Series" to
   https://www.pdga.com/global-masters-series through `textWithNodes` in
   dom.ts, which puts nodes in a translated message's placeholders.
3. **Summary and How to refresh**: name, predicted rating, change, official
   rating, next update, then `div#refresh-box` with a `<details>` ("Updated
   3 days ago · How to refresh") holding the one line and the exact import
   time, and the Refresh button under it. Stale data gives the box the
   warning look, opens the details with the stale sentence first and makes
   the button primary; the separate stale box goes away. The details' open
   state is kept in memory and resets on a player switch.
4. **Top 8 period select**: `isTopRound` exported from src/engine/top8.ts;
   `periodYears` and the new `TopPeriod` in src/app/top8.ts; a `<select>`
   with the years, "Rating window (12 months, start to end)" and "Custom
   range" with from and to date inputs (stored only when valid and from ≤
   to). The band line goes, and one empty text replaces the two.
5. **Docs**: finished-steps.md (design pass section, storage rule), CLAUDE.md,
   README.

## Verification
`npm run typecheck`, `npm test` (fixture tests run locally),
`npm run check:i18n` and `npm run build`. No preview server; tested on the
phone after merging.
