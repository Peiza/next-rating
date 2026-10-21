import type { Envelope, HandoffPage } from '../../src/handoff';
import type { RawDetailsRow, RawEvent, RawEventRow, RawHistoryRow, RawPlayer, RawProfileEvent } from '../../src/parsers/types';

/* Synthetic raw records, as the extract layer returns them, and hand-offs. All names, numbers and results are invented. */

export function rawPlayer(extra: Partial<RawPlayer> = {}): RawPlayer {
  return { pdgaNumber: '100001', name: 'Test Player', currentRating: '950', ratingDate: '(as of 08-Sep-2026)', ...extra };
}

export function rawDetailsRow(extra: Partial<RawDetailsRow> = {}): RawDetailsRow {
  return {
    eventId: '900001',
    eventName: 'Example Open',
    tier: 'C',
    date: '2-Aug-2026',
    division: 'MA1',
    round: '1',
    roundLabel: '1',
    score: '54',
    rating: '950',
    holes: '18',
    evaluated: 'Yes',
    included: 'Yes',
    ...extra,
  };
}

export function rawProfileEvent(extra: Partial<RawProfileEvent> = {}): RawProfileEvent {
  return { eventId: '900002', division: 'MA1', name: 'Example Cup', tier: 'C', date: '6-Sep-2026', ...extra };
}

export function rawEventRow(pdgaNumber: string, ratings: string[], name = 'Test Player'): RawEventRow {
  return { pdgaNumber, name, rounds: ratings.map((rating) => ({ score: '54', rating })) };
}

export function rawEvent(extra: Partial<RawEvent> = {}, rows?: RawEventRow[]): RawEvent {
  return {
    eventId: '900002',
    name: 'Example Cup',
    date: '6-Sep-2026',
    status: 'unofficial',
    divisions: [
      {
        division: 'MA1',
        holes: ['18', '9'],
        rows: rows ?? [rawEventRow('100002', ['990', '980'], 'Other Player'), rawEventRow('100001', ['960', '955'])],
      },
    ],
    ...extra,
  };
}

export function envelope(extra: Partial<Envelope> = {}): Envelope {
  return { v: 2, status: 'ok', page: 'details', bookmarklet: '1.0.0', ...extra };
}

/** A page as the bookmarklet sends it. */
export function handoffPage(html: string, url = 'https://www.pdga.com/player/100001/details'): HandoffPage {
  return { url, html };
}

/** A ratings history row: an update's effective date, rating and rounds used. */
export function rawHistoryRow(date = '8-Sep-2026', rating = '950', rounds = '20'): RawHistoryRow {
  return { date, rating, rounds };
}
