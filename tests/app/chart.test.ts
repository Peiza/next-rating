import { describe, expect, it } from 'vitest';
import { chartData, chartYears, dayNumber, monthTicks, ratingAxis, type ChartPeriod } from '../../src/app/chart';
import type { StoredImport } from '../../src/app/import';
import { buildModel, manualToRounds } from '../../src/app/model';
import { rawDetailsRow, rawEvent, rawPlayer } from '../handoff/raw';

/** Monday of update week: after the 11 Oct report deadline, before the 13 Oct update. */
const NOW = new Date('2026-10-12T10:00:00.000Z');
const TODAY = '2026-10-12';
const RECENT: ChartPeriod = { kind: 'recent' };

const stored: StoredImport = {
  at: '2026-10-12T09:00:00.000Z',
  player: rawPlayer({ currentRating: '948' }),
  details: [
    rawDetailsRow({ eventId: '900009', date: '1-Jun-2024', rating: '900' }),
    rawDetailsRow({ eventId: '900010', date: '31-Dec-2025', rating: '1000' }),
    rawDetailsRow({ eventId: '900011', date: '1-Jan-2026', rating: '940' }),
    rawDetailsRow({ eventId: '900012', date: '2-Aug-2026', rating: '950', roundLabel: '1', round: '1' }),
    rawDetailsRow({ eventId: '900012', date: '2-Aug-2026', rating: '952', roundLabel: '2', round: '2' }),
  ],
  // An unofficial event after the deadline: it counts in the following update.
  events: [rawEvent({ eventId: '900013', date: '12-Oct-2026' })],
};

const model = buildModel(stored, 100001, NOW);

describe('chartData', () => {
  it('shows the last 24 months by default, oldest first, with each round\'s kind and mark', () => {
    const chart = chartData(model, RECENT, TODAY);
    expect([chart.from, chart.to]).toEqual(['2024-10-12', TODAY]);
    expect(chart.points.map((point) => [point.date, point.rating, point.kind, point.mark])).toEqual([
      ['2025-12-31', 1000, 'official', 'counts'],
      ['2026-01-01', 940, 'official', 'counts'],
      ['2026-08-02', 950, 'official', 'counts'],
      ['2026-08-02', 952, 'official', 'counts'],
      ['2026-10-12', 960, 'unofficial', 'not'],
      ['2026-10-12', 955, 'unofficial', 'not'],
    ]);
    // Rounds of one day keep the event's order.
    expect(chart.points[2]!.row.round.roundLabel).toBe('1');
  });

  it('ends at a planned round later than today, which shows as your own', () => {
    const rounds = manualToRounds([{ id: 'm1', rating: 990, date: '2026-12-01', eventName: '', holes: null }]);
    const chart = chartData(buildModel(stored, 100001, NOW, rounds), RECENT, TODAY);
    expect(chart.to).toBe('2026-12-01');
    expect(chart.points.at(-1)).toMatchObject({ kind: 'own', rating: 990 });
  });

  it('marks rounds that count twice, are dropped or left out', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      rawDetailsRow({ eventId: String(900100 + i), date: `${i + 1}-Sep-2026`, rating: String(i === 0 ? 700 : 950 + i) }),
    );
    const marks = (leftOut: string[] = []) =>
      chartData(buildModel({ ...stored, details: many }, 100001, NOW, [], leftOut), RECENT, TODAY).points.map((point) => [point.rating, point.mark]);
    expect(marks().slice(0, 1)).toEqual([[700, 'ruled-out']]);
    expect(marks().slice(-6, -2)).toEqual([
      [956, 'counts'],
      [957, 'twice'],
      [958, 'twice'],
      [959, 'twice'],
    ]);
    expect(marks(['e:900013']).slice(-2)).toEqual([
      [960, 'ruled-out'],
      [955, 'ruled-out'],
    ]);
  });

  it('shades the prediction window within the period', () => {
    const { window } = chartData(model, RECENT, TODAY);
    expect(window).toEqual({ months: 24, start: '2024-08-02', end: '2026-08-02' });
    expect(chartData(model, RECENT, TODAY).band).toEqual({ from: '2024-10-12', to: '2026-08-02' });
    expect(chartData(model, { kind: 'year', year: 2026 }, TODAY).band).toEqual({ from: '2026-01-01', to: '2026-08-02' });
    expect(chartData(model, { kind: 'custom', from: '2026-09-01', to: '2026-10-12' }, TODAY).band).toBeNull();
  });

  it('takes a year, the rating window or a custom range', () => {
    const year = chartData(model, { kind: 'year', year: null }, TODAY);
    expect([year.year, year.from, year.to]).toEqual([2026, '2026-01-01', '2026-12-31']);
    expect(year.points.map((point) => point.rating)).toEqual([940, 950, 952, 960, 955]);
    const window = chartData(model, { kind: 'window' }, TODAY);
    expect([window.from, window.to]).toEqual(['2024-08-02', '2026-08-02']);
    expect(window.points.map((point) => point.rating)).toEqual([1000, 940, 950, 952]);
    const custom = chartData(model, { kind: 'custom', from: '2024-01-01', to: '2024-12-31' }, TODAY);
    expect(custom.points.map((point) => [point.rating, point.mark])).toEqual([[900, 'not']]);
  });

  it('draws the official and predicted ratings, and takes them into the y range', () => {
    const chart = chartData(model, { kind: 'custom', from: '2026-10-01', to: '2026-10-12' }, TODAY);
    expect(chart.official).toBe(948);
    expect(chart.predicted).toBe(model.prediction.rating);
    expect(chart.y).toEqual({ min: 945, max: 960, ticks: [945, 950, 955, 960] });
  });

  it('has no y range without rounds in the period', () => {
    const chart = chartData(model, { kind: 'year', year: 2020 }, TODAY);
    expect(chart.points).toEqual([]);
    expect(chart.y).toBeNull();
  });

  it('offers the years with a rated round, the current year and the chosen one', () => {
    expect(chartYears(model, RECENT, TODAY)).toEqual([2026, 2025, 2024]);
    expect(chartYears(model, { kind: 'year', year: 2019 }, '2027-01-02')).toEqual([2027, 2026, 2025, 2024, 2019]);
  });
});

describe('ratingAxis', () => {
  it('picks the smallest step with at most five gaps', () => {
    expect(ratingAxis([941, 958])).toEqual({ min: 940, max: 960, ticks: [940, 945, 950, 955, 960] });
    expect(ratingAxis([903, 1012])).toEqual({ min: 900, max: 1025, ticks: [900, 925, 950, 975, 1000, 1025] });
    expect(ratingAxis([700, 1010])).toEqual({ min: 700, max: 1100, ticks: [700, 800, 900, 1000, 1100] });
  });

  it('puts a single value between two ticks, and has none without values', () => {
    expect(ratingAxis([950])).toEqual({ min: 945, max: 955, ticks: [945, 950, 955] });
    expect(ratingAxis([])).toBeNull();
  });
});

describe('monthTicks', () => {
  it('ticks every six months over two years, with the year on the first and on January', () => {
    expect(monthTicks('2024-10-12', '2026-10-12')).toEqual([
      { date: '2025-01-01', year: true },
      { date: '2025-07-01', year: false },
      { date: '2026-01-01', year: true },
      { date: '2026-07-01', year: false },
    ]);
  });

  it('ticks every quarter in a calendar year', () => {
    expect(monthTicks('2026-01-01', '2026-12-31').map((tick) => tick.date)).toEqual(['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01']);
  });

  it('ticks every month in a short range, and only the ends below two months', () => {
    expect(monthTicks('2026-08-02', '2026-11-30').map((tick) => tick.date)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
    expect(monthTicks('2026-09-15', '2026-10-12')).toEqual([
      { date: '2026-09-15', year: true },
      { date: '2026-10-12', year: true },
    ]);
  });

  it('ticks on January only over many years', () => {
    expect(monthTicks('2018-03-01', '2026-10-12').map((tick) => tick.date)).toEqual([
      '2020-01-01',
      '2022-01-01',
      '2024-01-01',
      '2026-01-01',
    ]);
  });
});

describe('dayNumber', () => {
  it('counts days, across a leap day', () => {
    expect(dayNumber('2024-03-01') - dayNumber('2024-02-28')).toBe(2);
    expect(dayNumber('1970-01-01')).toBe(0);
  });
});
