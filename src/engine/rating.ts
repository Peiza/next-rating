import { compareDates, isPlainDate, subtractMonths, type PlainDate } from './dates';
import { mean, populationStdDev, weightedMean } from './stats';
import type { PredictOptions, Prediction, RatingStats, RoundInput, RoundResult, RoundStatus } from './types';

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
  /** Hole weighting divides by this, and caps longer rounds at it: they count as one round. */
  standardHoles: 18,
} as const;

/**
 * The outlier limit for the round at `skip`, from the other ratings in the
 * window: their plain mean minus 100 or minus 2.5 standard deviations,
 * whichever is higher. Leaving the round itself out reproduces PDGA's
 * Included flags.
 *
 * It adds up in the same order as mean() and populationStdDev(), so the
 * result is identical, but without building a list of the others for every
 * round: the target calculator runs the engine hundreds of times.
 */
function dropLimit(ratings: readonly number[], skip: number): number {
  const count = ratings.length - 1;
  let sum = 0;
  for (let k = 0; k < ratings.length; k += 1) if (k !== skip) sum += ratings[k]!;
  const average = count > 0 ? sum / count : NaN;
  let squares = 0;
  for (let k = 0; k < ratings.length; k += 1) if (k !== skip) squares += (ratings[k]! - average) ** 2;
  const stdDev = count > 0 ? Math.sqrt(squares / count) : NaN;
  return Math.max(average - RULES.outlierPoints, average - RULES.outlierStdDevs * stdDev);
}

/** holes / 18, capped at 1: a round longer than 18 holes counts as one round. */
function holeWeight(round: RoundInput): number {
  return Math.min(round.holes ?? RULES.standardHoles, RULES.standardHoles) / RULES.standardHoles;
}

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
export function selectDoubleWeighted(
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
 * The official rounds PDGA left out although they are dated inside the
 * window it evaluated: Evaluated No inside that window, as for X-tier events
 * with non-standard rules such as mulligans (Competition Manual 5.10). Other
 * X-tier events are rated and count normally, so the tier alone says nothing.
 *
 * PDGA's window is read from its own flags: 12 months back from the newest
 * evaluated round, or 24 when the evaluated rounds show the fallback (one is
 * older than 12 months, or fewer than 8 are inside them). Since the set comes
 * from PDGA's window, not the prediction's, those rounds stay out when new
 * rounds move the window. Returns indices into `rounds`.
 */
export function excludedByPdga(rounds: readonly RoundInput[]): Set<number> {
  const official = (round: RoundInput) => round.source === 'official' && !round.dnf && round.pdga !== undefined;
  const evaluated = rounds.filter((round) => official(round) && round.pdga!.evaluated).map((round) => round.date);
  if (evaluated.length === 0) return new Set();
  const anchor = evaluated.reduce((a, b) => (compareDates(a, b) >= 0 ? a : b));
  const start12 = subtractMonths(anchor, RULES.windowMonths);
  const in12 = evaluated.filter((date) => compareDates(date, start12) >= 0).length;
  const start =
    in12 < evaluated.length || in12 < RULES.minRoundsBeforeFallback
      ? subtractMonths(anchor, RULES.fallbackWindowMonths)
      : start12;
  return new Set(
    rounds.flatMap((round, i) =>
      official(round) && !round.pdga!.evaluated && compareDates(round.date, start) >= 0 ? [i] : [],
    ),
  );
}

/**
 * Double-weights the most recent counted rounds and weighs every round.
 * `status` must mark the counted rounds 'included'; the doubled ones are
 * changed to 'doubled' in place.
 */
function weigh(
  rounds: readonly RoundInput[],
  status: RoundStatus[],
  counted: readonly number[],
): { doubleCount: number; weights: number[]; exact: number | null } {
  const doubleCount =
    counted.length >= RULES.minRoundsForDoubleWeight
      ? Math.ceil(counted.length * RULES.doubleWeightShare)
      : 0;
  for (const i of selectDoubleWeighted(rounds, counted, doubleCount)) status[i] = 'doubled';

  const weights = rounds.map((round, i) => {
    if (status[i] === 'doubled') return 2 * holeWeight(round);
    if (status[i] === 'included') return holeWeight(round);
    return 0;
  });
  const exact = nullable(weightedMean(counted.map((i) => rounds[i]!.rating!), counted.map((i) => weights[i]!)));
  return { doubleCount, weights, exact };
}

/**
 * Predicts the next rating from all known rounds: official, unofficial and
 * manual. PDGA's Included flags are never used: inclusion is recomputed from
 * scratch, since adding rounds can bring back previously dropped ones.
 * Official rounds PDGA left out of the window it evaluated never count
 * (excludedByPdga), and neither do rounds of events the user left out. With
 * a deadline, new rounds dated after it wait for the following update. All
 * of these are left out of everything, like DNF rounds.
 *
 * A rating only updates when new rated rounds are added (PDGA ratings
 * guide). So with a current rating and no round in this update that is not
 * official, the rating stays at the current rating; `exact` is still the
 * calculated average.
 */
export function predictRating(
  rounds: readonly RoundInput[],
  options: PredictOptions = {},
): Prediction {
  validate(rounds);

  const { deadline, leaveOut } = options;
  const later = (round: RoundInput) =>
    !round.dnf && round.source !== 'official' && deadline !== undefined && compareDates(round.date, deadline) > 0;
  const left = (round: RoundInput) => round.source !== 'official' && leaveOut?.has(round.eventKey) === true;
  const excluded = excludedByPdga(rounds);
  const status: RoundStatus[] = rounds.map((round, i) => {
    if (round.dnf) return 'dnf';
    if (excluded.has(i)) return 'excluded';
    if (left(round)) return 'left-out';
    return later(round) ? 'after-deadline' : 'outside-window';
  });
  // Every round that can count starts outside the window; the others are left out of everything.
  const rated = rounds.flatMap((round, i) => (status[i] === 'outside-window' ? [i] : []));
  const ratingOf = (i: number) => rounds[i]!.rating!;
  const careerEvents = new Set(
    rounds.filter((round) => round.source !== 'manual' && !later(round) && !left(round)).map((round) => round.eventKey),
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

  // Each round is judged against the other rounds in the window (leave one
  // out), all of them before any are dropped, so the rule is not iterated.
  // The statistics are unweighted: hole and double weighting only apply to
  // the final average. Two low rounds are each judged with the other one in.
  const windowRatings = inWindow.map(ratingOf);
  const averageInWindow = mean(windowRatings);
  const stdDev = populationStdDev(windowRatings);
  const dropRule = inWindow.length >= RULES.minRoundsForOutlierDrop;
  /** The limit for the k-th round in the window. */
  const limitAt = (k: number) => dropLimit(windowRatings, k);

  const counted = dropRule ? inWindow.filter((i, k) => ratingOf(i) >= limitAt(k)) : inWindow;
  const lowest = inWindow.reduce<number | null>(
    (low, i, k) => (low === null || ratingOf(i) < windowRatings[low]! ? k : low),
    null,
  );
  const countedSet = new Set(counted);
  for (const i of inWindow) status[i] = countedSet.has(i) ? 'included' : 'dropped';

  const { doubleCount, weights, exact } = weigh(rounds, status, counted);
  const currentRating = options.currentRating ?? null;
  const unchanged = currentRating !== null && !rated.some((i) => rounds[i]!.source !== 'official');
  const rating = unchanged ? currentRating : exact === null ? null : Math.round(exact);

  const stats: RatingStats = {
    totalRounds: rated.length,
    dnfRounds: rounds.filter((round) => round.dnf).length,
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
    lowestInWindow: lowest === null ? null : windowRatings[lowest]!,
    lowestLimit: dropRule && lowest !== null ? limitAt(lowest) : null,
  };

  return {
    rating,
    exact,
    change: rating !== null && currentRating !== null ? rating - currentRating : null,
    unchanged,
    rounds: rounds.map((round, i) => ({ id: round.id, status: status[i]!, weight: weights[i]! })),
    stats,
  };
}

/** The last official update as PDGA calculated it. */
export interface OfficialState {
  rating: number | null;
  exact: number | null;
  /** One result per official round, in input order. */
  rounds: RoundResult[];
  /** False when PDGA's flags were missing and the state was recomputed instead. */
  fromFlags: boolean;
}

/**
 * The last official update, from the official rounds only. PDGA's Evaluated
 * and Included flags give the round set, since that is exactly what PDGA
 * counted; only the double-weight rule and hole weights are applied on top.
 * Without flags on every official round, or with none included, the state is
 * recomputed with predictRating instead. Only the change explanation uses
 * the flags: the prediction always recomputes.
 */
export function officialState(rounds: readonly RoundInput[]): OfficialState {
  const official = rounds.filter((round) => round.source === 'official');
  const flags = official.map((round) => round.pdga);
  if (!flags.every((flag) => flag !== undefined) || !official.some((round, i) => !round.dnf && flags[i]!.included)) {
    const { rating, exact, rounds: results } = predictRating(official);
    return { rating, exact, rounds: results, fromFlags: false };
  }
  validate(official);

  const excluded = excludedByPdga(official);
  const status: RoundStatus[] = official.map((round, i) => {
    if (round.dnf) return 'dnf';
    if (flags[i]!.included) return 'included';
    if (flags[i]!.evaluated) return 'dropped';
    return excluded.has(i) ? 'excluded' : 'outside-window';
  });
  const counted = status.flatMap((value, i) => (value === 'included' ? [i] : []));
  const { weights, exact } = weigh(official, status, counted);
  return {
    rating: exact === null ? null : Math.round(exact),
    exact,
    rounds: official.map((round, i) => ({ id: round.id, status: status[i]!, weight: weights[i]! })),
    fromFlags: true,
  };
}
