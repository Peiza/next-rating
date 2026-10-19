import { describe, expect, it } from 'vitest';
import { predictRating } from '../../src/engine/rating';
import type { Prediction, RoundInput, RoundStatus } from '../../src/engine/types';

let nextId = 0;

/** A one-round event unless an eventKey is given. */
function round(rating: number, date: string, extra: Partial<RoundInput> = {}): RoundInput {
  nextId += 1;
  return { id: `r${nextId}`, rating, date, eventKey: `e${nextId}`, source: 'official', ...extra };
}

/** One round per week, newest first, ending on `latest`. */
function weekly(ratings: number[], latest = '2026-08-27'): RoundInput[] {
  const end = Date.parse(`${latest}T00:00:00Z`);
  return ratings.map((rating, i) =>
    round(rating, new Date(end - i * 7 * 86_400_000).toISOString().slice(0, 10)),
  );
}

function statusOf(prediction: Prediction, input: RoundInput): RoundStatus | undefined {
  return prediction.rounds.find((result) => result.id === input.id)?.status;
}

function statuses(prediction: Prediction): RoundStatus[] {
  return prediction.rounds.map((result) => result.status);
}

describe('predictRating', () => {
  it('returns no rating without rounds', () => {
    const prediction = predictRating([]);
    expect(prediction.rating).toBeNull();
    expect(prediction.exact).toBeNull();
    expect(prediction.change).toBeNull();
    expect(prediction.stats.totalRounds).toBe(0);
    expect(prediction.stats.windowMonths).toBeNull();
  });

  it('averages a few rounds without dropping or doubling', () => {
    const prediction = predictRating(weekly([1000, 950, 900]));
    expect(prediction.exact).toBe(950);
    expect(prediction.rating).toBe(950);
    expect(statuses(prediction)).toEqual(['included', 'included', 'included']);
    expect(prediction.stats.dropThreshold).toBeNull();
  });

  it('keeps results in input order', () => {
    const rounds = [round(900, '2026-01-01'), round(1000, '2026-06-01'), round(950, '2026-03-01')];
    expect(predictRating(rounds).rounds.map((result) => result.id)).toEqual(rounds.map((r) => r.id));
  });

  it('reports the change against the current rating', () => {
    const rounds = weekly([1000, 950, 900]);
    expect(predictRating(rounds, { currentRating: 940 }).change).toBe(10);
    expect(predictRating(rounds, { currentRating: 960 }).change).toBe(-10);
    expect(predictRating(rounds).change).toBeNull();
  });

  describe('window', () => {
    it('uses 12 months back from the most recent round, inclusive', () => {
      const edge = round(950, '2025-08-27');
      const outside = round(500, '2025-08-26');
      const prediction = predictRating([...weekly([950, 950, 950, 950, 950, 950, 950]), edge, outside]);
      expect(prediction.stats.windowMonths).toBe(12);
      expect(prediction.stats.windowStart).toBe('2025-08-27');
      expect(statusOf(prediction, edge)).toBe('included');
      expect(statusOf(prediction, outside)).toBe('outside-window');
      expect(prediction.rating).toBe(950);
    });

    it('keeps 12 months when exactly 8 rounds fall inside', () => {
      const old = round(800, '2025-01-01');
      const prediction = predictRating([...weekly([950, 950, 950, 950, 950, 950, 950, 950]), old]);
      expect(prediction.stats.windowMonths).toBe(12);
      expect(statusOf(prediction, old)).toBe('outside-window');
      expect(prediction.stats.roundsOutsideWindow).toBe(1);
    });

    it('falls back to 24 months when fewer than 8 rounds fall inside 12 months', () => {
      const older = [round(940, '2025-06-01'), round(930, '2024-09-01'), round(920, '2024-08-27')];
      const tooOld = round(500, '2024-08-26');
      const prediction = predictRating([...weekly([950, 950, 950, 950, 950, 950, 950]), ...older, tooOld]);
      expect(prediction.stats.windowMonths).toBe(24);
      expect(prediction.stats.windowStart).toBe('2024-08-27');
      for (const r of older) expect(statusOf(prediction, r)).not.toBe('outside-window');
      expect(statusOf(prediction, tooOld)).toBe('outside-window');
      expect(prediction.stats.roundsInWindow).toBe(10);
    });

    it('clamps the window start at month end', () => {
      const prediction = predictRating([round(950, '2028-02-29'), round(950, '2027-02-28'), round(950, '2027-02-27')]);
      // Too few rounds for 12 months, so 24 months back from 2028-02-29.
      expect(prediction.stats.windowStart).toBe('2026-02-28');
      expect(predictRating(weekly(Array(8).fill(950), '2028-02-29')).stats.windowStart).toBe('2027-02-28');
    });
  });

  describe('outlier drop', () => {
    it('does not drop with only 6 rounds in the window', () => {
      const prediction = predictRating(weekly([950, 950, 950, 950, 950, 700]));
      expect(statuses(prediction)).not.toContain('dropped');
      expect(prediction.stats.dropThreshold).toBeNull();
      expect(prediction.rating).toBe(908);
    });

    it('drops a round more than 100 below the average with 7 rounds', () => {
      const prediction = predictRating(weekly([950, 950, 950, 950, 950, 950, 700]));
      expect(statuses(prediction).at(-1)).toBe('dropped');
      expect(prediction.stats.dropThreshold).toBeCloseTo(814.29, 2);
      expect(prediction.stats.roundsDropped).toBe(1);
      expect(prediction.rating).toBe(950);
    });

    it('keeps a round exactly 100 below the average', () => {
      // Average 1000, 2.5 standard deviations is about 116, so the limit is 900.
      const prediction = predictRating(weekly([1000, 1000, 1000, 1000, 1050, 1050, 900]));
      expect(prediction.stats.dropThreshold).toBe(900);
      expect(statuses(prediction)).not.toContain('dropped');
    });

    it('drops a round just below the 100-point limit', () => {
      const prediction = predictRating(weekly([1000, 1000, 1000, 1000, 1050, 1051, 899]));
      expect(prediction.stats.dropThreshold).toBe(900);
      expect(statuses(prediction).at(-1)).toBe('dropped');
    });

    it('uses 2.5 standard deviations when that limit is stricter', () => {
      // Average 992.5, standard deviation about 19.8: the limit is about 942.9, not 892.5.
      const prediction = predictRating(weekly([1000, 1000, 1000, 1000, 1000, 1000, 1000, 940]));
      expect(prediction.stats.meanMinusPoints).toBe(892.5);
      expect(prediction.stats.dropThreshold).toBeCloseTo(942.89, 2);
      expect(statuses(prediction).at(-1)).toBe('dropped');
      expect(prediction.rating).toBe(1000);
    });

    it('computes the limit from all rounds in the window, before dropping', () => {
      const prediction = predictRating(weekly([950, 950, 950, 950, 950, 950, 700]));
      expect(prediction.stats.averageInWindow).toBeCloseTo(914.29, 2);
      expect(prediction.stats.averageCounted).toBe(950);
    });

    it('includes a previously dropped round again when new rounds lower the limit', () => {
      const earlier = weekly([1000, 1000, 1000, 1000, 1000, 1000, 1000, 940], '2026-06-30');
      const before = predictRating(earlier);
      const lowRound = earlier.at(-1)!;
      expect(statusOf(before, lowRound)).toBe('dropped');

      const newRounds = [round(900, '2026-08-20'), round(910, '2026-08-13')];
      const after = predictRating([...newRounds, ...earlier]);
      // Average 975, standard deviation about 39.3: the limit drops to about 876.7.
      expect(after.stats.dropThreshold).toBeCloseTo(876.7, 1);
      expect(statusOf(after, lowRound)).toBe('included');
      expect(after.stats.roundsDropped).toBe(0);
    });
  });

  describe('double weighting', () => {
    it('does not double-weight with 8 counted rounds', () => {
      const prediction = predictRating(weekly([1000, 990, 980, 970, 960, 950, 940, 930]));
      expect(statuses(prediction)).not.toContain('doubled');
      expect(prediction.stats.roundsDoubled).toBe(0);
      expect(prediction.exact).toBe(965);
    });

    it('double-weights the most recent 25%, rounded up, with 9 counted rounds', () => {
      const prediction = predictRating(weekly([1000, 990, 980, 970, 960, 950, 940, 930, 920]));
      expect(statuses(prediction)).toEqual([
        'doubled', 'doubled', 'doubled',
        'included', 'included', 'included', 'included', 'included', 'included',
      ]);
      expect(prediction.stats.roundsDoubled).toBe(3);
      // (2 * (1000 + 990 + 980) + 970 + 960 + 950 + 940 + 930 + 920) / 12
      expect(prediction.exact).toBe(967.5);
      expect(prediction.rating).toBe(968);
    });

    it('counts only rounds that survive the outlier drop', () => {
      // 9 rounds in the window, one dropped: 8 count, so nothing is doubled.
      const prediction = predictRating(weekly([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 800]));
      expect(prediction.stats.roundsCounted).toBe(8);
      expect(prediction.stats.roundsDoubled).toBe(0);
    });

    it('double-weights the highest rated rounds of the event at the boundary', () => {
      const newest = round(1000, '2026-08-27');
      // Table order 960, 940, 970: the highest two are neither the first two nor the last two.
      const boundary = [960, 940, 970].map((rating, i) =>
        round(rating, '2026-08-23', { eventKey: 'boundary', id: `b${i}` }),
      );
      const older = weekly([950, 950, 950, 950, 950, 950, 950, 950], '2026-08-16');
      const prediction = predictRating([newest, ...boundary, ...older]);

      expect(prediction.stats.roundsCounted).toBe(12);
      expect(prediction.stats.roundsDoubled).toBe(3);
      expect(statusOf(prediction, newest)).toBe('doubled');
      expect(boundary.map((r) => statusOf(prediction, r))).toEqual(['doubled', 'included', 'doubled']);
      expect(older.map((r) => statusOf(prediction, r))).not.toContain('doubled');
      // (2 * (1000 + 960 + 970) + 940 + 8 * 950) / 15
      expect(prediction.exact).toBe(960);
    });

    it('doubles whole events when the boundary falls between events', () => {
      const event = [990, 980].map((rating, i) => round(rating, '2026-08-23', { eventKey: 'two', id: `t${i}` }));
      const rounds = [round(1000, '2026-08-27'), ...event, ...weekly([950, 950, 950, 950, 950, 950, 950, 950, 950], '2026-08-16')];
      const prediction = predictRating(rounds);
      expect(prediction.stats.roundsDoubled).toBe(3);
      expect(statuses(prediction).slice(0, 4)).toEqual(['doubled', 'doubled', 'doubled', 'included']);
    });

    it('treats the earlier event in the input as more recent on the same date', () => {
      const first = round(940, '2026-08-27');
      const second = round(990, '2026-08-27');
      const rounds = [
        ...weekly([960, 960], '2026-09-03'),
        first,
        second,
        ...weekly([950, 950, 950, 950, 950, 950, 950], '2026-08-20'),
      ];
      // 11 rounds, 3 doubled: the two newest, then one of the two same-day events.
      const prediction = predictRating(rounds);
      expect(prediction.stats.roundsDoubled).toBe(3);
      expect(statusOf(prediction, first)).toBe('doubled');
      expect(statusOf(prediction, second)).toBe('included');
    });

    it('uses the latest date of an event that spans several dates', () => {
      const event = [
        round(960, '2026-08-22', { eventKey: 'weekend' }),
        round(970, '2026-08-23', { eventKey: 'weekend' }),
      ];
      const single = round(1000, '2026-08-22');
      const prediction = predictRating([single, ...event, ...weekly([950, 950, 950, 950, 950, 950, 950], '2026-08-15')]);
      // 10 rounds, 3 doubled: the weekend event (latest 08-23) comes before the single round on 08-22.
      expect(event.map((r) => statusOf(prediction, r))).toEqual(['doubled', 'doubled']);
      expect(statusOf(prediction, single)).toBe('doubled');
    });
  });

  describe('hole weighting', () => {
    it('weights rounds by holes / 18', () => {
      const rounds = [round(1000, '2026-08-27'), round(900, '2026-08-20', { holes: 9 }), round(950, '2026-08-13', { holes: 27 })];
      const prediction = predictRating(rounds);
      expect(prediction.rounds.map((r) => r.weight)).toEqual([1, 0.5, 1.5]);
      // (1000 + 0.5 * 900 + 1.5 * 950) / 3
      expect(prediction.exact).toBeCloseTo(958.333, 3);
      expect(prediction.rating).toBe(958);
    });

    it('treats an unknown hole count as 18 and handles 19 holes', () => {
      const rounds = [round(1000, '2026-08-27', { holes: 19 }), round(900, '2026-08-20')];
      const prediction = predictRating(rounds);
      expect(prediction.rounds.map((r) => r.weight)).toEqual([19 / 18, 1]);
      expect(prediction.exact).toBeCloseTo((1000 * 19 + 900 * 18) / 37, 9);
    });

    it('combines hole weighting with double weighting', () => {
      const rounds = weekly([1000, 990, 980, 970, 960, 950, 940, 930, 920]);
      rounds[0] = { ...rounds[0]!, holes: 9 };
      const prediction = predictRating(rounds);
      expect(prediction.rounds[0]).toMatchObject({ status: 'doubled', weight: 1 });
      expect(prediction.rounds[1]).toMatchObject({ status: 'doubled', weight: 2 });
    });

    it('uses unweighted ratings for the outlier limit', () => {
      const rounds = weekly([950, 950, 950, 950, 950, 950, 700]);
      rounds[6] = { ...rounds[6]!, holes: 9 };
      const prediction = predictRating(rounds);
      expect(prediction.stats.averageInWindow).toBeCloseTo(914.29, 2);
      expect(prediction.rounds[6]).toMatchObject({ status: 'dropped', weight: 0 });
    });

    it('counts rounds, not hole weight, for the 25% share', () => {
      const rounds = weekly([1000, 990, 980, 970, 960, 950, 940, 930, 920]).map((r) => ({ ...r, holes: 9 }));
      expect(predictRating(rounds).stats.roundsDoubled).toBe(3);
    });
  });

  describe('DNF', () => {
    it('never counts a DNF round', () => {
      const dnf = round(1100, '2026-08-20', { dnf: true });
      const prediction = predictRating([...weekly([950, 950]), dnf]);
      expect(statusOf(prediction, dnf)).toBe('dnf');
      expect(prediction.rating).toBe(950);
      expect(prediction.stats.dnfRounds).toBe(1);
      expect(prediction.stats.totalRounds).toBe(2);
    });

    it('accepts a DNF round without a rating', () => {
      const prediction = predictRating([round(950, '2026-08-27'), { ...round(0, '2026-08-27'), rating: null, dnf: true }]);
      expect(prediction.rating).toBe(950);
    });

    it('does not move the window with a DNF round', () => {
      const prediction = predictRating([round(950, '2026-08-27'), round(900, '2028-01-01', { dnf: true })]);
      expect(prediction.stats.windowEnd).toBe('2026-08-27');
    });

    it('gives no rating when every round is a DNF', () => {
      expect(predictRating([round(950, '2026-08-27', { dnf: true })]).rating).toBeNull();
    });
  });

  describe('stats', () => {
    it('fills the stats panel', () => {
      const rounds = [
        ...weekly([950, 950, 950, 950, 950, 950, 700]),
        round(600, '2024-01-01', { eventKey: 'old' }),
        round(1000, '2026-08-01', { source: 'manual' }),
      ];
      const { stats } = predictRating(rounds);
      expect(stats).toMatchObject({
        totalRounds: 9,
        careerEvents: 8,
        windowMonths: 12,
        windowEnd: '2026-08-27',
        roundsInWindow: 8,
        roundsOutsideWindow: 1,
        roundsDropped: 1,
        roundsCounted: 7,
        roundsDoubled: 0,
      });
      expect(stats.averageAll).toBeCloseTo((950 * 6 + 700 + 600 + 1000) / 9, 9);
      expect(stats.meanMinusStdDevs).toBeCloseTo(stats.averageInWindow! - 2.5 * stats.stdDev!, 9);
    });
  });

  describe('validation', () => {
    it('rejects duplicate ids', () => {
      expect(() => predictRating([round(950, '2026-08-27', { id: 'x' }), round(950, '2026-08-20', { id: 'x' })])).toThrow(RangeError);
    });

    it('rejects invalid dates, ratings and hole counts', () => {
      expect(() => predictRating([round(950, '27-Aug-2026')])).toThrow(RangeError);
      expect(() => predictRating([round(Number.NaN, '2026-08-27')])).toThrow(RangeError);
      expect(() => predictRating([{ ...round(0, '2026-08-27'), rating: null }])).toThrow(RangeError);
      expect(() => predictRating([round(950, '2026-08-27', { holes: 0 })])).toThrow(RangeError);
      expect(() => predictRating([round(950, '2026-08-27', { holes: 4.5 })])).toThrow(RangeError);
    });
  });
});
