import { cleanParts, FRAGMENT_PREFIX, hasParts, MAX_EVENTS, type ImportParts } from '../handoff';
import { eventKeyOf, normalizeEvent, normalizePlayer, normalizeRatingsDetails } from '../parsers';
import type { RawCareer, RawDetailsRow, RawEvent, RawHistoryRow, RawPlayer, RawProfileEvent, RawWin } from '../parsers/types';
import { asRecord } from '../parsers/values';

/** The imported data the app keeps: cleaned raw records, normalized again whenever they are read. */
export interface StoredImport {
  /** When data was last imported, as an ISO 8601 timestamp. */
  at: string;
  /**
   * When the ratings details were last imported. Missing in data stored
   * before it was added; `at` is the best estimate then.
   */
  detailsAt?: string;
  player?: RawPlayer;
  details?: RawDetailsRow[];
  profileEvents?: RawProfileEvent[];
  /** The ratings history, newest first as on pdga.com. Missing before an import brings it. */
  history?: RawHistoryRow[];
  /** The career events and wins. Missing before an import brings them. */
  career?: RawCareer;
  /** The career wins page's rows. Missing before an import brings them. */
  wins?: RawWin[];
  /** Event pages, in the order they were imported. */
  events: RawEvent[];
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}

/** Reads a stored import back, or null when anything in it is not valid. */
export function validateStoredImport(value: unknown): StoredImport | null {
  try {
    const record = asRecord(value, 'stored import');
    const { at, detailsAt } = record;
    if (!isTimestamp(at)) return null;
    if (detailsAt !== undefined && !isTimestamp(detailsAt)) return null;
    const { events = [], ...parts } = cleanParts(record);
    return { at, ...(detailsAt !== undefined && { detailsAt }), ...parts, events };
  } catch {
    return null;
  }
}

/** The PDGA number in a player record, or null without one. */
export function playerNumber(player: RawPlayer | undefined): number | null {
  return player ? normalizePlayer(player).pdgaNumber : null;
}

/** What makes two copies of an event the same event: its id, or its name and date. The engine's event key. */
export function eventKey(event: RawEvent): string {
  const { eventId, name, date } = normalizeEvent(event);
  return eventKeyOf(eventId, name, date);
}

function detailsEventKeys(details: readonly RawDetailsRow[]): Set<string> {
  return new Set(
    normalizeRatingsDetails(details).rounds.map((round) => eventKeyOf(round.eventId, round.eventName, round.date)),
  );
}

/** True when the player has a results row in the event, rated or not. */
export function hasPlayerRow(event: RawEvent, pdgaNumber: number): boolean {
  return normalizeEvent(event).divisions.some((division) => division.rows.some((row) => row.pdgaNumber === pdgaNumber));
}

/**
 * Keeps only the player's rows of an event, and only the divisions they are
 * in, so a whole event page is not stored again for every player. Without a
 * row for the player, no divisions are left.
 */
export function eventForPlayer(event: RawEvent, pdgaNumber: number): RawEvent {
  const { divisions } = normalizeEvent(event);
  return {
    ...event,
    divisions: event.divisions.flatMap((division, i) => {
      const rows = division.rows.filter((_, j) => divisions[i]!.rows[j]!.pdgaNumber === pdgaNumber);
      return rows.length > 0 ? [{ ...division, rows }] : [];
    }),
  };
}

/**
 * Adds an import to one player's stored import. An import never erases data
 * it does not contain: it replaces only the fields it brings, so a partial
 * import keeps the stored ratings details or profile events. Event pages are
 * cut down to the player's rows, and replace an earlier copy of the same
 * event. Events that the ratings details now include are dropped, since the
 * details already hold their rounds.
 * Returns the stored import unchanged when the import holds no data.
 */
export function applyImport(
  stored: StoredImport | null,
  parts: ImportParts,
  at: string,
  pdgaNumber: number,
): StoredImport | null {
  if (!hasParts(parts)) return stored;
  const base: StoredImport = stored ?? { at, events: [] };

  const next: StoredImport = { ...base, at };
  if (parts.player) next.player = parts.player;
  if (parts.details) {
    next.details = parts.details;
    next.detailsAt = at;
  }
  if (parts.profileEvents) next.profileEvents = parts.profileEvents;
  if (parts.history) next.history = parts.history;
  if (parts.career) next.career = parts.career;
  if (parts.wins) next.wins = parts.wins;

  let events = base.events;
  for (const event of (parts.events ?? []).map((event) => eventForPlayer(event, pdgaNumber))) {
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
