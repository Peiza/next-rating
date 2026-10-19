import { normalizeEvent, normalizePlayer, normalizeProfileEvents, normalizeRatingsDetails } from '../parsers';
import { RAW_DETAILS_KEYS } from '../parsers/details';
import type { RawDetailsRow, RawEvent, RawEventRound, RawPlayer, RawProfileEvent } from '../parsers/types';
import { LIMITS, asList, asRecord, asText } from '../parsers/values';

/*
 * Raw records as they arrive in a hand-off, a paste or stored data. They are
 * copied key by key, so unknown fields are dropped, and then run through the
 * normalize layer, which throws a ParseError on anything malformed. The
 * cleaned raw records are what the app stores; it normalizes them again
 * whenever it reads them.
 */

/** Event pages in one hand-off, and kept in stored data. */
export const MAX_EVENTS = 50;

/** The data an import can bring. A missing field means the import does not contain it. */
export interface ImportParts {
  player?: RawPlayer;
  details?: RawDetailsRow[];
  profileEvents?: RawProfileEvent[];
  events?: RawEvent[];
}

const PLAYER_KEYS = ['pdgaNumber', 'name', 'currentRating', 'ratingDate'] as const satisfies readonly (keyof RawPlayer)[];
const PROFILE_EVENT_KEYS = ['eventId', 'division', 'name', 'tier', 'date'] as const satisfies readonly (keyof RawProfileEvent)[];
const ROUND_KEYS = ['score', 'rating'] as const satisfies readonly (keyof RawEventRound)[];

function pick<K extends string>(value: unknown, keys: readonly K[], what: string): Record<K, string> {
  const record = asRecord(value, what);
  return Object.fromEntries(keys.map((key) => [key, asText(record[key], key)])) as Record<K, string>;
}

export function cleanPlayer(value: unknown): RawPlayer {
  const player = pick(value, PLAYER_KEYS, 'player');
  normalizePlayer(player);
  return player;
}

export function cleanDetails(value: unknown): RawDetailsRow[] {
  const rows = asList(value, LIMITS.rows, 'ratings details').map((row) => pick(row, RAW_DETAILS_KEYS, 'ratings details row'));
  normalizeRatingsDetails(rows);
  return rows;
}

export function cleanProfileEvents(value: unknown): RawProfileEvent[] {
  const events = asList(value, LIMITS.rows, 'profile events').map((event) => pick(event, PROFILE_EVENT_KEYS, 'profile event'));
  normalizeProfileEvents(events);
  return events;
}

export function cleanEvent(value: unknown): RawEvent {
  const record = asRecord(value, 'event');
  const event: RawEvent = {
    eventId: asText(record.eventId, 'event id'),
    name: asText(record.name, 'event name'),
    date: asText(record.date, 'event date'),
    status: asText(record.status, 'status'),
    divisions: asList(record.divisions, LIMITS.divisions, 'divisions').map((item) => {
      const division = asRecord(item, 'division');
      return {
        division: asText(division.division, 'division'),
        holes: asList(division.holes, LIMITS.roundsPerRow, 'holes').map((holes) => asText(holes, 'holes')),
        rows: asList(division.rows, LIMITS.rows, 'results').map((rowItem) => {
          const row = asRecord(rowItem, 'result');
          return {
            pdgaNumber: asText(row.pdgaNumber, 'PDGA number'),
            name: asText(row.name, 'player name'),
            rounds: asList(row.rounds, LIMITS.roundsPerRow, 'rounds').map((round) => pick(round, ROUND_KEYS, 'round')),
          };
        }),
      };
    }),
  };
  // Also checks the number of results across all divisions.
  normalizeEvent(event);
  return event;
}

/** Cleans the import fields of a record. Fields that are missing stay missing. */
export function cleanParts(record: Record<string, unknown>): ImportParts {
  const parts: ImportParts = {};
  if (record.player !== undefined) parts.player = cleanPlayer(record.player);
  if (record.details !== undefined) parts.details = cleanDetails(record.details);
  if (record.profileEvents !== undefined) parts.profileEvents = cleanProfileEvents(record.profileEvents);
  if (record.events !== undefined) parts.events = asList(record.events, MAX_EVENTS, 'events').map(cleanEvent);
  return parts;
}

export function hasParts(parts: ImportParts): boolean {
  return (
    parts.player !== undefined ||
    parts.details !== undefined ||
    parts.profileEvents !== undefined ||
    parts.events !== undefined
  );
}
