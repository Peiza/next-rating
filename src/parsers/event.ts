import { cellText, eventIdOf, tooltipHoles, tooltipOf } from './dom';
import type { EventResults, EventRound, RawEvent, RawEventRound } from './types';
import {
  DNF_SCORE,
  LIMITS,
  ParseError,
  RANGES,
  asList,
  asRecord,
  asText,
  parseInteger,
  parsePdgaDate,
} from './values';

function statusOf(root: ParentNode): string {
  if (root.querySelector('.leaderboard.mode-live')) return 'unofficial';
  if (root.querySelector('.leaderboard.mode-normal')) return 'official';
  const heading = [...root.querySelectorAll('h2')].map((h2) => cellText(h2)).join(' ');
  if (/unofficial results/i.test(heading)) return 'unofficial';
  if (/official results/i.test(heading)) return 'official';
  return '';
}

/**
 * Reads an event results page: one table per division. Cells are read by
 * class, since columns such as Points and Prize are not always there. Each
 * round score cell is followed by its round rating cell.
 */
export function extractEvent(root: ParentNode): RawEvent {
  const holes = tooltipHoles(root);
  const tables = [...root.querySelectorAll('table')].filter((table) =>
    table.querySelector('th.pdga-number'),
  );
  return {
    eventId: eventIdOf(root.querySelector('link[rel=canonical]')?.getAttribute('href')),
    name: cellText(root.querySelector('#page-title')),
    date: cellText(root.querySelector('.tournament-date')),
    status: statusOf(root),
    divisions: tables.map((table) => ({
      division: table.closest('details')?.querySelector('h3.division')?.id ?? '',
      holes: [...table.querySelectorAll('th.round')].map((th) => holes.get(tooltipOf(th)) ?? ''),
      rows: [...table.querySelectorAll('tr')].flatMap((row) => {
        const player = row.querySelector('td.player');
        if (!player) return [];
        const rounds: RawEventRound[] = [];
        for (const cell of row.querySelectorAll('td.round, td.round-rating')) {
          if (cell.classList.contains('round')) rounds.push({ score: cellText(cell), rating: '' });
          else if (rounds.length > 0) rounds[rounds.length - 1]!.rating = cellText(cell);
        }
        return [
          {
            pdgaNumber: cellText(row.querySelector('td.pdga-number')),
            name: cellText(player),
            rounds,
          },
        ];
      }),
    })),
  };
}

function normalizeRound(raw: unknown): EventRound {
  const round = asRecord(raw, 'round');
  const score = asText(round.score, 'score');
  if (DNF_SCORE.test(score)) return { score: null, rating: null, dnf: true };
  return {
    score: parseInteger(score, RANGES.score),
    rating: parseInteger(asText(round.rating, 'round rating'), RANGES.rating),
    dnf: false,
  };
}

export function normalizeEvent(raw: unknown): EventResults {
  const event = asRecord(raw, 'event');
  const status = asText(event.status, 'status');
  let totalRows = 0;
  const divisions = asList(event.divisions, LIMITS.divisions, 'divisions').map((item) => {
    const division = asRecord(item, 'division');
    const rows = asList(division.rows, LIMITS.rows, 'results');
    totalRows += rows.length;
    if (totalRows > LIMITS.rows) throw new ParseError('too-large', `event has more than ${LIMITS.rows} results`);
    return {
      division: asText(division.division, 'division'),
      holes: asList(division.holes, LIMITS.roundsPerRow, 'holes').map((holes) =>
        parseInteger(asText(holes, 'holes'), RANGES.holes),
      ),
      rows: rows.map((rowItem) => {
        const row = asRecord(rowItem, 'result');
        return {
          pdgaNumber: parseInteger(asText(row.pdgaNumber, 'PDGA number'), RANGES.id),
          name: asText(row.name, 'player name'),
          rounds: asList(row.rounds, LIMITS.roundsPerRow, 'rounds').map(normalizeRound),
        };
      }),
    };
  });
  return {
    eventId: parseInteger(asText(event.eventId, 'event id'), RANGES.id),
    name: asText(event.name, 'event name'),
    date: parsePdgaDate(asText(event.date, 'event date')),
    official: status === 'official' ? true : status === 'unofficial' ? false : null,
    divisions,
  };
}

export function parseEvent(root: ParentNode): EventResults {
  return normalizeEvent(extractEvent(root));
}
