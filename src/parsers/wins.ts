import { cellText, eventIdOf } from './dom';
import type { Career, RawCareer, RawWin, Win } from './types';
import { LIMITS, RANGES, asList, asRecord, asText, parseInteger, parsePdgaDate } from './values';

/*
 * A player's tournament wins: the "Career Events" and "Career Wins" lines in
 * the info list that the player pages share, and the career wins page
 * (/player/<nr>/wins), one row per win with its date.
 */

export const RAW_CAREER_KEYS = ['events', 'wins'] as const satisfies readonly (keyof RawCareer)[];
export const RAW_WIN_KEYS = ['eventId', 'name', 'division', 'tier', 'date'] as const satisfies readonly (keyof RawWin)[];

/** The number at the end of a line such as "Career Wins: 8", or "". */
function lineCount(node: Element | null): string {
  return /(\d+)$/.exec(cellText(node))?.[1] ?? '';
}

/** Reads the career lines, or null when the page shows neither. */
export function extractCareer(root: ParentNode): RawCareer | null {
  const events = root.querySelector('.career-events');
  const wins = root.querySelector('.career-wins');
  if (!events && !wins) return null;
  return { events: lineCount(events), wins: lineCount(wins) };
}

/** Reads the wins table, one row per win. */
export function extractWins(root: ParentNode): RawWin[] {
  return [...root.querySelectorAll('#player-wins tr')].flatMap((row) => {
    if (!row.querySelector('td')) return [];
    const link = row.querySelector('td.tournament a');
    return [
      {
        eventId: eventIdOf(link?.getAttribute('href')),
        name: cellText(row.querySelector('td.tournament')),
        division: cellText(row.querySelector('td.division')),
        tier: cellText(row.querySelector('td.tier')),
        date: cellText(row.querySelector('td.dates')),
      },
    ];
  });
}

/**
 * The career figures. Without a "Career Wins" line, as for a player with
 * no wins, the wins are 0 when the events line is there.
 */
export function normalizeCareer(raw: unknown): Career {
  const record = asRecord(raw, 'career');
  const events = parseInteger(asText(record.events, 'career events'), [0, 99_999]);
  const wins = parseInteger(asText(record.wins, 'career wins'), [0, 99_999]);
  return { events, wins: wins ?? (events !== null ? 0 : null) };
}

/** The wins, in page order. Rows without a readable date are left out. */
export function normalizeWins(raw: unknown): Win[] {
  return asList(raw, LIMITS.rows, 'wins').flatMap((item) => {
    const record = asRecord(item, 'win');
    const date = parsePdgaDate(asText(record.date, 'win date'));
    if (date === null) return [];
    return [
      {
        eventId: parseInteger(asText(record.eventId, 'event id'), RANGES.id),
        name: asText(record.name, 'event name'),
        division: asText(record.division, 'division'),
        tier: asText(record.tier, 'tier'),
        date,
      },
    ];
  });
}
