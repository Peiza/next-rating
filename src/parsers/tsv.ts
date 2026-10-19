import { isDetailsHeader, type DetailsColumn } from './details';
import type { RawDetailsRow, RawEvent, RawEventRow } from './types';
import { LIMITS, ParseError } from './values';

/*
 * Pasted tables in their text/plain form: browsers copy a table as one line
 * per row with tab-separated cells. Columns are found by header text. The
 * text form has no links or tooltips, so event ids, hole counts and the
 * round number of a "Finals" round are unknown.
 */

function lines(text: string): string[][] {
  if (text.length > LIMITS.paste) throw new ParseError('too-large', 'pasted text is too long');
  return text.split(/\r?\n/).map((line) => line.split('\t').map((cell) => cell.replace(/\s+/g, ' ').trim()));
}

export function extractDetailsTsv(text: string): RawDetailsRow[] {
  const rows: RawDetailsRow[] = [];
  let headers: string[] | null = null;
  for (const cells of lines(text)) {
    const lower = cells.map((cell) => cell.toLowerCase());
    if (isDetailsHeader(lower)) {
      headers = lower;
      continue;
    }
    if (!headers || cells.length < 2) continue;
    const columns = headers;
    const get = (column: DetailsColumn) => cells[columns.indexOf(column)] ?? '';
    rows.push({
      eventId: '',
      eventName: get('tournament'),
      tier: get('tier'),
      date: get('date'),
      division: get('division'),
      round: get('round'),
      roundLabel: get('round'),
      score: get('score'),
      rating: get('rating'),
      holes: '',
      evaluated: get('evaluated'),
      included: get('included'),
    });
  }
  return rows;
}

/**
 * Reads pasted event results. Several division tables may be pasted at
 * once; each starts with its own header row. Between the "Par" and "Total"
 * columns, each round has a score column followed by a rating column.
 */
export function extractEventTsv(text: string): RawEvent {
  const rows: RawEventRow[] = [];
  let headers: string[] | null = null;
  for (const cells of lines(text)) {
    const lower = cells.map((cell) => cell.toLowerCase());
    if (lower.includes('pdga#')) {
      headers = lower;
      continue;
    }
    if (!headers) continue;
    const first = headers.indexOf('par') + 1 || headers.indexOf('rating') + 1;
    const total = headers.indexOf('total');
    const last = total >= 0 ? total : headers.length;
    if (first === 0 || cells.length < last) continue;
    const rounds = [];
    for (let i = first; i < last; i += 2) rounds.push({ score: cells[i] ?? '', rating: cells[i + 1] ?? '' });
    rows.push({
      pdgaNumber: cells[headers.indexOf('pdga#')] ?? '',
      name: cells[headers.indexOf('name')] ?? '',
      rounds,
    });
  }
  return { eventId: '', name: '', date: '', status: '', divisions: [{ division: '', holes: [], rows }] };
}
