# Plan: edit manual rounds, the sloped arrow and example rounds

Three pull requests: A edits manual rounds and slopes the following
update's arrow, B adds example rounds under the target answer, C lets the
chart be dragged through history with a long-press for the value. Each
starts after the previous one is merged. Parts A and B are built.

Decisions: 1a (edit from the Rounds card and from the Add a round card's
list), 2a (after Save, the form adds rounds again and focus goes to the
round's Edit button), 3a (the sloped arrow only on the following update),
4a (slopes at 1–2, 3–9 and 10 and more), 5a (example rounds all on the
target date, each an event of its own, as the calculator assumes), 6a (their
spread is the standard deviation of the window's rounds, 5–30), 7a (an
edited example becomes an ordinary manual round), 8a (the Top 8 leaves
examples out, also with manual rounds on).

## A1. Edit a manual round
- In the Rounds card, a manual round's row takes a tap anywhere on it, and
  ends with an Edit button ("Edit manual round 985, 12 Oct 2026"). The
  button has no handler of its own: its click, also from Enter or Space,
  reaches the row's. Official and unofficial rows are unchanged.
- The Add a round card's list has Edit before Delete on each round. The
  round being edited is marked "Editing".
- Editing opens the Add a round card when closed (stored like a tap on its
  header) and fills the form with the round (`draftOf`). Focus goes to the
  form's heading "Edit round 985" (tabindex -1), so the form scrolls into
  view without a keyboard. "Save changes" and Cancel replace Add, and the
  form checks the round with the same `readManualRound` as Add.
- `updateManualRound` in src/app/players.ts keeps the round's id and place.
  The status says "985 saved." and focus goes to the round's Edit button.
  Cancel goes back to the button that opened the edit. Either way the form
  gets back what was typed before the edit.
- The edit ends unsaved when its round is deleted, cleared, or removed in
  another tab ("That round was removed, so nothing was saved."), when the
  card is closed and when another player is shown.

## A2. The sloped following update arrow
- "Then 10 Nov: 985 ↗ +3": the arrow is shallow (about 20°) for a change of
  1–2, diagonal for 3–9 and straight for 10 and more; no change keeps the
  flat arrow. `slope` and `slopeArrow` in src/app/views/change.ts; the arrow
  is a small SVG in `currentColor`, turned by the `slope-up-N` and
  `slope-down-N` classes, sized in em and hidden from screen readers, which
  read the sign.
- The change gets `change-strength-N`: 1 and 2 use `--good-1`/`--good-2` and
  `--bad-1`/`--bad-2`, tones of --good and --bad toward --text-muted, and 3
  keeps --good or --bad. The contrast test checks the new tokens at 7:1 in
  both themes.
- The change line under the predicted rating and the players list keep
  their arrows.

## B. Example rounds under the target answer
- Under an answer with an average above 0 (needed, or what keeps the
  target), "Add 3 example rounds" with the hint "Rounds around 1012, spread
  like your own, added as manual rounds." The status under it says "Added
  1031, 1004, 1019. Prediction for 8 Dec: 1000." for the answer's update,
  also when that is the following update. Another tap replaces them; it
  never stacks.
- "Remove example rounds" shows in the target card and beside Delete all
  in the Add a round card while the player has examples, with no confirm
  and no Undo, since the same tap adds the same rounds again.
- Examples are manual rounds with a stored `example` flag (old data loads
  as false). They show "Example" in the Rounds card, the card's list and
  the chart's legend, details, tooltip and table, with the manual
  triangle. Editing one saves an ordinary manual round.
- `calculateTarget` and `targetDates` leave examples out, so adding them
  keeps the answer and the date field. The Top 8 leaves them out. The
  prediction, Why it changed, the chart and the players list count them.
- src/app/examples.ts, pure and without Math.random:
  - The spread is the window's standard deviation without the examples,
    rounded, kept within 5–30, and 15 with fewer than 2 rounds.
  - The offsets are normal quantiles times the spread, symmetric so they
    sum to 0, ordered high, low, next high and so on.
  - The average goes up from the one needed, a point at a time and at most
    60, until the engine, on exactly the rounds the player then has
    (`withExampleRounds`, `withManualRounds`), reaches the target at the
    answer's update.
  - Near 1150 the spread shrinks so no round goes above it.
- `replaceExampleRounds` saves the unsaved player as a favorite first, as
  adding a manual round does, and counts the 200-round limit without the
  examples it replaces.
