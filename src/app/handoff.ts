import type { HandoffPage } from '../handoff/envelope';
import {
  cleanCareer,
  cleanDetails,
  cleanEvent,
  cleanHistory,
  cleanPlayer,
  cleanProfileEvents,
  cleanWins,
  type ImportParts,
} from '../handoff/records';
import {
  detectPage,
  extractCareer,
  extractEvent,
  extractPlayer,
  extractProfileEvents,
  extractRatingsDetails,
  extractRatingsHistory,
  extractWins,
  normalizeCareer,
} from '../parsers';
import type { RawPlayer } from '../parsers/types';
import { parseInert } from './inert';

/*
 * Reads the pages a bookmarklet hand-off brings. The bookmarklet sends HTML
 * and parses nothing, so this is where its pages become records, in exactly
 * one way: an inert document, the extractors, then the
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
          if (events.length > 0) parts.profileEvents = [...cleanProfileEvents(events), ...(parts.profileEvents ?? [])];
          const career = extractCareer(doc);
          if (career) parts.career = cleanCareer(career);
        }
      } else if (kind === 'history') {
        owner ??= Number(/\/player\/(\d+)/.exec(url)![1]);
        const header = player(extractPlayer(doc));
        if (header) parts.player = header;
        const rows = extractRatingsHistory(doc);
        if (rows.length > 0) parts.history = cleanHistory(rows);
      } else if (kind === 'wins') {
        owner ??= Number(/\/player\/(\d+)/.exec(url)![1]);
        const header = player(extractPlayer(doc));
        if (header) parts.player = header;
        const career = extractCareer(doc);
        if (career) parts.career = cleanCareer(career);
        const wins = extractWins(doc);
        // A player with wins always has rows, so an empty table is one that could not be read.
        if (wins.length > 0 || normalizeCareer(career ?? {}).wins === 0) parts.wins = cleanWins(wins);
      } else if (kind === 'season') {
        // The previous season, sent in January: its events join the profile's, for their tiers. Its header is not used.
        owner ??= Number(/\/player\/(\d+)/.exec(url)![1]);
        const events = extractProfileEvents(doc);
        if (events.length > 0) parts.profileEvents = [...(parts.profileEvents ?? []), ...cleanProfileEvents(events)];
      } else {
        unreadable.push(url);
      }
    } catch {
      unreadable.push(url);
    }
  }
  return { parts, owner, unreadable };
}
