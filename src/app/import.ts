import { cleanParts, FRAGMENT_PREFIX, hasParts, MAX_EVENTS, type ImportParts } from '../handoff';
import { eventKeyOf, normalizeEvent, normalizePlayer, normalizeRatingsDetails } from '../parsers';
import type { RawDetailsRow, RawEvent, RawPlayer, RawProfileEvent } from '../parsers/types';
import { asRecord } from '../parsers/values';

/** The imported data the app keeps: cleaned raw records, normalized again whenever they are read. */
export interface StoredImport {
  /** When data was last imported, as an ISO 8601 timestamp. */
  at: string;
  player?: RawPlayer;
  details?: RawDetailsRow[];
  profileEvents?: RawProfileEvent[];
  /** Event pages, in the order they were imported. */
  events: RawEvent[];
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Reads a stored import back, or null when anything in it is not valid. */
export function validateStoredImport(value: unknown): StoredImport | null {
  try {
    const record = asRecord(value, 'stored import');
    const { at } = record;
    if (typeof at !== 'string' || !TIMESTAMP.test(at) || Number.isNaN(Date.parse(at))) return null;
    const { events = [], ...parts } = cleanParts(record);
    return { at, ...parts, events };
  } catch {
    return null;
  }
}

function playerNumber(player: RawPlayer | undefined): number | null {
  return player ? normalizePlayer(player).pdgaNumber : null;
}

/** What makes two copies of an event the same event: its id, or its name and date. */
function eventKey(event: RawEvent): string {
  const { eventId, name, date } = normalizeEvent(event);
  return eventKeyOf(eventId, name, date);
}

function detailsEventKeys(details: readonly RawDetailsRow[]): Set<string> {
  return new Set(
    normalizeRatingsDetails(details).rounds.map((round) => eventKeyOf(round.eventId, round.eventName, round.date)),
  );
}

/**
 * Adds an import to the stored one. An import never erases data it does not
 * contain: for the same player, it replaces only the fields it brings, so a
 * partial import keeps the stored ratings details or profile events. An
 * event page replaces an earlier copy of the same event. An import for a
 * different player replaces everything. Events that the ratings details now
 * include are dropped, since the details already hold their rounds.
 * Returns the stored import unchanged when the import holds no data.
 */
export function applyImport(stored: StoredImport | null, parts: ImportParts, at: string): StoredImport | null {
  if (!hasParts(parts)) return stored;
  const before = playerNumber(stored?.player);
  const after = playerNumber(parts.player);
  const otherPlayer = before !== null && after !== null && before !== after;
  const base: StoredImport = stored && !otherPlayer ? stored : { at, events: [] };

  const next: StoredImport = { ...base, at };
  if (parts.player) next.player = parts.player;
  if (parts.details) next.details = parts.details;
  if (parts.profileEvents) next.profileEvents = parts.profileEvents;

  let events = base.events;
  for (const event of parts.events ?? []) {
    const key = eventKey(event);
    events = [...events.filter((other) => eventKey(other) !== key), event];
  }
  if (next.details) {
    const official = detailsEventKeys(next.details);
    events = events.filter((event) => !official.has(eventKey(event)));
  }
  next.events = events.slice(-MAX_EVENTS);
  return next;
}

/**
 * Takes the hand-off payload out of the URL. The fragment is removed straight
 * away, before decoding and whether decoding works or not, so the data never
 * stays in the address bar, the history or a bookmark.
 */
export function takeFragment(): string | null {
  if (!location.hash.startsWith(FRAGMENT_PREFIX)) return null;
  const payload = location.hash.slice(FRAGMENT_PREFIX.length);
  history.replaceState(history.state, '', location.pathname + location.search);
  return payload;
}
