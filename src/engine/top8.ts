import { compareDates, type PlainDate } from './dates';
import type { RoundInput } from './types';

/** How many rounds the Top 8 takes, as in the PDGA Global Masters Series. */
export const TOP_COUNT = 8;

export interface TopResult<T extends RoundInput> {
  /** The highest rated rounds, highest first, at most TOP_COUNT. */
  rounds: T[];
  /** Rated rounds in the period, so fewer than TOP_COUNT shows how many were found. */
  found: number;
  /** Null when no round is in the period. */
  sum: number | null;
  /** Sum over the rounds taken, rounded to a whole number. */
  average: number | null;
  high: number | null;
}

/**
 * A round the Top 8 can take: a rated official or unofficial round. Every
 * one counts, also one the prediction drops as an outlier. DNF and manual
 * rounds do not.
 */
export function isTopRound(round: RoundInput): boolean {
  return !round.dnf && round.rating !== null && round.source !== 'manual';
}

/**
 * The Top 8: the highest rated rounds (isTopRound) dated from `from` to
 * `to`, both inclusive, with no hole weighting. Equal ratings list the newer
 * round first, then keep input order.
 */
export function topRounds<T extends RoundInput>(
  rounds: readonly T[],
  from: PlainDate,
  to: PlainDate,
): TopResult<T> {
  const rated = rounds
    .map((round, index) => ({ round, index }))
    .filter(
      ({ round }) => isTopRound(round) && compareDates(round.date, from) >= 0 && compareDates(round.date, to) <= 0,
    )
    .sort(
      (a, b) =>
        b.round.rating! - a.round.rating! || compareDates(b.round.date, a.round.date) || a.index - b.index,
    );
  const top = rated.slice(0, TOP_COUNT).map(({ round }) => round);
  const sum = top.length > 0 ? top.reduce((total, round) => total + round.rating!, 0) : null;
  return {
    rounds: top,
    found: rated.length,
    sum,
    average: sum === null ? null : Math.round(sum / top.length),
    high: top[0]?.rating ?? null,
  };
}
