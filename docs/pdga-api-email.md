# Email to dev@pdga.com

**Draft, not sent.** The owner sends it from their own email address and fills
in the bracketed parts. The plan is docs/plan-pdga-api.md.

---

**To:** dev@pdga.com
**Subject:** API use for Next Rating, an unofficial rating predictor: questions before launch

Hello,

I am a current PDGA member [#PDGA number] and signed the PDGA API License
Agreement in October 2026. I would like to check a planned use with you before
anything goes live.

**The app.** Next Rating (https://peiza.github.io/next-rating/) is a free,
non-commercial, open-source web app. It predicts a player's next rating from
their rated rounds. The app states that it is an unofficial tool, not
affiliated with the PDGA. Today it gets its data only from pages the user
opens on pdga.com in their own browser.

**The planned use of the API.**
- When a player is shown in the app, it looks up that one player's current
  official rating, rating effective date and membership status through
  `/services/json/players?pdga_number=N`. It makes no other calls: no lists,
  no bulk downloads, no background or scheduled fetching.
- The calls go through a small server (a Cloudflare Worker) that holds my
  credentials as secrets. The credentials are never in the app or in the
  public code.
- Answers are cached for up to 6 hours on the server and up to 12 hours in
  the user's browser, then deleted. Only PDGA numbers are kept beyond that.
  The app keeps no rating history of its own from the API.
- Every screen that shows API data carries "Player, event, and course data
  provided by PDGA." with a link to pdga.com, and player names link to their
  pages on pdga.com.

**My questions.**
1. Other people who use the app would look up their own (or a friend's)
   rating through my account. Is that acceptable, or does it count as using
   the API on behalf of others?
2. Are the cache times above acceptable, or would you like them shorter or
   longer?
3. The app is in English and Swedish. May the attribution sentence be
   translated into Swedish, or should it stay in English?
4. Would you like to review the app, with screenshots, before it uses the API
   publicly?
5. Is there a call volume you would like me to stay under? I expect [a few
   hundred] lookups a day at most, fewer thanks to the cache.

Nothing using the API goes live until I have your answer.

Best regards,
[Name]
[PDGA number]
