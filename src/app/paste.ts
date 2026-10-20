import { cleanDetails, cleanEvent, cleanPlayer } from '../handoff/records';
import {
  extractDetailsTsv,
  extractEvent,
  extractEventTsv,
  extractPlayer,
  extractRatingsDetails,
  normalizeRatingsDetails,
} from '../parsers';
import type { RawDetailsRow, RawEvent, RawPlayer } from '../parsers/types';
import { LIMITS, ParseError } from '../parsers/values';
import { parseInert } from './inert';

/*
 * Reads a table copied from pdga.com. Browsers put a copied table on the
 * clipboard both as HTML, which keeps links and hole counts, and as
 * tab-separated text. The HTML is parsed into an inert document.
 */

export type PasteResult =
  | { kind: 'details'; details: RawDetailsRow[]; player?: RawPlayer; rounds: number }
  | { kind: 'event'; event: RawEvent }
  | { kind: 'none' };

function details(rows: RawDetailsRow[], player: RawPlayer | null): PasteResult | null {
  if (rows.length === 0) return null;
  const cleaned = cleanDetails(rows);
  const rounds = normalizeRatingsDetails(cleaned).rounds.length;
  if (rounds === 0) return null;
  let cleanedPlayer: RawPlayer | undefined;
  try {
    cleanedPlayer = player ? cleanPlayer(player) : undefined;
  } catch {
    // A page header without a valid PDGA number: import the rounds only.
  }
  return { kind: 'details', details: cleaned, rounds, ...(cleanedPlayer && { player: cleanedPlayer }) };
}

function event(raw: RawEvent): PasteResult | null {
  return raw.divisions.some((division) => division.rows.length > 0) ? { kind: 'event', event: cleanEvent(raw) } : null;
}

/** Reads pasted content: the HTML form first, then the text form. Throws ParseError when it is too large. */
export function readPaste(html: string, text: string): PasteResult {
  if (html.length > LIMITS.paste || text.length > LIMITS.paste) {
    throw new ParseError('too-large', 'pasted content is too large');
  }
  if (html.trim() !== '') {
    const doc = parseInert(html);
    const found = details(extractRatingsDetails(doc), extractPlayer(doc)) ?? event(extractEvent(doc));
    if (found) return found;
  }
  if (text.trim() !== '') {
    const found = details(extractDetailsTsv(text), null) ?? event(extractEventTsv(text));
    if (found) return found;
  }
  return { kind: 'none' };
}
