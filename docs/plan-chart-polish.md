# Plan: chart polish

## Context
After testing the chart follow-up on the phone. Full screen spent its room
on a title bar and the period select, and the tapped round's details pushed
the chart down. The Full screen button was a full-width button above the
chart. On a computer a point needed a click to show its round. A busy summer
packed its rounds together on a time axis, and in the table long event names
pushed the date and rating onto two lines.

Branch `chart-polish`, one pull request.

## Commit 1: Table
Date and rating cells keep to one line (`white-space: nowrap`); the event
cell wraps anywhere, so a long name cannot widen its column. Status wraps as
before.

## Commit 2: Corner button, and only the chart full screen
- The Full screen button becomes a small icon button (`.chart-corner`) in
  the frame's top right corner, in the card and full screen: an 18 px icon
  at the top of a clear 36 px tap area, with `aria-label` "Full screen". The
  plot's top margin grows from 10 to 26 px, so the icon sits in a strip
  above the plot and covers no point or line value.
- Full screen shows only the chart: no title bar, Close or period select.
  The `h1` stays, visually hidden, as the dialog's label and focus target.
  The corner button there is "Exit full screen" (corners pointing inward)
  with the id of the old Close; back and Escape close too.
- The chosen round full screen is a small HTML label (`.chart-label`,
  polite live region, text only) in the frame's top left corner, empty and
  hidden until a round is chosen. While the chosen point lies under it, it
  moves to the top right, left of the corner button.
- The card keeps its details line above the chart. `chart.close` is
  replaced by `chart.exitFullScreen`.

## Commit 3: Hover tooltip
`pointermove` from a mouse or pen finds the nearest point within the tap
radius; after 100 ms on the same point a tooltip (`.chart-tip`,
`aria-hidden`) shows its event and round, date, and rating with status, by
the pointer: above and to the right, flipped where the frame ends. It hides
on `pointerleave`, on moving off the point and on a redraw. It is placed
through CSSOM (`style.left`/`top`), which the CSP allows; `el()` still
refuses style attributes. Touch keeps the tap, and a click still chooses the
point.

## Commit 4: X-axis
- `chartAxis: 'time' | 'even'` in the settings next to `chartPeriod`;
  anything else reads as `'time'`. A segmented "X-axis: Time / Even spacing"
  in the card under the period select, also used full screen.
- `xScale(chart, axis)` in src/app/chart.ts (pure) places rounds, range ends
  and month ticks from 0 to 1. By time as before. With even spacing, round i
  of n sits in the middle of slot i; a range starts in the gap before its
  first round and ends after its last; a tick marks each month with a round,
  in the gap before its first round, thinned left to right to about 52 px
  apart, with the year on the first label and wherever it changes.
- The view's layout takes the scale instead of placing dates itself.

## Commit 5: How it works
The chart section describes the corner button, the label full screen, the
tooltip and the x-axis.

## Commit 6: Docs
This plan, the Chart polish section in docs/finished-steps.md, CLAUDE.md,
and docs/ideas.md: the share idea rewritten, sharing as an image, pinch to
zoom and pan, and a two-finger period selection with its average.
