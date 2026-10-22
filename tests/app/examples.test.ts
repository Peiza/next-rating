import { describe, expect, it } from 'vitest';
import { exampleOffsets, exampleRounds, exampleSpread } from '../../src/app/examples';
import type { StoredImport } from '../../src/app/import';
import { buildModel, manualToRounds } from '../../src/app/model';
import { withExampleRounds } from '../../src/app/players';
import type { StoredManualRound } from '../../src/app/storage';
import { calculateTarget, type TargetQuery } from '../../src/app/target';
import { MAX_TARGET_ROUND } from '../../src/engine';
import { rawDetailsRow, rawPlayer } from '../handoff/raw';

const NOW = new Date('2026-10-20T10:00:00.000Z');
const TODAY = '2026-10-20';
/** The next update is 10 Nov (deadline 8 Nov), the following one 8 Dec (deadline 6 Dec). */
const AFTER_DEADLINE = '2026-11-20';

/** Official rounds, one event each, a week apart back from 2 August 2026. */
function stored(ratings: number[]): StoredImport {
  const details = ratings.map((rating, i) => {
    const date = new Date(Date.UTC(2026, 7, 2 - 7 * i));
    const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return rawDetailsRow({ eventId: String(900100 + i), date: day.replaceAll(' ', '-'), rating: String(rating) });
  });
  return { at: '2026-10-19T10:00:00.000Z', player: rawPlayer(), details, events: [] };
}

const PLAYER = stored([930, 940, 945, 950, 955, 960, 965, 975]);

function manual(id: string, rating: number, example = false): StoredManualRound {
  return { id, rating, date: '2026-10-01', eventName: '', holes: null, example, leftOut: false };
}

function modelOf(data: StoredImport, rounds: readonly StoredManualRound[] = []) {
  return buildModel(data, 100001, NOW, manualToRounds(rounds));
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

describe('exampleOffsets', () => {
  it('has no spread for one round', () => {
    expect(exampleOffsets(1, 15)).toEqual([0]);
  });

  it('spreads like a normal distribution, high, low, then the middle, summing to 0', () => {
    expect(exampleOffsets(3, 15)).toEqual([15, -15, 0]);
    for (const count of [2, 4, 5, 8, 13, 20]) {
      const offsets = exampleOffsets(count, 20);
      expect(offsets).toHaveLength(count);
      expect(offsets.reduce((a, b) => a + b, 0)).toBe(0);
      expect(Math.max(...offsets.map(Math.abs))).toBeLessThanOrEqual(40);
      expect(offsets[0]).toBe(Math.max(...offsets));
      expect(offsets[1]).toBe(Math.min(...offsets));
    }
  });

  it('grows with the spread', () => {
    expect(exampleOffsets(3, 30)[0]).toBeGreaterThan(exampleOffsets(3, 10)[0]!);
    expect(exampleOffsets(3, 0)).toEqual([0, 0, 0]);
  });
});

describe('exampleSpread', () => {
  it("is the standard deviation of the player's rounds in the window, rounded", () => {
    expect(exampleSpread(modelOf(stored([940, 960])), [])).toBe(10);
    expect(exampleSpread(modelOf(stored([930, 970])), [])).toBe(20);
  });

  it('stays within 5 and 30, and is 15 with fewer than 2 rounds', () => {
    expect(exampleSpread(modelOf(stored([950, 950])), [])).toBe(5);
    expect(exampleSpread(modelOf(stored([900, 1000])), [])).toBe(30);
    expect(exampleSpread(modelOf(stored([950])), [])).toBe(15);
  });

  it('leaves out the example rounds', () => {
    const examples = [manual('m1', 1100, true), manual('m2', 800, true)];
    expect(exampleSpread(modelOf(stored([940, 960]), examples), examples)).toBe(10);
  });

  it('leaves out unticked manual rounds', () => {
    const off = [{ ...manual('m1', 1100), leftOut: true }];
    expect(exampleSpread(modelOf(stored([940, 960]), off), off)).toBe(10);
  });
});

describe('exampleRounds', () => {
  const query: TargetQuery = { target: 970, count: 3, date: TODAY };

  it('adds rounds that reach the target, around the average needed', () => {
    const model = modelOf(PLAYER);
    const answer = calculateTarget(model, query);
    expect(answer.result.average).toBeGreaterThan(0);
    const examples = exampleRounds(model, [], answer)!;
    expect(examples.rounds).toHaveLength(3);
    expect(examples.rounds.every((round) => round.date === TODAY && round.holes === 18 && round.eventName === '' && round.example)).toBe(true);
    const ratings = examples.rounds.map((round) => round.rating);
    expect(mean(ratings)).toBeGreaterThanOrEqual(answer.result.average!);
    expect(new Set(ratings).size).toBe(3);
    // The stored rounds give the same prediction, which reaches the target.
    const after = modelOf(PLAYER, withExampleRounds([], examples.rounds));
    expect(after.prediction.rating).toBe(examples.rating);
    expect(examples.rating).toBeGreaterThanOrEqual(970);
  });

  it('gives the same rounds every time, also in place of earlier examples', () => {
    const model = modelOf(PLAYER);
    const answer = calculateTarget(model, query);
    const first = exampleRounds(model, [], answer)!;
    expect(exampleRounds(model, [], answer)).toEqual(first);
    const stored = withExampleRounds([manual('m1', 990)], first.rounds);
    const again = modelOf(PLAYER, stored);
    const ordinary = [manual('m1', 990)];
    expect(exampleRounds(again, stored, calculateTarget(again, query))).toEqual(
      exampleRounds(modelOf(PLAYER, ordinary), ordinary, calculateTarget(modelOf(PLAYER, ordinary), query)),
    );
  });

  it('reaches the target in the following update for a date after the deadline', () => {
    const model = modelOf(PLAYER);
    const answer = calculateTarget(model, { ...query, date: AFTER_DEADLINE });
    expect(answer.update.update).toBe('2026-12-08');
    const examples = exampleRounds(model, [], answer)!;
    const after = modelOf(PLAYER, withExampleRounds([], examples.rounds));
    expect(after.following?.rating).toBe(examples.rating);
    expect(examples.rating).toBeGreaterThanOrEqual(970);
  });

  it('keeps one round at the average needed or a little above', () => {
    const model = modelOf(PLAYER);
    const answer = calculateTarget(model, { ...query, count: 1 });
    const examples = exampleRounds(model, [], answer)!;
    expect(examples.rounds).toHaveLength(1);
    expect(examples.rounds[0]!.rating).toBeGreaterThanOrEqual(answer.result.average!);
  });

  it(`never goes above ${MAX_TARGET_ROUND} near the top`, () => {
    const model = modelOf(PLAYER);
    const answer = calculateTarget(model, { target: 1050, count: 5, date: TODAY });
    // The player's spread would take the highest round above it.
    expect(answer.result.average! + exampleOffsets(5, exampleSpread(model, []))[0]!).toBeGreaterThan(MAX_TARGET_ROUND);
    const examples = exampleRounds(model, [], answer)!;
    expect(Math.max(...examples.rounds.map((round) => round.rating))).toBeLessThanOrEqual(MAX_TARGET_ROUND);
    expect(examples.rating).toBeGreaterThanOrEqual(1050);
  });

  it('adds nothing without an average to aim for', () => {
    const model = modelOf(PLAYER);
    const out = calculateTarget(model, { target: 1500, count: 1, date: TODAY });
    expect(out.result.average).toBeNull();
    expect(exampleRounds(model, [], out)).toBeNull();
    const any = calculateTarget(model, { target: 900, count: 1, date: TODAY });
    expect(any.result.average).toBe(0);
    expect(exampleRounds(model, [], any)).toBeNull();
  });
});
