import type { Envelope, HandoffPage, HandoffStatus } from '../handoff/envelope';
import { MAX_PAYLOAD, packText } from '../handoff/pack';
import type { PageKind } from '../parsers/page';
import { BOOKMARKLET_VERSION } from './version';

/*
 * What the bookmarklet sends from pdga.com, read in the user's own browser
 * session. It parses nothing: it sends the HTML of the page parts the app's
 * extractors read, and the app parses them, so a markup
 * change on pdga.com is fixed by deploying the app. The bookmarklet only
 * decides which pages to fetch: on a player page it fetches the other player
 * page, then recent events that the ratings details do not include yet,
 * with only this player's rows, and last the ratings history. On any other
 * page of a player it sends that page alone, so the app can read a page it
 * learns later without a new bookmarklet. Requests are same-origin GETs, one at a
 * time, about a second apart, one attempt each. Hidden round ratings on
 * Unofficial Results pages are in the HTML either way; nothing is clicked.
 */

export const PDGA_ORIGIN = 'https://www.pdga.com';
/** Event pages fetched at most in one run. */
export const MAX_EVENT_PAGES = 10;
/** Milliseconds between requests. */
export const REQUEST_GAP = 1000;

export type ContentKind = 'details' | 'profile' | 'season' | 'history' | 'event';

/** The player's results tables, on both player pages and a season. */
const RESULTS = 'table[id^="player-results-"]';

/**
 * For each kind of page: its main content, and the other parts the
 * extractors read. Without the main content, or for a kind not listed, the
 * whole body is sent. Hole counts sit in .tooltip-templates, inside
 * .leaderboard on event pages.
 */
const PARTS: Record<ContentKind, [main: string, parts: string]> = {
  details: ['#player-results-details', '.current-rating,.tooltip-templates'],
  profile: [RESULTS, '.current-rating'],
  season: [RESULTS, '#page-title'],
  history: ['#player-results-history', '.current-rating'],
  event: ['.leaderboard', '.tournament-date'],
};

/**
 * Any other page of a player, sent alone, in the shape the app's hand-off
 * check accepts: /player/<nr>/<word>, with a year after it as on a season.
 */
const PLAYER_PAGE = /^\/player\/\d+\/[a-z]{1,20}(\/\d{4})?$/;

/** A player's profile, details, history and season pages, and an event, by path. */
const KIND = /^\/(?:player\/\d+(?:\/(details|history)|\/(stats)\/\d{4})?|tour\/(event)\/\d+)\/?$/;

/**
 * The kind of pdga.com page at a path, as detectPage (src/parsers/page.ts)
 * tells it from a URL. The bookmarklet always knows the URL, so it does
 * without detectPage's canonical link, and stays smaller.
 */
export function pageKind(path: string): PageKind {
  const [found, player, season, event] = KIND.exec(path) ?? [];
  return (found ? (player ?? (season ? 'season' : (event ?? 'profile'))) : 'unknown') as PageKind;
}

/** Cloudflare's challenge: a kind of page, a status and the value of its cf-mitigated header. */
const CHALLENGE = 'challenge';

/** A Cloudflare challenge, recognised by its own markers as in detectPage. A document's title comes trimmed. */
export function isChallenge(doc: Document): boolean {
  return /^just a moment/i.test(doc.title) || !!doc.querySelector('#challenge-form,script[src*="challenge-platform"]');
}

const MONTHS = 'janfebmaraprmayjunjulaugsepoctnovdec';

export interface CollectDeps {
  /** A same-origin GET of a pdga.com path. Rejects on network errors. */
  fetch: (path: string) => Promise<Response>;
  /** Parses HTML into an inert document: no scripts run, nothing loads. */
  parse: (html: string) => Document;
  wait: (ms: number) => Promise<void>;
  /** Pages done out of pages planned so far. */
  progress: (done: number, planned: number) => void;
  /** Now, on the device, which tells whether the previous season is needed. */
  now: Date;
}

/**
 * The HTML of the parts of a page that the app reads. When the main content
 * is missing, as after a markup change on pdga.com, it is the whole document
 * instead, so an updated app can still read it, with its scripts and styles
 * cut from the HTML text to keep it small. The page itself is never changed.
 */
export function pageHtml(doc: Document, kind: PageKind): string {
  const [main, others] = PARTS[kind as ContentKind] ?? [];
  return main && doc.querySelector(main)
    ? [...doc.querySelectorAll(`link[rel=canonical],#page-title,${others},${main}`)].map((part) => part.outerHTML).join('')
    : // Serialized HTML closes every element with a plain end tag, so this finds each one's end.
      doc.documentElement.outerHTML.replace(/<(script|style)[\s>][\s\S]*?<\/\1>/gi, '');
}

/**
 * A number that sorts pdga.com dates such as "6-Aug-2026" or "1-Aug to
 * 2-Aug-2026" (by the last day), or 0 without a date. Only for ordering;
 * the app parses and validates dates.
 */
export function dateKey(text: string): number {
  const date = /(\d{1,2})-([a-z]{3})-(\d{4})(?!.*\d-[a-z]{3}-)/i.exec(text);
  return date ? +date[3]! * 1e4 + (MONTHS.indexOf(date[2]!.toLowerCase()) / 3 + 1) * 100 + +date[1]! : 0;
}

/** Event ids, from each row's first event link, and dates from the rows of a player page's results tables. */
function eventRows(doc: Document): [string, number][] {
  return [...doc.querySelectorAll(`${RESULTS} tr`)].flatMap((row): [string, number][] => {
    const id = /\/tour\/event\/(\d+)/.exec(row.outerHTML)?.[1];
    return id ? [[id, dateKey(row.textContent!)]] : [];
  });
}

/**
 * Ids of season events that are newer than the ratings details and not in
 * them, newest first: from the profile, and in January also the previous
 * season.
 */
export function newEventIds(details: Document, ...seasons: Document[]): string[] {
  const rated = eventRows(details);
  const ids = new Set(rated.map(([id]) => id));
  const newest = Math.max(0, ...rated.map(([, date]) => date));
  const found = new Map<string, number>();
  for (const [id, date] of seasons.flatMap(eventRows)) {
    if (!ids.has(id) && date >= newest) found.set(id, date);
  }
  return [...found]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_EVENT_PAGES)
    .map(([id]) => id);
}

/**
 * The previous season's results page, from 1 January to the January ratings
 * update (the second Tuesday) on the device's date, when the profile links
 * to it; otherwise null. The profile lists only the current season, so
 * without it a December event not rated yet would be missed.
 */
export function previousSeasonPath(profile: Document, pdgaNumber: string, now: Date): string | null {
  const year = now.getFullYear();
  const update = 8 + ((9 - new Date(year, 0, 1).getDay()) % 7);
  if (now.getMonth() > 0 || now.getDate() > update) return null;
  const path = `/player/${pdgaNumber}/stats/${year - 1}`;
  return profile.querySelector(`.year-link a[href="${path}"]`) ? path : null;
}

/**
 * Removes every results row of other players from a fetched event page (an
 * inert document of our own). Without PDGA number cells, as after a markup
 * change, it removes nothing.
 */
export function keepPlayerRows(doc: Document, pdgaNumber: string): void {
  const cell = 'td.pdga-number';
  if (!doc.querySelector(cell)) return;
  for (const row of doc.querySelectorAll('tr')) {
    if (row.querySelector('td') && row.querySelector(cell)?.textContent?.trim() !== pdgaNumber) row.remove();
  }
}

export async function collect(doc: Document, url: string, deps: CollectDeps): Promise<Envelope> {
  const path = new URL(url).pathname.replace(/\/$/, '');
  const page = isChallenge(doc) ? CHALLENGE : pageKind(path);
  const onDetails = page === 'details';
  // Only on a player's pages, the only ones it fetches from.
  const pdgaNumber = /^\/player\/(\d+)/.exec(path)?.[1] ?? '';
  let status: HandoffStatus = 'ok';
  const pages: HandoffPage[] = [];
  const failed: string[] = [];
  let done = 1;
  let planned = 1;

  /** Adds a page to the hand-off, with the parts the app reads. */
  function keep(path: string, from: Document, kind: PageKind): Document {
    pages.push({ url: PDGA_ORIGIN + path, html: pageHtml(from, kind) });
    return from;
  }

  /**
   * Fetches one page and adds it, an event page with only this player's
   * rows. After a challenge or a failure, nothing more is fetched: this page
   * and every later one are listed as failed instead.
   */
  async function read(path: string, kind: ContentKind): Promise<Document | undefined> {
    if (status === 'ok') {
      await deps.wait(REQUEST_GAP);
      try {
        const response = await deps.fetch(path);
        const fetched = deps.parse(await response.text());
        if (response.headers.get('cf-mitigated') === CHALLENGE || isChallenge(fetched)) {
          status = CHALLENGE;
        } else if (response.ok && (!response.redirected || pageKind(new URL(response.url).pathname) === kind)) {
          // The path was built for this kind, so only a redirect can lead elsewhere.
          if (kind === 'event') keepPlayerRows(fetched, pdgaNumber);
          return keep(path, fetched, kind);
        }
      } catch {
        // A network error, or a page that could not be read.
      } finally {
        deps.progress(++done, planned);
      }
      if (status === 'ok') status = 'partial';
    }
    failed.push(PDGA_ORIGIN + path);
    return undefined;
  }

  try {
    if (page === CHALLENGE) {
      status = CHALLENGE;
      failed.push(PDGA_ORIGIN + path);
    } else if (page === 'event' || (!onDetails && PLAYER_PAGE.test(path))) {
      keep(path, doc, page);
    } else if (!onDetails && page !== 'profile') {
      status = 'unsupported-page';
    } else {
      keep(path, doc, page);
      planned = 3;
      deps.progress(done, planned);
      const fetched = await read(`/player/${pdgaNumber}${onDetails ? '' : '/details'}`, onDetails ? 'profile' : 'details');
      if (fetched) {
        const [details, profile] = onDetails ? [doc, fetched] : [fetched, doc];
        const seasons = [profile];
        const seasonPath = previousSeasonPath(profile, pdgaNumber, deps.now);
        if (seasonPath) {
          planned += 1;
          const season = await read(seasonPath, 'season');
          if (season) seasons.push(season);
        }
        // Without a readable details table, every event would look new.
        const ids = details.querySelector(PARTS.details[0]) ? newEventIds(details, ...seasons) : [];
        planned += ids.length;
        for (const id of ids) await read(`/tour/event/${id}`, 'event');
      }
      // Last, so a failure here costs no event page.
      await read(`/player/${pdgaNumber}/history`, 'history');
    }
  } catch {
    status = 'error';
  }
  deps.progress(planned, planned);
  return {
    v: 2,
    status,
    page,
    bookmarklet: BOOKMARKLET_VERSION,
    ...(pages.length > 0 && { pages }),
    ...(failed.length > 0 && { failed }),
  };
}

/**
 * Packs the envelope for the URL fragment. While it is too large, fetched
 * event pages are dropped from the end and listed as failed, so the user can
 * run the bookmarklet on them one by one. The page it ran on and the player
 * pages, the history after the events included, are always kept.
 */
export async function packEnvelope(envelope: Envelope, limit = MAX_PAYLOAD): Promise<string> {
  for (;;) {
    const payload = await packText(JSON.stringify(envelope));
    const pages = envelope.pages ?? [];
    let last = pages.length - 1;
    while (last > 0 && !pages[last]!.url.includes('/tour/event/')) last -= 1;
    if (payload.length <= limit || last < 1) return payload;
    const [dropped] = pages.splice(last, 1);
    (envelope.failed ??= []).push(dropped!.url);
    if (envelope.status === 'ok') envelope.status = 'partial';
  }
}
