import { describe, expect, it } from 'vitest';
import type { StoredImport } from '../../src/app/import';
import { buildModel, manualToRounds } from '../../src/app/model';
import type { StoredManualRound } from '../../src/app/storage';
import { topEight } from '../../src/app/top8';
import { rawDetailsRow, rawEvent, rawPlayer } from '../handoff/raw';

/** Monday of update week: after the 11 Oct report deadline, before the 13 Oct update. */
const NOW = new Date('2026-10-12T10:00:00.000Z');
const TODAY = '2026-10-12';

const stored: StoredImport = {
  at: '2026-10-12T09:00:00.000Z',
  player: rawPlayer(),
  details: [
    rawDetailsRow({ eventId: '900010', date: '31-Dec-2025', rating: '1000' }),
    rawDetailsRow({ eventId: '900011', date: '1-Jan-2026', rating: '940' }),
    rawDetailsRow({ eventId: '900012', date: '2-Aug-2026', rating: '950' }),
  ],
  // An unofficial event after the deadline: rated this year, but in the following update.
  events: [rawEvent({ eventId: '900013', date: '12-Oct-2026' })],
};

function manual(rating: number, date: string): StoredManualRound {
  return { id: `x${rating}`, rating, date, eventName: '', holes: null };
}

const ratingsOf = (top: ReturnType<typeof topEight>) => top.result.rounds.map((round) => round.rating);

describe('topEight', () => {
  it('takes the calendar year of today', () => {
    const top = topEight(buildModel(stored, 100001, NOW), 'year', TODAY);
    expect(top.year).toBe(2026);
    // 31 Dec 2025 is last year; the unofficial rounds after the deadline count.
    expect(ratingsOf(top)).toEqual([960, 955, 950, 940]);
    expect(top.result).toMatchObject({ found: 4, sum: 3805, average: 951, high: 960 });
  });

  it('starts the new year empty', () => {
    const top = topEight(buildModel(stored, 100001, NOW), 'year', '2027-01-01');
    expect(top.year).toBe(2027);
    expect(top.result.found).toBe(0);
    expect(top.result.sum).toBeNull();
  });

  it("uses the prediction's window, without rounds after the deadline", () => {
    const model = buildModel(stored, 100001, NOW);
    const { windowMonths, windowStart, windowEnd } = model.prediction.stats;
    const top = topEight(model, 'window', TODAY);
    expect(top.window).toEqual({ months: windowMonths, start: windowStart, end: windowEnd });
    // Fewer than 8 rounds in 12 months, so the 24-month fallback takes in 2025.
    expect(top.window).toEqual({ months: 24, start: '2024-08-02', end: '2026-08-02' });
    expect(ratingsOf(top)).toEqual([1000, 950, 940]);
  });

  it('never lists a manual round, though one can anchor the window', () => {
    const rounds = manualToRounds([manual(1100, '2026-10-10'), manual(1090, '2026-10-12')]);
    const model = buildModel(stored, 100001, NOW, rounds);
    expect(ratingsOf(topEight(model, 'year', TODAY))).toEqual([960, 955, 950, 940]);
    const top = topEight(model, 'window', TODAY);
    // The manual round on 10 Oct is the most recent one before the deadline.
    expect(top.window?.end).toBe('2026-10-10');
    expect(ratingsOf(top)).toEqual([1000, 950, 940]);
  });

  it('has no window without rated rounds', () => {
    const top = topEight(buildModel({ ...stored, details: [], events: [] }, 100001, NOW), 'window', TODAY);
    expect(top.window).toBeNull();
    expect(top.result.found).toBe(0);
  });
});
