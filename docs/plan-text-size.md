# Plan: adjustable text size

A text size slider in Settings for the whole app (part 1), then A− / A+
buttons on How it works that change only that page (part 2, after part 1 is
merged). Part 1 also puts the Ko-fi link at the bottom of the Rating tab.
Both are built.

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
  following the device), a range input 14–22 in steps of 1 with Reset beside
  it (disabled while following the device), a hint and a sample line. See
  "Polish after part 2" for why Reset sits there.
- `input` changes only the value, `aria-valuetext` and the sample's size, in
  place, so the slider is not rebuilt under the finger. `change` (let go, or
  each arrow key step) stores the size and renders with focus on the slider.
- main.ts `applyTextSize`: reads the device size with the inline size taken
  off, then sets `font-size` in px on <html> (CSSOM, which the CSP allows),
  which wins over all three size rules in styles.css.

## 2b. Headings and large numbers change by half as much
- Every size of 1.25rem or more (h1, h2, the predicted rating, the Top 8
  figures, round ratings, ratings in the players list, the target answer's
  figure) is multiplied by
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

## Part 2 (built): A− / A+ on How it works
- `AppData.guideTextStep`, -8..+18 (`GUIDE_TEXT_STEPS` in storage.ts),
  default 0. The page's size is clamp(global size + step, 14, 32)
  (`guideTextSize` in text-size.ts): this page may go above the 22 px the
  Settings slider stops at, for reading. The global size is the size picked
  in Settings or the device's. The step range reaches 32 from 14 and 14 from
  22. The step stays when the global size changes. (Built with 28 px and
  +14 at most, raised to 32 px after phone testing; stored steps stay valid.)
- At step 0 the page has no size of its own and follows the app exactly.
  Otherwise whole pixels. When the app's own size is outside 14–32 (the larger
  iPhone accessibility Dynamic Type sizes, a tiny browser default), the range
  widens to include it, so a tap never takes the page past the app's size
  the wrong way.
- A− and A+ step one pixel from the size shown (`nextGuideStep`), not from
  the step stored, which the range may have cut: 22 + 18 shows 32, and A−
  then shows 31 (step +9). A button is disabled where it would change
  nothing (`canStepGuide`), Reset at step 0.
- The `.guide` section gets the size in px and its own `--display-scale`
  (`displayScale(size, device size)`), so headings still change by half as
  much. Its h1 and h2 sizes, h2 margins, paragraph and list spacing and the
  list padding are in em; with no size of its own, em is rem and the page
  looks as before.
- The toolbar under the heading (first on phones): "Text size", the size,
  A− ("Smaller text"), A+ ("Larger text") and Reset, a group with labels
  from the catalog in English and Swedish. It keeps the app's size
  (`font-size: 1rem`), so A+ does not move under the finger. It changes the
  page in place, so scroll and focus stay; a button that becomes disabled
  passes focus to the other size button.

## Copy step on the setup page (with part 2)
The bookmarklet's code box sat about 3rem below its Copy button (an empty
status line and the field's margin), more at large text. The status line
now takes no space until it says Copied (`.copy-status:empty`), and 0.5rem
is left above the code's label.

## Polish after part 2 (from phone testing)
- How it works goes up to 32 px (part 2 above).
- Settings: "Use the device's size" broke onto a row of its own at 22 px.
  The button is now "Reset" ("Återställ") on the slider's row
  (`.range-row`): the slider gives way (`flex: 1 1 0; min-width: 0`), the
  button keeps one line (`white-space: nowrap`), so the row never wraps. The
  hint says what Reset does: "Reset goes back to the device's size."
- Target calculator: every line of the answer was bold (`.status`), so the
  key result was lost. Now the answer leads with one large figure
  (`.target-figure`, the only bold): the average needed, or when the target
  is already reached, the rating it reaches. A sentence in normal weight
  says what the figure is ("Average round rating needed in your next 3
  rounds to reach 1000 at the 10 Nov update."), then muted notes: what keeps
  a reached target, the date and report deadline ("Last round on …, report
  deadline 8 Nov.", or the missed-deadline sentence) and the rounds that
  leave the window, their ratings in normal weight. Out of reach has no
  figure: "Out of reach in 3 rounds." is the bold line, then "Even 3 rounds
  rated 1150 give 991 at the 10 Nov update." Errors stay bold.
- Rating figures never wrap: body's `overflow-wrap: anywhere` let the
  Rounds card's flex row squeeze a rating into "10/24" beside a long status
  ("Counts in a later update") at 22 px. `.round-rating` now keeps its width
  (`flex: none`) and one line, and the status wraps beside it. Every rating
  and change figure has `white-space: nowrap`: the prediction, the following
  update's rating and change, round ratings (also manual rounds), Top 8 rows
  and figures, the players list, the target figure and the rounds that
  leave the window; the text around them wraps. A stylesheet test checks
  the list.
