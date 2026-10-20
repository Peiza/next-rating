import type { PageKind } from '../parsers';
import { LIMITS, ParseError, asList, asRecord } from '../parsers/values';

/*
 * The hand-off from the bookmarklet: one versioned envelope with a status
 * code, so the app shows every message in the user's language, and the HTML
 * of the pdga.com pages it read. The bookmarklet does not parse anything:
 * the app parses the HTML (src/app/handoff.ts),
 * so a change in pdga.com's markup is fixed by deploying the app.
 */

export const HANDOFF_VERSION = 2;

export const STATUSES = ['ok', 'partial', 'challenge', 'unsupported-page', 'error'] as const;
/**
 * ok: everything was read. partial: some pages could not be fetched.
 * challenge: pdga.com answered with a Cloudflare challenge, so fetching
 * stopped. unsupported-page: not a player or event page. error: the page
 * could not be read.
 */
export type HandoffStatus = (typeof STATUSES)[number];

const PAGE_KINDS = ['details', 'profile', 'event', 'challenge', 'unknown'] as const satisfies readonly PageKind[];

/** Pages in one hand-off: the current page, the other player page and up to 10 event pages. */
export const MAX_PAGES = 12;
/** Pages that could not be fetched, at most this many. */
export const MAX_FAILED = 20;

const VERSION = /^\d+(?:\.\d+){0,2}$/;

/** A bookmarklet version as a hand-off carries it, such as "1.0.0". */
export function isBookmarkletVersion(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 20 && VERSION.test(value);
}
export const PDGA_PAGE = /^https:\/\/www\.pdga\.com\/(?:player\/\d{1,8}(?:\/details)?|tour\/event\/\d{1,8})$/;

/** A pdga.com page as the bookmarklet sent it: the parts the app reads, as HTML. */
export interface HandoffPage {
  url: string;
  html: string;
}

export interface Envelope {
  v: typeof HANDOFF_VERSION;
  status: HandoffStatus;
  /** The kind of page the bookmarklet ran on. */
  page: PageKind;
  /** The bookmarklet's version. */
  bookmarklet: string;
  pages?: HandoffPage[];
  /** pdga.com pages that could not be fetched, for the user to open. */
  failed?: string[];
}

export class VersionError extends Error {
  constructor(version: unknown) {
    super(`unknown hand-off version ${String(version)}`);
    this.name = 'VersionError';
  }
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new ParseError('malformed', `unknown ${what}`);
}

function pages(value: unknown): HandoffPage[] {
  return asList(value, MAX_PAGES, 'pages').map((item) => {
    const page = asRecord(item, 'page');
    const { url, html } = page;
    if (typeof url !== 'string' || !PDGA_PAGE.test(url)) throw new ParseError('malformed', 'page is not a pdga.com page');
    if (typeof html !== 'string') throw new ParseError('malformed', 'page HTML is not text');
    if (html.length > LIMITS.html) throw new ParseError('too-large', 'page HTML is too large');
    return { url, html };
  });
}

/** Keeps only pdga.com player and event pages, without duplicates. */
function failedPages(value: unknown): string[] {
  if (!Array.isArray(value)) throw new ParseError('malformed', 'failed pages is not a list');
  const urls = value.filter((url): url is string => typeof url === 'string' && PDGA_PAGE.test(url));
  return [...new Set(urls)].slice(0, MAX_FAILED);
}

/**
 * Validates a decoded envelope. Throws VersionError for an unknown version
 * and ParseError for anything else that is wrong. Unknown fields are dropped.
 * The page HTML stays untrusted: it is only ever parsed into an inert document.
 */
export function validateEnvelope(value: unknown): Envelope {
  const record = asRecord(value, 'hand-off');
  if (record.v !== HANDOFF_VERSION) throw new VersionError(record.v);
  const bookmarklet = record.bookmarklet;
  if (!isBookmarkletVersion(bookmarklet)) {
    throw new ParseError('malformed', 'bookmarklet version is not valid');
  }
  return {
    v: HANDOFF_VERSION,
    status: oneOf(record.status, STATUSES, 'status'),
    page: oneOf(record.page, PAGE_KINDS, 'page kind'),
    bookmarklet,
    ...(record.pages !== undefined && { pages: pages(record.pages) }),
    ...(record.failed !== undefined && { failed: failedPages(record.failed) }),
  };
}
