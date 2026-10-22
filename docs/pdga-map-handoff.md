# PDGA rating map: handoff brief

Starting point for a new app: a better, multi-country version of a PDGA rating map (inspired by jacobk.github.io/ratingkartan), possibly combined with Next Rating ([https\://peiza.github.io/next-rating/](https://peiza.github.io/next-rating/), repo Peiza/next-rating). Written so a fresh Claude Code session can plan the project. Nothing has been built yet.

## Background

- The owner earlier ran a similar map in a Google Sheet; it stopped working when PDGA blocked Google Apps Script.  
- Requests from servers to pdga.com pages are refused (checked October 2026), so scraping pages through a proxy is not an option, and it would break the terms anyway.  
- The owner is a current PDGA member and has signed the PDGA API License Agreement (October 2026). The official REST API is therefore the way in.

## The PDGA REST API (as documented October 2026\)

Docs: [https\://www\.pdga.com/dev/api/rest/v1/auth](https://www.pdga.com/dev/api/rest/v1/auth) and [https\://www\.pdga.com/dev/api/rest/v1/services](https://www.pdga.com/dev/api/rest/v1/services). Base URL `https://api.pdga.com`.

Authentication: `POST /services/json/user/login` with username and password returns `session_name`, `sessid` and a CSRF `token`. Every call then sends `Cookie: <session_name>=<sessid>`. Logout: `POST /services/json/user/logout`.

Services (all GET, `limit` default 10, max 200, `offset` for paging):

| Service | Filters | Returns |
| :---- | :---- | :---- |
| `/services/json/players` | pdga\_number, first/last name, class (P/A), city, state\_prov, country (2 letters), last\_modified | name, pdga\_number, membership status and expiry, classification, city, state\_prov, country, rating, rating\_effective\_date, official status, last\_modified. No rating for members who are not current. |
| `/services/json/player-statistics` | year, class, division\_code, continent, country, state\_prov, gender, pdga\_number, last\_modified | name, pdga\_number, rating, year, class, gender, division, country, state\_prov, tournaments, rating\_rounds\_used, points, prize. Members current and active in that year. |
| `/services/json/event` | tournament\_id, name, start/end date, country, state, province, tier, classification | event details incl. latitude/longitude, dates, tier, status, URLs |
| `/services/json/course` | name, postal code, city, country, state\_prov, lat/lon, course\_id | course details incl. coordinates, holes, lengths, amenities |

Not available: ratings history and round-by-round ratings. No rate limits are documented; the agreement only forbids use that affects PDGA's servers or other API users.

## License terms that shape the design

From the signed agreement (paraphrased; read the full text when logged in):

- **No permanent storage.** Data may only be stored or cached temporarily, as needed to run the app and improve performance, with cache invalidation so users see current data. No database of PDGA data, no bulk downloads. Only PDGA record IDs (pdga\_number, tournament\_id, course\_id) may be kept, for back-end matching. So: no monthly snapshots, no self-built rating history.  
- **Attribution on every screen with PDGA data:** "Player, event, and course data provided by PDGA." with a link to pdga.com. Every player, event and course name links to its page on pdga.com. "PDGA Authorized Developer" may be shown.  
- **Account is personal and confidential.** Keep credentials server-side (Worker secrets), never in the app or the repo.  
- **Not on behalf of others**, not implying PDGA endorsement, non-commercial.  
- **PDGA may review** the app, ask for screenshots before launch, and judge whether a use is "more competitive than complementary". They can revoke access at any time, and data must be removed within 24 h on request.  
- Contact [dev@pdga.com](mailto:dev@pdga.com) when a use is not covered, needs an exception, or a finished app should be reviewed before public launch.

## Suggested architecture (same family as SwimDeck)

static web app (GitHub Pages)  ──►  Cloudflare Worker (login \+ short edge cache)  ──►  api.pdga.com

- The Worker logs in with the owner's account (secrets), keeps the session, exposes a few narrow routes (players by country/region, player by number, events/courses near a point) and caches answers for hours, not months.  
- The app stores only the user's own settings and PDGA numbers locally.  
- A whole country is many pages of 200\. Fetch lazily (per region, on demand), cache at the edge, and **ask PDGA first** whether a country-wide map view is acceptable or counts as a bulk download.

## Possible features (to plan, not build blindly)

- Map of players by region with rating distributions, per country.  
- Filters: division, gender, class, active this year (player-statistics).  
- Events and courses as map layers (both have coordinates).  
- Combined with Next Rating: look up a player's current official rating and membership through the API instead of the bookmarklet; keep the bookmarklet for round data the API does not provide.

## First steps for the new session

1. Read this brief and the API docs above. Do not store real PDGA data in the repo or in fixtures; invent test data shaped like the API answers.  
2. Write a short plan: features, Worker routes, cache times, attribution, and the questions to send to [dev@pdga.com](mailto:dev@pdga.com) (country-wide views, call volume, review before launch).  
3. Draft the email to [dev@pdga.com](mailto:dev@pdga.com) for the owner to send.  
4. Only then scaffold the repo (app \+ Worker \+ tests \+ GitHub Actions), with the API credentials as GitHub/Cloudflare secrets added by the owner.

Owner preferences carried over from SwimDeck: commits authored by the owner only, no AI attribution lines in commits, PRs or files; public repo; no names or personal details of real people in the repo.
