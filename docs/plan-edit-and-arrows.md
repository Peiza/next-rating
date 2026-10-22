# Plan: edit manual rounds and the sloped arrow

Part A of three pull requests: A edits manual rounds and slopes the
following update's arrow, B adds example rounds under the target answer, C
lets the chart be dragged through history with a long-press for the value.
Each starts after the previous one is merged. Part A is built.

Decisions: 1a (edit from the Rounds card and from the Add a round card's
list), 2a (after Save, the form adds rounds again and focus goes to the
round's Edit button), 3a (the sloped arrow only on the following update),
4a (slopes at 1–2, 3–9 and 10 and more).

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
