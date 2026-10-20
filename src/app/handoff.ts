import type { HandoffPage } from '../handoff/envelope';
import { cleanDetails, cleanEvent, cleanPlayer, cleanProfileEvents, type ImportParts } from '../handoff/records';
import { detectPage, extractEvent, extractPlayer, extractProfileEvents, extractRatingsDetails } from '../parsers';
import type { RawPlayer } from '../parsers/types';
import { parseInert } from './inert';

/*
 * Reads the pages a bookmarklet hand-off brings. The bookmarklet sends HTML
 * and parses nothing, so this is where its pages become records, in exactly
 * the same way as pasted HTML: an inert document, the extractors, then the
 * same validation as stored data.
 */

export interface HandoffPages {
  parts: ImportParts;
  /** The player of the player pages, from their URL, for when the page header cannot be read. */
  owner: number | null;
  /** Pages whose content could not be read. */
  unreadable: string[];
}

function player(raw: RawPlayer | null): RawPlayer | undefined {
  try {
    return raw ? cleanPlayer(raw) : undefined;
  } catch {
    // A header without a valid PDGA number: import the rest.
    return undefined;
  }
}

/**
 * Reads each page by the kind its URL names. An empty table is left out,
 * so a table that could not be found never replaces stored data.
 */
export function readPages(pages: readonly HandoffPage[]): HandoffPages {
  const parts: ImportParts = {};
  const unreadable: string[] = [];
  let owner: number | null = null;
  for (const { url, html } of pages) {
    try {
      const doc = parseInert(html);
      const kind = detectPage(doc, url);
      if (kind === 'event') {
        parts.events = [...(parts.events ?? []), cleanEvent(extractEvent(doc))];
      } else if (kind === 'details' || kind === 'profile') {
        owner ??= Number(/\/player\/(\d+)/.exec(url)![1]);
        const header = player(extractPlayer(doc));
        if (header) parts.player = header;
        if (kind === 'details') {
          const rows = extractRatingsDetails(doc);
          if (rows.length > 0) parts.details = cleanDetails(rows);
        } else {
          const events = extractProfileEvents(doc);
          if (events.length > 0) parts.profileEvents = cleanProfileEvents(events);
        }
      } else {
        unreadable.push(url);
      }
    } catch {
      unreadable.push(url);
    }
  }
  return { parts, owner, unreadable };
}
