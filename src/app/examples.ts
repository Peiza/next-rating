import { MAX_TARGET_ROUND, predictRating, type PlainDate } from '../engine';
import { RANGES } from '../parsers/values';
import { withManualRounds, type Model } from './model';
import { withExampleRounds, type ManualRoundInput } from './players';
import type { StoredManualRound } from './storage';
import type { TargetAnswer } from './target';

/*
 * Example rounds under the target answer: rounds around the average needed,
 * spread like the player's own, that reach the target. Pure and without
 * Math.random, so the same tap gives the same rounds and the tests can check
 * them; the engine decides when the target is reached.
 */

/** The spread when the window has fewer than 2 rounds to measure it from. */
const DEFAULT_SPREAD = 15;
const SPREAD_RANGE = [5, 30] as const;
/** How far above the average needed the search goes before giving up. */
const MAX_STEPS = 60;

/**
 * The standard normal quantile, by Abramowitz and Stegun 26.2.23 (error
 * below 0.00045), close enough for whole ratings.
 */
function normalQuantile(p: number): number {
  if (p === 0.5) return 0;
  const q = Math.min(p, 1 - p);
  const t = Math.sqrt(-2 * Math.log(q));
  const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return p < 0.5 ? -z : z;
}

/** Rounds half away from 0, so the offsets stay symmetric and sum to 0. */
function roundSymmetric(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * How far each example round is from their average: the normal quantiles of
 * `count` evenly spaced points times `spread`, within ±2 spreads for up to 20
 * rounds. Highest first, then lowest, then the next highest and so on, ending
 * in the middle, so the list does not look sorted.
 */
export function exampleOffsets(count: number, spread: number): number[] {
  // "+ 0" turns a -0 into 0.
  const sorted = Array.from({ length: count }, (_, i) => roundSymmetric(spread * normalQuantile((i + 0.5) / count)) + 0);
  const order: number[] = [];
  for (let low = 0, high = count - 1; low <= high; high -= 1, low += 1) {
    order.push(sorted[high]!);
    if (low < high) order.push(sorted[low]!);
  }
  return order;
}

/**
 * The spread of the example rounds: the standard deviation of the rounds in
 * the prediction's window without the example rounds, rounded and kept within
 * 5–30.
 */
export function exampleSpread(model: Model, manual: readonly StoredManualRound[]): number {
  const { stats } = predictRating(withManualRounds(model, manual.filter((round) => !round.example)), {
    currentRating: model.player?.currentRating ?? null,
    deadline: model.nextUpdate.deadline,
    leaveOut: model.leaveOut,
  });
  if (stats.roundsInWindow < 2 || stats.stdDev === null) return DEFAULT_SPREAD;
  return Math.min(Math.max(Math.round(stats.stdDev), SPREAD_RANGE[0]), SPREAD_RANGE[1]);
}

export interface ExampleRounds {
  /** In the order they are stored. */
  rounds: ManualRoundInput[];
  /** The prediction for the answer's update with them. */
  rating: number;
}

function examplesAt(ratings: readonly number[], date: PlainDate): ManualRoundInput[] {
  return ratings.map((rating) => ({ rating, date, eventName: '', holes: 18, example: true }));
}

/**
 * Example rounds for the answer: `count` rounds on its date, each an event of
 * its own as the calculator assumes, around the average needed. Their
 * average goes up a point at a time until the real engine, on the rounds the
 * player then has, reaches the target in the answer's update. Null without
 * an average above 0, or when the target is still not reached.
 */
export function exampleRounds(model: Model, manual: readonly StoredManualRound[], answer: TargetAnswer): ExampleRounds | null {
  const { query, update, result } = answer;
  if (result.average === null || result.average <= 0) return null;
  const spread = exampleSpread(model, manual);
  const highest = normalQuantile((query.count - 0.5) / query.count);
  const options = { currentRating: model.player?.currentRating ?? null, deadline: update.deadline, leaveOut: model.leaveOut };
  for (let step = 0; step <= MAX_STEPS; step += 1) {
    const average = result.average + step;
    if (average > MAX_TARGET_ROUND) break;
    // Near the top the spread shrinks, so no round goes above MAX_TARGET_ROUND.
    const room = highest > 0 ? Math.floor((MAX_TARGET_ROUND - average) / highest) : spread;
    const ratings = exampleOffsets(query.count, Math.min(spread, room)).map((offset) =>
      Math.min(Math.max(average + offset, RANGES.rating[0]), MAX_TARGET_ROUND),
    );
    const rounds = examplesAt(ratings, query.date);
    const { rating } = predictRating(withManualRounds(model, withExampleRounds(manual, rounds)), options);
    if (rating !== null && rating >= query.target) return { rounds, rating };
  }
  return null;
}
