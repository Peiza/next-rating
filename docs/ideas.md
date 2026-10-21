# Ideas (not planned)

None of these is planned. Don't build any of them until it is moved into the
Process list in CLAUDE.md.

1. Prediction in the players list: each saved player's predicted rating and
   change arrow next to their name, from stored data, so the whole group
   shows at a glance.
2. Share the prediction: a Share button that opens the phone's share menu
   (Web Share API) with a choice of text and link (the default), text only,
   or link only, remembered with the settings. The text is short, for
   example "Name: 998 (−1) at the November update". The link opens the app
   with a read-only snapshot in the URL fragment (in a key of its own, since
   #d= is reserved for the bookmarklet hand-off): the name, PDGA number,
   official rating, prediction, update date, snapshot date and the top
   reasons from Why it changed, and manual rounds only when ticked before
   sharing. The app treats the snapshot as untrusted, like a hand-off:
   strict schema validation, size limits, text only.
3. Personal bests and milestones: mark the player's highest rated round and
   when the rating passes a round number such as 950 or 1000.
4. Following update too: when some rounds count only in the following update
   (dated after the report deadline), also show the prediction for that
   update, so both are visible.
5. Official rating history in the chart: the player's official rating after
   each update, from pdga.com's ratings history page, as a stepped line in the
   rating chart. It needs one more page in the bookmarklet (so a new
   bookmarklet version and a higher page limit), a parser for that page and a
   place in the stored import. Until then the chart draws the official
   rating and the prediction only across the current window, and links to
   that page (Chart follow-up in docs/finished-steps.md).
6. Zoom in the chart: pinch to zoom and drag to pan, so a short stretch of a
   long period can be read without changing the period.
7. Average over a stretch of the chart: select a period with two fingers, as
   in Garmin's charts, to show the rating average of the rounds in it.
8. Share as an image: a picture of the prediction or the chart for the share
   menu, apart from the text and link in idea 2.
