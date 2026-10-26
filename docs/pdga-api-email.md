# Email to dev@pdga.com

**Draft, not sent.** The owner sends it from their own email address and fills
in the bracketed parts. Check the section number in question 2 against your
copy of the agreement before sending. The plan is docs/plan-pdga-api.md.

---

**To:** dev@pdga.com
**Subject:** API use for Next Rating, an unofficial rating predictor: questions before launch

Hello,

I am a current PDGA member [#PDGA number] and signed the PDGA API License
Agreement in October 2026. Before anything goes live, I would like to check a
planned use with you, since it touches several of the points your developer
page asks me to contact you about.

**The app.** Next Rating (https://peiza.github.io/next-rating/) is a free,
open-source web app. It predicts a player's next rating from their rated
rounds. It has no ads, no accounts and nothing to buy. The app states that it
is an unofficial tool, not affiliated with or endorsed by the PDGA. Today it
gets its data only from pages the user opens on pdga.com in their own browser.

**Donations.** To be open about it: the app has a plain link to my Ko-fi page
(https://ko-fi.com/peiza), where anyone can leave a voluntary tip. Every
feature is free with or without a tip, and the tips are small and cover my
own time. Your developer page says the API is for non-commercial use, so I
would like your view on this before using the API.

**The planned use of the API.**
- When a player is shown in the app, it looks up that one player's current
  official rating, rating effective date and membership status through
  `/services/json/players?pdga_number=N&limit=1`. It makes no other calls: no
  lists, no bulk downloads, no background or scheduled fetching.
- The calls go through a small server (a Cloudflare Worker) that logs in with
  my account and holds my credentials as secrets. The credentials are never
  in the app or in the public code. A server is needed because a browser
  cannot send the API's session cookie itself, and I do not want to ask
  users for their pdga.com passwords.
- Answers are cached for up to 6 hours on the server and up to 12 hours in
  the user's browser, then deleted. Only PDGA numbers are kept beyond that.
  The app keeps no rating history of its own from the API.
- Every screen already carries "Player, event, and course data provided by
  PDGA." with a link to pdga.com, and player names link to their pages on
  pdga.com.

**My questions.**
1. The agreement refers to a Statement of Work and a non-disclosure
   agreement. I have not received either. Do you need a Statement of Work
   for this app, or me to sign an NDA, and if so, could you send them?
2. Other people who use the app would look up their own (or a friend's)
   rating through the server above, which uses my account. Is that allowed,
   or does it count as using the API on behalf of others (section 6.c)? If
   it does, is there a way to do it that you would accept?
3. Does a voluntary tip link like the one above count as commercial use? If
   it does, I can remove it from the screens that show API data, or from the
   app altogether.
4. Is the API meant to be called directly from browsers (CORS)? If not, I
   take it that a server like the one above is the expected setup.
5. Are the cache times above acceptable, or would you like them shorter or
   longer?
6. Is there a call volume you would like me to stay under? I expect [a few
   hundred] lookups a day at most, fewer thanks to the cache.
7. The app is in English and Swedish. May the attribution sentence be
   translated into Swedish, or should it stay in English? Today it is in
   English in both languages.
8. Your page says I may show "PDGA Authorized Developer". The app also says
   it is not affiliated with or endorsed by the PDGA. Would you like the
   label shown, and how should the two sit together? If you would like the
   PDGA logo beside the attribution, may the logo files be kept in the app's
   public GitHub repository?
9. Your page mentions a review before public launch. How do I submit the app
   for it, and would screenshots and a test link be enough? I understand
   that my access depends on my membership staying current.

Nothing using the API goes live until I have your answer.

Best regards,
[Name]
[PDGA number]
