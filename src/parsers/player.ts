import { cellText, eventIdOf } from './dom';
import type { PlayerInfo, ProfileEvent, RawPlayer, RawProfileEvent } from './types';
import { LIMITS, ParseError, RANGES, asList, asRecord, asText, parseInteger, parsePdgaDate } from './values';

/**
 * Reads the player header that the profile and ratings details pages share:
 * "Name #12345" in the page title and the "Current Rating" line.
 */
export function extractPlayer(root: ParentNode): RawPlayer | null {
  const title = /^(.*?)\s*#(\d+)$/.exec(cellText(root.querySelector('#page-title')));
  if (!title) return null;
  const rating = root.querySelector('.current-rating');
  return {
    pdgaNumber: title[2]!,
    name: title[1]!,
    currentRating: /Current Rating:?\s*(\d+)/i.exec(cellText(rating))?.[1] ?? '',
    ratingDate: cellText(rating?.querySelector('.rating-date')),
  };
}

/** Reads the season's tournament results on the profile page, one table per division. */
export function extractProfileEvents(root: ParentNode): RawProfileEvent[] {
  const rows = root.querySelectorAll('table[id^="player-results-"]:not(#player-results-details) tr');
  return [...rows].flatMap((row) => {
    const link = row.querySelector('td.tournament a');
    const href = link?.getAttribute('href') ?? '';
    const eventId = eventIdOf(href);
    if (!eventId) return [];
    return [
      {
        eventId,
        division: /#(.+)$/.exec(href)?.[1] ?? '',
        name: cellText(link),
        tier: cellText(row.querySelector('td.tier')),
        date: cellText(row.querySelector('td.dates')),
      },
    ];
  });
}

export function normalizePlayer(raw: unknown): PlayerInfo {
  const player = asRecord(raw, 'player');
  const pdgaNumber = parseInteger(asText(player.pdgaNumber, 'PDGA number'), RANGES.id);
  if (pdgaNumber === null) throw new ParseError('malformed', 'player has no valid PDGA number');
  return {
    pdgaNumber,
    name: asText(player.name, 'player name'),
    currentRating: parseInteger(asText(player.currentRating, 'current rating'), RANGES.rating),
    ratingDate: parsePdgaDate(asText(player.ratingDate, 'rating date')),
  };
}

export function normalizeProfileEvents(raw: unknown): ProfileEvent[] {
  return asList(raw, LIMITS.rows, 'profile events').flatMap((item) => {
    const event = asRecord(item, 'profile event');
    const eventId = parseInteger(asText(event.eventId, 'event id'), RANGES.id);
    if (eventId === null) return [];
    return [
      {
        eventId,
        division: asText(event.division, 'division'),
        name: asText(event.name, 'event name'),
        tier: asText(event.tier, 'tier'),
        date: parsePdgaDate(asText(event.date, 'event date')),
      },
    ];
  });
}

export function parsePlayer(root: ParentNode): PlayerInfo | null {
  const raw = extractPlayer(root);
  return raw && normalizePlayer(raw);
}

export function parseProfileEvents(root: ParentNode): ProfileEvent[] {
  return normalizeProfileEvents(extractProfileEvents(root));
}
