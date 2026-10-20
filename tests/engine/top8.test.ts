import { describe, expect, it } from 'vitest';
import { topRounds } from '../../src/engine/top8';
import type { RoundInput } from '../../src/engine/types';

let nextId = 0;

/** A one-round event. */
function round(rating: number | null, date: string, extra: Partial<RoundInput> = {}): RoundInput {
  nextId += 1;
  return { id: `r${nextId}`, rating, date, eventKey: `e${nextId}`, source: 'official', ...extra };
}

const FROM = '2026-01-01';
const TO = '2026-12-31';
const ratings = (rounds: readonly RoundInput[]) => rounds.map((r) => r.rating);

describe('topRounds', () => {
  it('takes the 8 highest rated rounds, highest first, with sum, average and high', () => {
    const rounds = [1000, 990, 980, 970, 960, 950, 940, 930, 920, 1010].map((rating, i) =>
      round(rating, `2026-03-${String(i + 1).padStart(2, '0')}`),
    );
    const result = topRounds(rounds, FROM, TO);
    expect(ratings(result.rounds)).toEqual([1010, 1000, 990, 980, 970, 960, 950, 940]);
    expect(result).toMatchObject({ found: 10, sum: 7800, average: 975, high: 1010 });
  });

  it('counts official and unofficial rounds, not DNF or manual ones', () => {
    const rounds = [
      round(950, '2026-02-01'),
      round(960, '2026-02-02', { source: 'unofficial' }),
      round(1100, '2026-02-03', { source: 'manual' }),
      round(null, '2026-02-04', { dnf: true }),
    ];
    const result = topRounds(rounds, FROM, TO);
    expect(ratings(result.rounds)).toEqual([960, 950]);
    expect(result.found).toBe(2);
  });

  it('includes both ends of the period', () => {
    const rounds = [
      round(900, '2025-12-31'),
      round(910, FROM),
      round(920, TO),
      round(930, '2027-01-01'),
    ];
    expect(ratings(topRounds(rounds, FROM, TO).rounds)).toEqual([920, 910]);
  });

  it('averages fewer than 8 rounds over those found', () => {
    const result = topRounds([round(1000, '2026-05-01'), round(951, '2026-05-02'), round(950, '2026-05-03')], FROM, TO);
    expect(result).toMatchObject({ found: 3, sum: 2901, average: 967, high: 1000 });
  });

  it('rounds the average half up', () => {
    expect(topRounds([round(1000, '2026-05-01'), round(951, '2026-05-02')], FROM, TO).average).toBe(976);
  });

  it('gives nothing without rounds in the period', () => {
    expect(topRounds([round(1000, '2025-05-01')], FROM, TO)).toEqual({
      rounds: [],
      found: 0,
      sum: null,
      average: null,
      high: null,
    });
  });

  it('lists the newer round first on equal ratings, then input order', () => {
    const older = round(980, '2026-04-01');
    const newer = round(980, '2026-06-01');
    const first = round(980, '2026-06-01');
    const second = round(980, '2026-06-01');
    expect(topRounds([older, newer, first, second], FROM, TO).rounds).toEqual([newer, first, second, older]);
  });

  it('counts short rounds fully, with no hole weighting', () => {
    const result = topRounds([round(1000, '2026-05-01', { holes: 9 }), round(900, '2026-05-02')], FROM, TO);
    expect(result).toMatchObject({ sum: 1900, average: 950 });
  });
});
