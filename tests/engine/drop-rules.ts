import { RULES, selectDoubleWeighted } from '../../src/engine/rating';
import { mean, populationStdDev, weightedMean } from '../../src/engine/stats';
import type { RoundInput } from '../../src/engine/types';

/*
 * Candidate rules for what PDGA does, checked against saved pdga.com pages by
 * the local-only rule check in fixture.test.ts. The engine implements one of
 * each; the others stay here so a new fixture shows whether it still is the
 * only one that matches.
 */

/** Returns the indices, into `rounds`, of the window rounds the rule drops. */
export type DropRule = (rounds: readonly RoundInput[], window: readonly number[]) => Set<number>;

function limit(average: number, stdDev: number): number {
  return Math.max(average - RULES.outlierPoints, average - RULES.outlierStdDevs * stdDev);
}

function weightedLimit(ratings: readonly number[], weights: readonly number[]): number {
  const average = weightedMean(ratings, weights);
  const variance = weightedMean(ratings.map((rating) => (rating - average) ** 2), weights);
  return limit(average, Math.sqrt(variance));
}

const ratingOf = (rounds: readonly RoundInput[], i: number) => rounds[i]!.rating!;

export const DROP_RULES: Record<string, DropRule> = {
  /** The first engine rule: one limit from all rounds in the window. */
  'all rounds': (rounds, window) => {
    const ratings = window.map((i) => ratingOf(rounds, i));
    const cut = limit(mean(ratings), populationStdDev(ratings));
    return new Set(window.filter((i) => ratingOf(rounds, i) < cut));
  },
  /** The engine rule: each round against the plain mean and stdev of the other rounds. */
  'leave one out': (rounds, window) =>
    new Set(
      window.filter((i) => {
        const others = window.filter((j) => j !== i).map((j) => ratingOf(rounds, j));
        return ratingOf(rounds, i) < limit(mean(others), populationStdDev(others));
      }),
    ),
  /** One limit from all rounds, with the newest 25% of the window counting twice. */
  weighted: (rounds, window) => {
    const doubled =
      window.length >= RULES.minRoundsForDoubleWeight
        ? new Set(selectDoubleWeighted(rounds, window, Math.ceil(window.length * RULES.doubleWeightShare)))
        : new Set<number>();
    const cut = weightedLimit(
      window.map((i) => ratingOf(rounds, i)),
      window.map((i) => (doubled.has(i) ? 2 : 1)),
    );
    return new Set(window.filter((i) => ratingOf(rounds, i) < cut));
  },
};

export type HoleWeight = (holes: number | undefined) => number;

export const HOLE_WEIGHTS: Record<string, HoleWeight> = {
  'holes / 18': (holes = RULES.standardHoles) => holes / RULES.standardHoles,
  /** The engine rule. */
  'capped at 18': (holes = RULES.standardHoles) => Math.min(holes, RULES.standardHoles) / RULES.standardHoles,
  none: () => 1,
};

/**
 * The unrounded rating from the rounds PDGA counted (`counted` holds indices
 * into `rounds`), with the double-weight rule on top and the given hole weight.
 */
export function ratingFromCounted(
  rounds: readonly RoundInput[],
  counted: readonly number[],
  holeWeight: HoleWeight,
): number {
  const doubled =
    counted.length >= RULES.minRoundsForDoubleWeight
      ? new Set(selectDoubleWeighted(rounds, counted, Math.ceil(counted.length * RULES.doubleWeightShare)))
      : new Set<number>();
  return weightedMean(
    counted.map((i) => ratingOf(rounds, i)),
    counted.map((i) => (doubled.has(i) ? 2 : 1) * holeWeight(rounds[i]!.holes)),
  );
}
