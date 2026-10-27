import {
  normalizeCareer,
  normalizeEvent,
  normalizePlayer,
  normalizeProfileEvents,
  normalizeRatingsDetails,
  normalizeRatingsHistory,
  normalizeWins,
} from '../parsers';
import { RAW_DETAILS_KEYS } from '../parsers/details';
import { RAW_HISTORY_KEYS } from '../parsers/history';
import { RAW_CAREER_KEYS, RAW_WIN_KEYS } from '../parsers/wins';
import type {
  RawCareer,
  RawDetailsRow,
  RawEvent,
  RawEventRound,
  RawHistoryRow,
  RawPlayer,
  RawProfileEvent,
  RawWin,
} from '../parsers/types';
import { LIMITS, asList, asRecord, asText } from '../parsers/values';

/*
 * Raw records as they arrive in a hand-off or stored data. They are
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
  /** The ratings history page's rows, newest first as on pdga.com. */
  history?: RawHistoryRow[];
  /** The career events and wins from a player page's info list. */
  career?: RawCareer;
  /** The career wins page's rows. */
  wins?: RawWin[];
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
  const rows = asList(value, LIMITS.rows, 'ratings details').map((row): RawDetailsRow => {
    const layout = asText(asRecord(row, 'ratings details row').layout, 'layout');
    return { ...pick(row, RAW_DETAILS_KEYS, 'ratings details row'), ...(layout && { layout }) };
  });
  normalizeRatingsDetails(rows);
  return rows;
}

export function cleanProfileEvents(value: unknown): RawProfileEvent[] {
  const events = asList(value, LIMITS.rows, 'profile events').map((event) => pick(event, PROFILE_EVENT_KEYS, 'profile event'));
  normalizeProfileEvents(events);
  return events;
}

export function cleanHistory(value: unknown): RawHistoryRow[] {
  const rows = asList(value, LIMITS.rows, 'ratings history').map((row) => pick(row, RAW_HISTORY_KEYS, 'ratings history row'));
  normalizeRatingsHistory(rows);
  return rows;
}

export function cleanCareer(value: unknown): RawCareer {
  const career = pick(value, RAW_CAREER_KEYS, 'career');
  normalizeCareer(career);
  return career;
}

export function cleanWins(value: unknown): RawWin[] {
  const wins = asList(value, LIMITS.rows, 'wins').map((win) => pick(win, RAW_WIN_KEYS, 'win'));
  normalizeWins(wins);
  return wins;
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
        ...(division.layouts !== undefined && {
          layouts: asList(division.layouts, LIMITS.roundsPerRow, 'layouts').map((layout) => asText(layout, 'layout')),
        }),
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
  if (record.history !== undefined) parts.history = cleanHistory(record.history);
  if (record.career !== undefined) parts.career = cleanCareer(record.career);
  if (record.wins !== undefined) parts.wins = cleanWins(record.wins);
  return parts;
}

export function hasParts(parts: ImportParts): boolean {
  return (
    parts.player !== undefined ||
    parts.details !== undefined ||
    parts.profileEvents !== undefined ||
    parts.events !== undefined ||
    parts.history !== undefined ||
    parts.career !== undefined ||
    parts.wins !== undefined
  );
}
