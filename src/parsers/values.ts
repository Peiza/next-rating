import { isPlainDate, type PlainDate } from '../engine/dates';

/*
 * Helpers for the normalize layer, which validates untrusted raw records
 * from the bookmarklet hand-off and from pasted content.
 */

export type ParseErrorCode = 'malformed' | 'too-large';

export class ParseError extends Error {
  readonly code: ParseErrorCode;

  constructor(code: ParseErrorCode, message: string) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
  }
}

export const LIMITS = {
  /** Characters in one text value, such as an event name. */
  text: 300,
  /** Rows in a ratings details table or in all tables of one event. */
  rows: 5000,
  divisions: 100,
  roundsPerRow: 30,
  /** Characters of pasted text. */
  paste: 2_000_000,
} as const;

export const RANGES = {
  rating: [0, 2000],
  score: [1, 998],
  holes: [1, 99],
  id: [1, 99_999_999],
} as const satisfies Record<string, readonly [number, number]>;

/** Scores of 999 mark a DNF round on pdga.com. */
export const DNF_SCORE = /^(?:dnf|999)$/i;

export function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ParseError('malformed', `${what} is not an object`);
  }
  return value as Record<string, unknown>;
}

export function asList(value: unknown, max: number, what: string): unknown[] {
  if (!Array.isArray(value)) throw new ParseError('malformed', `${what} is not a list`);
  if (value.length > max) throw new ParseError('too-large', `${what} has more than ${max} items`);
  return value;
}

/** A string value. A missing value reads as "". */
export function asText(value: unknown, what: string): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw new ParseError('malformed', `${what} is not text`);
  if (value.length > LIMITS.text) throw new ParseError('too-large', `${what} is too long`);
  return value.replace(/\s+/g, ' ').trim();
}

/** A whole number within the range, or null. */
export function parseInteger(value: string, [min, max]: readonly [number, number]): number | null {
  if (!/^-?\d{1,9}$/.test(value)) return null;
  const number = Number(value);
  return number >= min && number <= max ? number : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const PDGA_DATE = /(\d{1,2})-([A-Za-z]{3})-(\d{4})/g;

/**
 * Parses a pdga.com date such as "6-Aug-2026", "09-May-2026" or
 * "1-Aug to 2-Aug-2026". A range resolves to its last day, the date the
 * rating rules use for every round of a multi-day event.
 */
export function parsePdgaDate(value: string): PlainDate | null {
  const last = [...value.matchAll(PDGA_DATE)].pop();
  if (!last) return null;
  const month = MONTHS.indexOf(last[2]!.toLowerCase()) + 1;
  const date = `${last[3]}-${String(month).padStart(2, '0')}-${last[1]!.padStart(2, '0')}`;
  return month > 0 && isPlainDate(date) ? date : null;
}

/** Writes a date the way pdga.com does, "6-Aug-2026", so parsePdgaDate reads it back. */
export function toPdgaDate(date: PlainDate): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const name = MONTHS[month - 1]!;
  return `${day}-${name[0]!.toUpperCase()}${name.slice(1)}-${year}`;
}
