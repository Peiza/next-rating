# Plan: adjustable text size

A text size slider in Settings for the whole app (part 1), then A− / A+
buttons on How it works that change only that page (part 2, after part 1 is
merged). Part 1 also puts the Ko-fi link at the bottom of the Rating tab.

Decisions: 1a (absolute sizes 14–22 px, following the device by default),
2a (the size as a plain number: CSS pixels are points on iPhone, not on
Android or computers), 3a (a sample line follows the slider; the whole app
changes when it is let go), 4a (How it works), 5a (the chart's text,
margins and marks grow with the text), 6a (narrow segmented controls do not
break words; built with wrapping rows instead of a container query, see 3).

## 1. Storage and helpers
- `AppData.textSize`: an integer 14..22 (`TEXT_SIZES` in storage.ts) or null,
  which follows the device as before: 17 px on phones, 15 px from 48rem wide,
  Dynamic Type on iPhone. Anything else loads as null.
- src/app/text-size.ts: `clampTextSize`, `sliderValue` (the size picked, or
  the device size within the range) and `textScale` (the size picked against
  the device size; 1 while following the device).

## 2. Settings slider
- Named "Body text size" ("Brödtextstorlek"): headings and large numbers
  change by half as much (2b).
- After Theme: the label with the value ("17", or "Automatic (17)" while
  following the device), a range input 14–22 in steps of 1, a hint, a sample
  line and "Use the device's size", disabled while following the device.
- `input` changes only the value, `aria-valuetext` and the sample's size, in
  place, so the slider is not rebuilt under the finger. `change` (let go, or
  each arrow key step) stores the size and renders with focus on the slider.
- main.ts `applyTextSize`: reads the device size with the inline size taken
  off, then sets `font-size` in px on <html> (CSSOM, which the CSP allows),
  which wins over all three size rules in styles.css.

## 2b. Headings and large numbers change by half as much
- Every size of 1.25rem or more (h1, h2, the predicted rating, the Top 8
  figures, round ratings, ratings in the players list) is multiplied by
  `--display-scale`, which main.ts sets on <html> with the size:
  (S + D) / (2 × S) for size S and device size D (`displayScale` in
  text-size.ts). Such a size then changes by half as much as body text: at
  22 px on a phone, the predicted rating is 4.5 × 19.5 px instead of 4.5 ×
  22. While following the device the variable is not set and the factor is 1.
- Card titles (1.15rem) change like body text, so they never shrink to it.
- A test checks every size of 1.25rem or more in styles.css.

## 3. Large text on narrow phones
Everything is in rem, so at size S a phone W px wide lays out like a
W × 17 / S phone at the default size: at 22 px, a 360 px Android is like
278 px, below the 320 px the layouts were checked at.
- Segmented controls wrap onto more rows when their words do not fit side by
  side (`flex-wrap`, `min-width: fit-content`), each segment drawing the line
  to its left and above it. A container query (the plan's 6a) would have
  needed a width per control and language, and inline-size containment
  would have changed how the chart's period and x-axis share a row.
- The chart's x-axis segments may wrap now (no `nowrap`).
- From and to: `repeat(auto-fit, minmax(8rem, 1fr))`, two columns where they
  fit at 320 px, one under the other with large text.
- Top 8 figures: `min(1.75rem, 9.5vw)` and `min(0.8rem, 4.3vw)`, unchanged
  at 320 px and the default size.
- The top bar title and the tabs hyphenate a word that does not fit
  ("Inställ-ningar") instead of breaking it anywhere.

## 4. The chart
The chart was drawn in CSS pixels. Now it is drawn in units `textScale`
times smaller than the pixels it is shown at, so its 13 px text, margins,
tick spacing and marks grow with the text, and the card's chart keeps its
height on the screen. Tap reach (24 px) and the tooltip offset stay in
screen pixels. The device size and the scale are read in `applyTextSize`.

## 5. Ko-fi on the Rating tab
`supportLink()` at the bottom of the Rating tab, before the unofficial
notice, as in Settings. No new text. In every view the line has class
`support` with one shared spacing: 1.75rem above, 1rem to what follows (the
notice, or Back on How it works).

## Not scaled, on purpose
Borders, outlines, underlines, strokes, the shadow, the chart's 36 px
corner button and 18 px icon. Media queries (48rem, 64rem, 40rem high)
measure in the browser's default size, so breakpoints stay where they are.

## Part 2 (after part 1 is merged): A− / A+ on How it works
- `AppData.guideTextStep`, -8..+14, default 0. The page's size is
  clamp(global size + step, 14, 28): this page may go above the 22 px the
  Settings slider stops at, for reading. A− is disabled at 14, A+ at 28,
  Reset at 0. The step range reaches 28 from 14 and 14 from 22. The step
  stays when the global size changes.
- The `.guide` section gets the size in px; its headings and list padding
  move to em so they follow. A toolbar at the top, updated in place so
  scroll and focus stay. Labels from the catalog in English and Swedish.
