import { compareDates, isPlainDate, subtractMonths, type PlainDate } from './dates';
import { mean, populationStdDev, weightedMean } from './stats';
import type { PredictOptions, Prediction, RatingStats, RoundInput, RoundStatus } from './types';

/** Rules from pdga.com/ratings/guide, plus the PDGA Ratings team's clarification on double weighting. */
export const RULES = {
  windowMonths: 12,
  fallbackWindowMonths: 24,
  /** Fewer rounds than this in the 12-month window switches to the 24-month window. */
  minRoundsBeforeFallback: 8,
  /** Outliers are only dropped when at least this many rounds are in the window. */
  minRoundsForOutlierDrop: 7,
  outlierPoints: 100,
  outlierStdDevs: 2.5,
  /** Double weighting only applies when at least this many rounds count. */
  minRoundsForDoubleWeight: 9,
  doubleWeightShare: 0.25,
  standardHoles: 18,
} as const;

function validate(rounds: readonly RoundInput[]): void {
  const ids = new Set<string>();
  for (const round of rounds) {
    if (ids.has(round.id)) throw new RangeError(`Duplicate round id: ${round.id}`);
    ids.add(round.id);
    if (!isPlainDate(round.date)) throw new RangeError(`Invalid date for round ${round.id}`);
    if (!round.dnf && (round.rating === null || !Number.isFinite(round.rating))) {
      throw new RangeError(`Invalid rating for round ${round.id}`);
    }
    if (round.holes !== undefined && !(Number.isInteger(round.holes) && round.holes > 0)) {
      throw new RangeError(`Invalid hole count for round ${round.id}`);
    }
  }
}

/**
 * Picks the rounds to double-weight: the most recent `count` counted rounds,
 * taken event by event, newest event first. Events on the same date keep
 * input order, so earlier in the input counts as more recent (pdga.com lists
 * newest first). When the boundary falls inside an event, the event's highest
 * rated rounds are double-weighted, not the first or last in table order.
 */
function selectDoubleWeighted(
  rounds: readonly RoundInput[],
  counted: readonly number[],
  count: number,
): number[] {
  const events = new Map<string, { latest: PlainDate; first: number; members: number[] }>();
  for (const i of counted) {
    const round = rounds[i]!;
    const event = events.get(round.eventKey);
    if (event) {
      event.members.push(i);
      if (compareDates(round.date, event.latest) > 0) event.latest = round.date;
    } else {
      events.set(round.eventKey, { latest: round.date, first: i, members: [i] });
    }
  }
  const ordered = [...events.values()].sort(
    (a, b) => compareDates(b.latest, a.latest) || a.first - b.first,
  );

  const selected: number[] = [];
  let remaining = count;
  for (const event of ordered) {
    if (remaining === 0) break;
    if (event.members.length <= remaining) {
      selected.push(...event.members);
      remaining -= event.members.length;
    } else {
      const highestFirst = [...event.members].sort(
        (a, b) =>
          rounds[b]!.rating! - rounds[a]!.rating! ||
          compareDates(rounds[b]!.date, rounds[a]!.date) ||
          a - b,
      );
      selected.push(...highestFirst.slice(0, remaining));
      remaining = 0;
    }
  }
  return selected;
}

const nullable = (value: number): number | null => (Number.isNaN(value) ? null : value);

/**
 * Predicts the next rating from all known rounds: official, unofficial and
 * manual. PDGA's Included flags are never used: inclusion is recomputed from
 * scratch, since adding rounds can bring back previously dropped ones.
 */
export function predictRating(
  rounds: readonly RoundInput[],
  options: PredictOptions = {},
): Prediction {
  validate(rounds);

  const status: RoundStatus[] = rounds.map((round) => (round.dnf ? 'dnf' : 'outside-window'));
  const rated = rounds.flatMap((round, i) => (round.dnf ? [] : [i]));
  const ratingOf = (i: number) => rounds[i]!.rating!;
  const careerEvents = new Set(
    rounds.filter((round) => round.source !== 'manual').map((round) => round.eventKey),
  ).size;

  let windowMonths: 12 | 24 | null = null;
  let windowStart: PlainDate | null = null;
  let windowEnd: PlainDate | null = null;
  let inWindow: number[] = [];

  if (rated.length > 0) {
    windowEnd = rated.map((i) => rounds[i]!.date).reduce((a, b) => (compareDates(a, b) >= 0 ? a : b));
    const select = (months: number) => {
      const start = subtractMonths(windowEnd!, months);
      return { start, indices: rated.filter((i) => compareDates(rounds[i]!.date, start) >= 0) };
    };
    let window = select(RULES.windowMonths);
    windowMonths = RULES.windowMonths;
    if (window.indices.length < RULES.minRoundsBeforeFallback) {
      window = select(RULES.fallbackWindowMonths);
      windowMonths = RULES.fallbackWindowMonths;
    }
    windowStart = window.start;
    inWindow = window.indices;
  }

  // Outlier statistics use all rounds in the window, before any are dropped,
  // so dropping a round never feeds back into its own threshold. They are
  // unweighted: hole weighting only applies to the final average.
  const windowRatings = inWindow.map(ratingOf);
  const averageInWindow = mean(windowRatings);
  const stdDev = populationStdDev(windowRatings);
  const meanMinusPoints = averageInWindow - RULES.outlierPoints;
  const meanMinusStdDevs = averageInWindow - RULES.outlierStdDevs * stdDev;
  const dropThreshold =
    inWindow.length >= RULES.minRoundsForOutlierDrop ? Math.max(meanMinusPoints, meanMinusStdDevs) : null;

  const counted =
    dropThreshold === null ? inWindow : inWindow.filter((i) => ratingOf(i) >= dropThreshold);
  const countedSet = new Set(counted);
  for (const i of inWindow) status[i] = countedSet.has(i) ? 'included' : 'dropped';

  const doubleCount =
    counted.length >= RULES.minRoundsForDoubleWeight
      ? Math.ceil(counted.length * RULES.doubleWeightShare)
      : 0;
  for (const i of selectDoubleWeighted(rounds, counted, doubleCount)) status[i] = 'doubled';

  const weights = rounds.map((round, i) => {
    const holeWeight = (round.holes ?? RULES.standardHoles) / RULES.standardHoles;
    if (status[i] === 'doubled') return 2 * holeWeight;
    if (status[i] === 'included') return holeWeight;
    return 0;
  });

  const exact = nullable(weightedMean(counted.map(ratingOf), counted.map((i) => weights[i]!)));
  const rating = exact === null ? null : Math.round(exact);
  const currentRating = options.currentRating ?? null;

  const stats: RatingStats = {
    totalRounds: rated.length,
    dnfRounds: rounds.length - rated.length,
    careerEvents,
    windowMonths,
    windowStart,
    windowEnd,
    roundsInWindow: inWindow.length,
    roundsOutsideWindow: rated.length - inWindow.length,
    roundsDropped: inWindow.length - counted.length,
    roundsCounted: counted.length,
    roundsDoubled: doubleCount,
    averageAll: nullable(mean(rated.map(ratingOf))),
    averageInWindow: nullable(averageInWindow),
    averageCounted: nullable(mean(counted.map(ratingOf))),
    stdDev: nullable(stdDev),
    meanMinusPoints: nullable(meanMinusPoints),
    meanMinusStdDevs: nullable(meanMinusStdDevs),
    dropThreshold,
  };

  return {
    rating,
    exact,
    change: rating !== null && currentRating !== null ? rating - currentRating : null,
    rounds: rounds.map((round, i) => ({ id: round.id, status: status[i]!, weight: weights[i]! })),
    stats,
  };
}
