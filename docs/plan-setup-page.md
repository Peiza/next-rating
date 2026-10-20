# Setup page plan (CLAUDE.md Architecture 4, the open part)

## Context

The setup page is still the minimal one built with the bookmarklet: the
code, a copy button and three short lists. This step completes it with the
full step-by-step installation, and adds two things: a bookmarklet status
from the last hand-off, and a "How it works" page that the card
explanations on the Rating tab link to. Feedback from testing the Rating tab
design pass comes first.

Agreed: a picker (iPhone / Android / Computer), preselected from the device,
shows only that browser's numbered steps.

Branch `setup-page`, one pull request.

## Commits

0. **Feedback from the design pass**:
   - Why it changed starts with the net total, such as "Net +0.3, rounds to
     no change": the sum of the lines (the difference line included), so a
     long list whose effects offset each other does not look like a big
     change.
   - Statistics is renamed Details ("Detaljer"). "Unrounded prediction" is
     labelled the weighted average; "Average in window" and "Average of
     counted rounds" are marked unweighted, since the newest 25% count twice
     in the prediction.
   - The official rating line shows the calculated value, such as "Official
     rating 978 (calculated 977.65)", from the official state, only when
     that state rounds to the official rating (otherwise the difference line
     explains the gap). How it works says the decimals come from the whole
     round ratings on pdga.com, so PDGA's own internal decimals may differ.
1. **Bookmarklet status**: `AppData.bookmarklet` stores the version from the
   last valid hand-off (validated with the envelope's version pattern),
   whatever the import status. One line in Settings and on the setup page:
   "Your bookmarklet: 1.0.0, up to date", "…, a newer one (1.1.0) is
   available", or "no import in this browser yet". The storage rule gets
   "the bookmarklet version from the last hand-off".
2. **Full setup page**: status line, intro, a segmented picker guessed from
   the user agent (iPhone, iPad and touch Macs give iPhone), numbered step
   cards for the chosen browser with Copy first and "Try it" last (opens
   your ratings details on pdga.com), and "If it doesn't work" as a
   `<details>`.
3. **How it works page**: sections about, data, rules, rounds, why, target,
   top8, each h2 with `id="guide-<section>"`. Opened from Settings and from a
   "How it works" link at the end of each card's one-liner, which opens the
   matching section with focus on it. The rules section is honest that two
   things are not yet checked against a real player: the weighting of short
   rounds, and how PDGA judges two low rounds in the same window. The
   overlay state in main.ts covers both setup and How it works.
4. **Docs**: Architecture 4's open part to docs/finished-steps.md, CLAUDE.md,
   README.

## Verification
`npm run typecheck`, `npm test`, `npm run check:i18n` and `npm run build`.
No preview server; tested on the phone after merging.
