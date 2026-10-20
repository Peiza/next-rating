import { describe, expect, it } from 'vitest';
import { predictRating } from '../../src/engine/rating';
import { MAX_TARGET_ROUND, targetAverage } from '../../src/engine/target';
import type { RoundInput } from '../../src/engine/types';

let nextId = 0;

/** A one-round event. */
function round(rating: number, date: string, extra: Partial<RoundInput> = {}): RoundInput {
  nextId += 1;
  return { id: `r${nextId}`, rating, date, eventKey: `e${nextId}`, source: 'official', ...extra };
}

/** Rounds on the 1st of each month, oldest first, ending on 2026-06-01. */
function monthly(ratings: number[]): RoundInput[] {
  return ratings.map((rating, i) => {
    const month = 6 - ratings.length + 1 + i;
    const [year, m] = month >= 1 ? [2026, month] : [2025, month + 12];
    return round(rating, `${year}-${String(m).padStart(2, '0')}-01`);
  });
}

/** The prediction with `count` new rounds rated `rating` on `date`, built independently of targetAverage. */
function predictWith(rounds: RoundInput[], count: number, date: string, rating: number, deadline?: string): number | null {
  const added = Array.from({ length: count }, (_, i) => round(rating, date, { id: `new${i}`, eventKey: `new${i}`, source: 'manual' }));
  return predictRating([...added, ...rounds], deadline === undefined ? {} : { deadline }).rating;
}

const TODAY = '2026-10-20';
/** Eight rounds with some spread, so a 950 round is not an outlier among them. */
const SPREAD = [1040, 960, 1020, 980, 1030, 970, 1010, 990];

describe('targetAverage', () => {
  it('finds the lowest average that reaches the target, with double weighting', () => {
    // 6 + 3 new rounds = 9 counted, so the 3 new ones count twice:
    // (6 × 950 + 2 × 3 × R) / 12 must round to 970, so R ≥ 989.
    const rounds = monthly([950, 950, 950, 950, 950, 950]);
    const result = targetAverage(rounds, 970, { count: 3, date: TODAY });
    expect(result).toEqual({ without: 950, reached: false, average: 989, rating: 970 });
    expect(predictWith(rounds, 3, TODAY, 989)).toBe(970);
    expect(predictWith(rounds, 3, TODAY, 988)).toBe(969);
  });

  it('needs more without double weighting', () => {
    // 5 + 3 new rounds = 8 counted, all once: (5 × 950 + 3 × R) / 8 must round to 970.
    const result = targetAverage(monthly([950, 950, 950, 950, 950]), 970, { count: 3, date: TODAY });
    expect(result.average).toBe(1002);
  });

  it('lets an old round leave the window, since the new rounds are dated today', () => {
    const rounds = [...monthly(SPREAD), round(950, '2025-07-01')];
    const today = targetAverage(rounds, 1000, { count: 3, date: TODAY });
    const soon = targetAverage(rounds, 1000, { count: 3, date: '2026-06-02' });
    expect(today.average!).toBeLessThan(soon.average!);
    const prediction = predictRating([round(today.average!, TODAY, { source: 'manual' }), ...rounds]);
    expect(prediction.rounds.at(-1)!.status).toBe('outside-window');
  });

  it('never counts an official round PDGA left out', () => {
    const rounds = monthly(SPREAD).map((input) => ({ ...input, pdga: { evaluated: true, included: true } }));
    const xTier = round(1100, '2026-03-15', { pdga: { evaluated: false, included: false } });
    expect(targetAverage([xTier, ...rounds], 1010, { count: 3, date: TODAY })).toEqual(
      targetAverage(rounds, 1010, { count: 3, date: TODAY }),
    );
  });

  it('leaves out the events the user left out', () => {
    const rounds = monthly(SPREAD);
    const xTier = round(1100, '2026-03-15', { source: 'unofficial', eventKey: 'x' });
    expect(targetAverage([xTier, ...rounds], 1010, { count: 3, date: TODAY, leaveOut: new Set(['x']) })).toEqual(
      targetAverage(rounds, 1010, { count: 3, date: TODAY }),
    );
    expect(targetAverage([xTier, ...rounds], 1010, { count: 3, date: TODAY }).average).toBeLessThan(
      targetAverage(rounds, 1010, { count: 3, date: TODAY }).average!,
    );
  });

  it('leaves out new rounds after the deadline', () => {
    const rounds = monthly([950, 950, 950, 950, 950, 950]);
    const later = round(800, '2026-11-15', { source: 'unofficial' });
    const options = { count: 3, date: TODAY, deadline: '2026-11-08' };
    expect(targetAverage([later, ...rounds], 970, options)).toEqual(targetAverage(rounds, 970, options));
    expect(() => targetAverage(rounds, 970, { ...options, date: '2026-11-09' })).toThrow(RangeError);
  });

  it('says when the target is already reached, and what keeps it', () => {
    const rounds = monthly(SPREAD);
    const result = targetAverage(rounds, 990, { count: 3, date: TODAY });
    expect(result.without).toBe(1000);
    expect(result.reached).toBe(true);
    expect(result.average!).toBeLessThan(990);
    expect(predictWith(rounds, 3, TODAY, result.average!)).toBeGreaterThanOrEqual(990);
    expect(predictWith(rounds, 3, TODAY, result.average! - 1)).toBeLessThan(990);
  });

  it(`is out of reach when even ${MAX_TARGET_ROUND} rounds fall short`, () => {
    const rounds = monthly(Array<number>(12).fill(900));
    const result = targetAverage(rounds, 1000, { count: 1, date: TODAY });
    expect(result.average).toBeNull();
    expect(result.reached).toBe(false);
    expect(result.rating).toBe(predictWith(rounds, 1, TODAY, MAX_TARGET_ROUND));
    expect(result.rating!).toBeLessThan(1000);
  });

  it('answers above a dip: a low round that is dropped can reach what a middling one cannot', () => {
    // A very low new round is dropped as an outlier but still moves the
    // window, so the old 950 round leaves it and the prediction rises.
    const rounds = [...monthly(SPREAD), round(950, '2025-07-01')];
    const dropped = predictWith(rounds, 1, TODAY, 0)!;
    expect(dropped).toBeGreaterThan(predictRating(rounds).rating!);
    const result = targetAverage(rounds, dropped, { count: 1, date: TODAY });
    expect(result.average!).toBeGreaterThan(900);
    expect(predictWith(rounds, 1, TODAY, result.average! - 1)).toBeLessThan(dropped);
    for (let rating = result.average!; rating <= MAX_TARGET_ROUND; rating += 1) {
      expect(predictWith(rounds, 1, TODAY, rating)).toBeGreaterThanOrEqual(dropped);
    }
  });

  it('needs the target itself without rated rounds', () => {
    expect(targetAverage([], 1000, { count: 3, date: TODAY })).toEqual({
      without: null,
      reached: false,
      average: 1000,
      rating: 1000,
    });
  });

  it('rejects a count or target that is not a positive whole number', () => {
    expect(() => targetAverage([], 1000, { count: 0, date: TODAY })).toThrow(RangeError);
    expect(() => targetAverage([], 1000, { count: 1.5, date: TODAY })).toThrow(RangeError);
    expect(() => targetAverage([], 0, { count: 3, date: TODAY })).toThrow(RangeError);
    expect(() => targetAverage([], 999.5, { count: 3, date: TODAY })).toThrow(RangeError);
  });
});
