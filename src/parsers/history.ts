import { compareDates } from '../engine/dates';
import { cellText } from './dom';
import type { HistoryEntry, RawHistoryRow } from './types';
import { LIMITS, RANGES, asList, asRecord, asText, parseInteger, parsePdgaDate } from './values';

/*
 * The ratings history page (/player/<nr>/history): the official rating after
 * each ratings update, newest first, with the number of rounds it used.
 */

export const RAW_HISTORY_KEYS = ['date', 'rating', 'rounds'] as const satisfies readonly (keyof RawHistoryRow)[];

/** Reads the ratings history table, one row per update. */
export function extractRatingsHistory(root: ParentNode): RawHistoryRow[] {
  return [...root.querySelectorAll('#player-results-history tr')].flatMap((row) => {
    if (!row.querySelector('td')) return [];
    return [
      {
        date: cellText(row.querySelector('td.date')),
        rating: cellText(row.querySelector('td.player-rating')),
        rounds: cellText(row.querySelector('td.round')),
      },
    ];
  });
}

/** The updates oldest first. Rows without a readable date or rating are left out. */
export function normalizeRatingsHistory(raw: unknown): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const item of asList(raw, LIMITS.rows, 'ratings history')) {
    const record = asRecord(item, 'ratings history row');
    const row = Object.fromEntries(RAW_HISTORY_KEYS.map((key) => [key, asText(record[key], key)])) as Record<
      keyof RawHistoryRow,
      string
    >;
    const date = parsePdgaDate(row.date);
    const rating = parseInteger(row.rating, RANGES.rating);
    if (date === null || rating === null) continue;
    entries.push({ date, rating, rounds: parseInteger(row.rounds, [0, LIMITS.rows]) });
  }
  return entries.sort((a, b) => compareDates(a.date, b.date));
}

export function parseRatingsHistory(root: ParentNode): HistoryEntry[] {
  return normalizeRatingsHistory(extractRatingsHistory(root));
}
