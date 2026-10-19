import { cellText, eventIdOf, tooltipHoles, tooltipOf } from './dom';
import type { DetailsRound, RatingsDetails, RawDetailsRow } from './types';
import { LIMITS, RANGES, asList, asRecord, asText, parseInteger, parsePdgaDate } from './values';

/** Header texts of the ratings details table, lower case. */
export const DETAILS_COLUMNS = [
  'tournament',
  'tier',
  'date',
  'division',
  'round',
  'score',
  'rating',
  'evaluated',
  'included',
] as const;

export type DetailsColumn = (typeof DETAILS_COLUMNS)[number];

/** True for the header row of a ratings details table. */
export function isDetailsHeader(headers: readonly string[]): boolean {
  return headers.includes('evaluated') && headers.includes('included');
}

/** "Yes" or "No" from a row class such as "included" or "not-included". */
function flagOf(row: Element, name: string): string {
  if (row.classList.contains(name)) return 'Yes';
  if (row.classList.contains(`not-${name}`)) return 'No';
  return '';
}

/**
 * Reads the ratings details table. Columns are found by header text, so it
 * also works on a pasted table that lost its id. Round numbers and hole
 * counts come from the layout tooltips when the page has them.
 */
export function extractRatingsDetails(root: ParentNode): RawDetailsRow[] {
  const holes = tooltipHoles(root);
  for (const table of root.querySelectorAll('table')) {
    const headers = [...table.querySelectorAll('th')].map((th) => cellText(th).toLowerCase());
    if (!isDetailsHeader(headers)) continue;
    return [...table.querySelectorAll('tr')].flatMap((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length === 0) return [];
      const cell = (column: DetailsColumn) => cells[headers.indexOf(column)];
      const text = (column: DetailsColumn) => cellText(cell(column));
      const tooltip = tooltipOf(cell('round'));
      return [
        {
          eventId: eventIdOf(cell('tournament')?.querySelector('a')?.getAttribute('href')),
          eventName: text('tournament'),
          tier: text('tier'),
          date: text('date'),
          division: text('division'),
          round: /round-(\d+)$/.exec(tooltip)?.[1] ?? text('round'),
          roundLabel: text('round'),
          score: text('score'),
          rating: text('rating'),
          holes: holes.get(tooltip) ?? '',
          evaluated: flagOf(row, 'evaluated') || text('evaluated'),
          included: flagOf(row, 'included') || text('included'),
        },
      ];
    });
  }
  return [];
}

export const RAW_DETAILS_KEYS = [
  'eventId',
  'eventName',
  'tier',
  'date',
  'division',
  'round',
  'roundLabel',
  'score',
  'rating',
  'holes',
  'evaluated',
  'included',
] as const satisfies readonly (keyof RawDetailsRow)[];

export function normalizeRatingsDetails(raw: unknown): RatingsDetails {
  const rounds: DetailsRound[] = [];
  let skipped = 0;
  for (const item of asList(raw, LIMITS.rows, 'ratings details')) {
    const record = asRecord(item, 'ratings details row');
    // Validate every field, also in rows that are skipped below.
    const row = Object.fromEntries(
      RAW_DETAILS_KEYS.map((key) => [key, asText(record[key], key)]),
    ) as Record<keyof RawDetailsRow, string>;
    const date = parsePdgaDate(row.date);
    const rating = parseInteger(row.rating, RANGES.rating);
    if (date === null || rating === null) {
      skipped += 1;
      continue;
    }
    rounds.push({
      eventId: parseInteger(row.eventId, RANGES.id),
      eventName: row.eventName,
      tier: row.tier,
      date,
      division: row.division,
      round: parseInteger(row.round, [1, LIMITS.roundsPerRow]),
      roundLabel: row.roundLabel,
      score: parseInteger(row.score, RANGES.score),
      rating,
      holes: parseInteger(row.holes, RANGES.holes),
      evaluated: /^yes$/i.test(row.evaluated),
      included: /^yes$/i.test(row.included),
    });
  }
  return { rounds, skipped };
}

export function parseRatingsDetails(root: ParentNode): RatingsDetails {
  return normalizeRatingsDetails(extractRatingsDetails(root));
}
