import { describe, expect, it } from 'vitest';
import type { StoredImport } from '../../src/app/import';
import { buildModel, manualToRounds } from '../../src/app/model';
import type { StoredManualRound } from '../../src/app/storage';
import { periodYears, topEight, type TopPeriod } from '../../src/app/top8';
import { rawDetailsRow, rawEvent, rawPlayer } from '../handoff/raw';

/** Monday of update week: after the 11 Oct report deadline, before the 13 Oct update. */
const NOW = new Date('2026-10-12T10:00:00.000Z');
const TODAY = '2026-10-12';

const THIS_YEAR: TopPeriod = { kind: 'year', year: null };
const WINDOW: TopPeriod = { kind: 'window' };

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
    const top = topEight(buildModel(stored, 100001, NOW), THIS_YEAR, TODAY);
    expect(top.year).toBe(2026);
    // 31 Dec 2025 is last year; the unofficial rounds after the deadline count.
    expect(ratingsOf(top)).toEqual([960, 955, 950, 940]);
    expect(top.result).toMatchObject({ found: 4, sum: 3805, average: 951, high: 960 });
  });

  it('starts the new year empty', () => {
    const top = topEight(buildModel(stored, 100001, NOW), THIS_YEAR, '2027-01-01');
    expect(top.year).toBe(2027);
    expect(top.result.found).toBe(0);
    expect(top.result.sum).toBeNull();
  });

  it("uses the prediction's window, without rounds after the deadline", () => {
    const model = buildModel(stored, 100001, NOW);
    const { windowMonths, windowStart, windowEnd } = model.prediction.stats;
    const top = topEight(model, WINDOW, TODAY);
    expect(top.window).toEqual({ months: windowMonths, start: windowStart, end: windowEnd });
    // Fewer than 8 rounds in 12 months, so the 24-month fallback takes in 2025.
    expect(top.window).toEqual({ months: 24, start: '2024-08-02', end: '2026-08-02' });
    expect(ratingsOf(top)).toEqual([1000, 950, 940]);
  });

  it('never lists a manual round, though one can anchor the window', () => {
    const rounds = manualToRounds([manual(1100, '2026-10-10'), manual(1090, '2026-10-12')]);
    const model = buildModel(stored, 100001, NOW, rounds);
    expect(ratingsOf(topEight(model, THIS_YEAR, TODAY))).toEqual([960, 955, 950, 940]);
    const top = topEight(model, WINDOW, TODAY);
    // The manual round on 10 Oct is the most recent one before the deadline.
    expect(top.window?.end).toBe('2026-10-10');
    expect(ratingsOf(top)).toEqual([1000, 950, 940]);
  });

  it('takes a chosen year', () => {
    const top = topEight(buildModel(stored, 100001, NOW), { kind: 'year', year: 2025 }, TODAY);
    expect(top).toMatchObject({ year: 2025, currentYear: 2026 });
    expect(ratingsOf(top)).toEqual([1000]);
  });

  it('takes a custom range with both dates included', () => {
    const model = buildModel(stored, 100001, NOW);
    const top = topEight(model, { kind: 'custom', from: '2025-12-31', to: '2026-01-01' }, TODAY);
    expect(top.year).toBeNull();
    expect(ratingsOf(top)).toEqual([1000, 940]);
    expect(ratingsOf(topEight(model, { kind: 'custom', from: '2026-01-02', to: '2026-08-01' }, TODAY))).toEqual([]);
  });

  it('has no window without rated rounds', () => {
    const top = topEight(buildModel({ ...stored, details: [], events: [] }, 100001, NOW), WINDOW, TODAY);
    expect(top.window).toBeNull();
    expect(top.result.found).toBe(0);
  });
});

describe('periodYears', () => {
  it('lists the years with a rated round and the current year, newest first', () => {
    const model = buildModel(stored, 100001, NOW);
    expect(periodYears(model, THIS_YEAR, TODAY)).toEqual([2026, 2025]);
    expect(periodYears(model, THIS_YEAR, '2028-03-01')).toEqual([2028, 2026, 2025]);
  });

  it('leaves out years with only manual or DNF rounds, but keeps a chosen year', () => {
    const rounds = manualToRounds([manual(990, '2023-05-01')]);
    const dnf = rawDetailsRow({ eventId: '900020', date: '1-May-2022', score: '999', rating: '' });
    const model = buildModel({ ...stored, details: [...stored.details!, dnf] }, 100001, NOW, rounds);
    expect(periodYears(model, THIS_YEAR, TODAY)).toEqual([2026, 2025]);
    expect(periodYears(model, { kind: 'year', year: 2019 }, TODAY)).toEqual([2026, 2025, 2019]);
  });
});

describe('own rounds', () => {
  const rounds = manualToRounds([manual(1060, '2026-09-01'), manual(990, '2023-05-01')]);
  const model = buildModel(stored, 100001, NOW, rounds);

  it('counts manual rounds and adds their years only when switched on', () => {
    const off = topEight(model, THIS_YEAR, TODAY);
    expect(off.own).toBe(false);
    expect(off.hasOwn).toBe(true);
    expect(ratingsOf(off)).not.toContain(1060);
    expect(off.years).toEqual([2026, 2025]);
    const on = topEight(model, THIS_YEAR, TODAY, true);
    expect(on.own).toBe(true);
    expect(ratingsOf(on)[0]).toBe(1060);
    expect(on.years).toEqual([2026, 2025, 2023]);
    expect(periodYears(model, THIS_YEAR, TODAY, true)).toEqual([2026, 2025, 2023]);
  });

  it('knows when the player has no rated manual round', () => {
    expect(topEight(buildModel(stored, 100001, NOW), THIS_YEAR, TODAY, true).hasOwn).toBe(false);
  });
});
