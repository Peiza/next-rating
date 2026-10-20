import type { Envelope, HandoffPage } from '../handoff/envelope';
import { MAX_PAYLOAD, packText } from '../handoff/pack';
import { detectPage } from '../parsers/page';
import { BOOKMARKLET_VERSION } from './version';

/*
 * What the bookmarklet sends from pdga.com, read in the user's own browser
 * session. It parses nothing: it sends the HTML of the page parts the app's
 * extractors read, and the app parses them, so a markup
 * change on pdga.com is fixed by deploying the app. The bookmarklet only
 * decides which pages to fetch: on a player page it fetches the other player
 * page, then recent events that the ratings details do not include yet,
 * with only this player's rows. Requests are same-origin GETs, one at a
 * time, about a second apart, one attempt each. Hidden round ratings on
 * Unofficial Results pages are in the HTML either way; nothing is clicked.
 */

export const PDGA_ORIGIN = 'https://www.pdga.com';
/** Event pages fetched at most in one run. */
export const MAX_EVENT_PAGES = 10;
/** Milliseconds between requests. */
export const REQUEST_GAP = 1000;

export type ContentKind = 'details' | 'profile' | 'event';

/** The main content of each kind of page. Without it, the whole body is sent. */
const MAIN: Record<ContentKind, string> = {
  details: '#player-results-details',
  profile: 'table[id^="player-results-"]',
  event: '.leaderboard',
};

/** The other parts the extractors read. Hole counts sit in .tooltip-templates, inside .leaderboard on event pages. */
const PARTS: Record<ContentKind, string> = {
  details: '.current-rating,.tooltip-templates',
  profile: '.current-rating',
  event: '.tournament-date',
};

/** The player's results rows, on both player pages. */
const RESULT_ROWS = 'table[id^="player-results-"] tr';

const MONTHS = 'janfebmaraprmayjunjulaugsepoctnovdec';

export interface CollectDeps {
  /** A same-origin GET of a pdga.com path. Rejects on network errors. */
  fetch: (path: string) => Promise<Response>;
  /** Parses HTML into an inert document: no scripts run, nothing loads. */
  parse: (html: string) => Document;
  wait: (ms: number) => Promise<void>;
  /** Pages done out of pages planned so far. */
  progress: (done: number, planned: number) => void;
}

/**
 * The HTML of the parts of a page that the app reads. When the main content
 * is missing, as after a markup change on pdga.com, it is the whole body
 * instead, so an updated app can still read it. The body is copied into an
 * inert document, where its scripts and styles are removed; the page itself
 * is never changed.
 */
export function pageHtml(doc: Document, kind: ContentKind): string {
  let parts: (Element | null)[];
  if (doc.querySelector(MAIN[kind])) {
    parts = [...doc.querySelectorAll(`link[rel=canonical],#page-title,${PARTS[kind]},${MAIN[kind]}`)];
  } else {
    const body = doc.implementation.createHTMLDocument('').importNode(doc.body, true);
    for (const element of body.querySelectorAll('script,style')) element.remove();
    parts = [doc.querySelector('link[rel=canonical]'), body];
  }
  return parts.map((element) => element?.outerHTML ?? '').join('');
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

/** Event ids and dates from the rows of a player page's results tables. */
function eventRows(doc: Document): [string, number][] {
  return [...doc.querySelectorAll(RESULT_ROWS)].flatMap((row): [string, number][] => {
    const id = /\/tour\/event\/(\d+)/.exec(row.querySelector('a[href*="/tour/event/"]')?.getAttribute('href') ?? '')?.[1];
    return id ? [[id, dateKey(row.textContent ?? '')]] : [];
  });
}

/** Ids of profile events that are newer than the ratings details and not in them, newest first. */
export function newEventIds(details: Document, profile: Document): string[] {
  const rated = eventRows(details);
  const ids = new Set(rated.map(([id]) => id));
  const newest = Math.max(0, ...rated.map(([, date]) => date));
  const found = new Map<string, number>();
  for (const [id, date] of eventRows(profile)) {
    if (!ids.has(id) && date >= newest) found.set(id, date);
  }
  return [...found]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_EVENT_PAGES)
    .map(([id]) => id);
}

/**
 * Removes every results row of other players from a fetched event page (an
 * inert document of our own). Without PDGA number cells, as after a markup
 * change, it removes nothing.
 */
export function keepPlayerRows(doc: Document, pdgaNumber: string): void {
  if (!doc.querySelector('td.pdga-number')) return;
  for (const row of doc.querySelectorAll('tr')) {
    if (row.querySelector('td') && row.querySelector('td.pdga-number')?.textContent?.trim() !== pdgaNumber) row.remove();
  }
}

export async function collect(doc: Document, url: string, deps: CollectDeps): Promise<Envelope> {
  const page = detectPage(doc, url);
  const envelope: Envelope = { v: 2, status: 'ok', page, bookmarklet: BOOKMARKLET_VERSION };
  const path = new URL(url).pathname.replace(/\/$/, '');
  const pages: HandoffPage[] = [];
  const failed: string[] = [];
  let done = 1;
  let planned = 1;

  /**
   * Fetches one page. After a challenge or a failure, nothing more is
   * fetched: this page and every later one are listed as failed instead.
   */
  async function fetchPage(path: string, kind: ContentKind): Promise<Document | undefined> {
    if (envelope.status === 'ok') {
      await deps.wait(REQUEST_GAP);
      try {
        const response = await deps.fetch(path);
        const fetched = deps.parse(await response.text());
        const found = detectPage(fetched, response.redirected ? response.url : PDGA_ORIGIN + path);
        if (response.headers.get('cf-mitigated') === 'challenge' || found === 'challenge') {
          envelope.status = 'challenge';
        } else if (response.ok && found === kind) {
          return fetched;
        }
      } catch {
        // A network error, or a response that could not be read.
      } finally {
        deps.progress(++done, planned);
      }
      if (envelope.status === 'ok') envelope.status = 'partial';
    }
    failed.push(PDGA_ORIGIN + path);
    return undefined;
  }

  try {
    if (page === 'event') {
      pages.push({ url: PDGA_ORIGIN + path, html: pageHtml(doc, page) });
    } else if (page === 'challenge') {
      envelope.status = 'challenge';
      failed.push(PDGA_ORIGIN + path);
    } else if (page !== 'details' && page !== 'profile') {
      envelope.status = 'unsupported-page';
    } else {
      const pdgaNumber = /^\/player\/(\d+)/.exec(path)![1]!;
      const other = page === 'details' ? `/player/${pdgaNumber}` : `/player/${pdgaNumber}/details`;
      const otherKind = page === 'details' ? 'profile' : 'details';
      pages.push({ url: PDGA_ORIGIN + path, html: pageHtml(doc, page) });
      planned = 2;
      deps.progress(done, planned);
      const fetched = await fetchPage(other, otherKind);
      if (fetched) {
        pages.push({ url: PDGA_ORIGIN + other, html: pageHtml(fetched, otherKind) });
        const [details, profile] = page === 'details' ? [doc, fetched] : [fetched, doc];
        // Without a readable details table, every event would look new.
        const ids = details.querySelector(MAIN.details) ? newEventIds(details, profile) : [];
        planned += ids.length;
        for (const id of ids) {
          const eventPath = `/tour/event/${id}`;
          const event = await fetchPage(eventPath, 'event');
          if (event) {
            keepPlayerRows(event, pdgaNumber);
            pages.push({ url: PDGA_ORIGIN + eventPath, html: pageHtml(event, 'event') });
          }
        }
      }
    }
  } catch {
    envelope.status = 'error';
  }
  if (pages.length > 0) envelope.pages = pages;
  if (failed.length > 0) envelope.failed = failed;
  deps.progress(planned, planned);
  return envelope;
}

/**
 * Packs the envelope for the URL fragment. While it is too large, fetched
 * event pages are dropped from the end and listed as failed, so the user can
 * run the bookmarklet on them one by one. The page it ran on is always kept.
 */
export async function packEnvelope(envelope: Envelope, limit = MAX_PAYLOAD): Promise<string> {
  for (;;) {
    const payload = await packText(JSON.stringify(envelope));
    const pages = envelope.pages ?? [];
    const last = pages[pages.length - 1];
    if (payload.length <= limit || pages.length < 2 || !last!.url.includes('/tour/event/')) return payload;
    pages.pop();
    envelope.failed = [...(envelope.failed ?? []), last!.url];
    if (envelope.status === 'ok') envelope.status = 'partial';
  }
}
