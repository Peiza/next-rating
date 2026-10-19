import type { PageKind } from '../parsers';
import { ParseError, asRecord } from '../parsers/values';
import { cleanParts, type ImportParts } from './records';

/*
 * The hand-off from the bookmarklet: one versioned envelope with a status
 * code, so the app shows every message in the user's language, and the raw
 * records read from pdga.com.
 */

export const HANDOFF_VERSION = 1;

export const STATUSES = ['ok', 'partial', 'challenge', 'unsupported-page', 'error'] as const;
/**
 * ok: everything was read. partial: some pages could not be fetched.
 * challenge: pdga.com answered with a Cloudflare challenge, so fetching
 * stopped. unsupported-page: not a player or event page. error: the page
 * could not be read.
 */
export type HandoffStatus = (typeof STATUSES)[number];

const PAGE_KINDS = ['details', 'profile', 'event', 'challenge', 'unknown'] as const satisfies readonly PageKind[];

/** Pages that could not be fetched, at most this many. */
export const MAX_FAILED = 20;

const VERSION = /^\d+(?:\.\d+){0,2}$/;
const PDGA_PAGE = /^https:\/\/www\.pdga\.com\/(?:player\/\d{1,8}(?:\/details)?|tour\/event\/\d{1,8})$/;

export interface Envelope extends ImportParts {
  v: typeof HANDOFF_VERSION;
  status: HandoffStatus;
  /** The kind of page the bookmarklet ran on. */
  page: PageKind;
  /** The bookmarklet's version. */
  bookmarklet: string;
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

/** Keeps only pdga.com player and event pages, without duplicates. */
function failedPages(value: unknown): string[] {
  if (!Array.isArray(value)) throw new ParseError('malformed', 'failed pages is not a list');
  const urls = value.filter((url): url is string => typeof url === 'string' && PDGA_PAGE.test(url));
  return [...new Set(urls)].slice(0, MAX_FAILED);
}

/**
 * Validates a decoded envelope. Throws VersionError for an unknown version
 * and ParseError for anything else that is wrong. Unknown fields are dropped.
 */
export function validateEnvelope(value: unknown): Envelope {
  const record = asRecord(value, 'hand-off');
  if (record.v !== HANDOFF_VERSION) throw new VersionError(record.v);
  const bookmarklet = record.bookmarklet;
  if (typeof bookmarklet !== 'string' || bookmarklet.length > 20 || !VERSION.test(bookmarklet)) {
    throw new ParseError('malformed', 'bookmarklet version is not valid');
  }
  return {
    v: HANDOFF_VERSION,
    status: oneOf(record.status, STATUSES, 'status'),
    page: oneOf(record.page, PAGE_KINDS, 'page kind'),
    bookmarklet,
    ...cleanParts(record),
    ...(record.failed !== undefined && { failed: failedPages(record.failed) }),
  };
}
