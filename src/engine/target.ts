import { compareDates, type PlainDate } from './dates';
import { predictRating } from './rating';
import type { PredictOptions, RoundInput } from './types';

/**
 * The highest round rating the target calculator considers plausible: above
 * the best rounds actually played. A target these rounds cannot reach is out
 * of reach.
 */
export const MAX_TARGET_ROUND = 1150;

export interface TargetOptions {
  /** Number of hypothetical 18-hole rounds. */
  count: number;
  /**
   * Their date. They are newer than every stored round, so this date ends
   * the window.
   */
  date: PlainDate;
  /** The report deadline of the update they count in, as in predictRating. */
  deadline?: PlainDate;
  /** Events the user left out, as in predictRating. */
  leaveOut?: ReadonlySet<string>;
  /** The current official rating, which `without` keeps when no new rated round counts. */
  currentRating?: number | null;
}

export interface TargetResult {
  /** The prediction for that update without new rounds. */
  without: number | null;
  /** `without` already reaches the target. */
  reached: boolean;
  /**
   * The lowest whole average from which every whole rating up to
   * MAX_TARGET_ROUND reaches the target, so playing better never shows as
   * worse. 0 when any rounds do. Null when even MAX_TARGET_ROUND falls short.
   */
  average: number | null;
  /** The prediction with `count` rounds at `average`, or at MAX_TARGET_ROUND when out of reach. */
  rating: number | null;
  /**
   * Ids of the rounds that count in `without` but are outside the window
   * once the new rounds are added, in input order.
   */
  leaving: string[];
}

/**
 * The rounds to come, each an event of its own. They go first, since on the
 * same date earlier in the input counts as more recent.
 */
function upcoming(count: number, date: PlainDate, rating: number): RoundInput[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `target:${i + 1}`,
    rating,
    date,
    eventKey: `target:${i + 1}`,
    holes: 18,
    source: 'manual',
  }));
}

/**
 * The average round rating needed in `count` new rounds for the next update
 * to reach `target`. The real engine runs for each candidate, so the window,
 * outlier drops and double weighting apply exactly as in the prediction.
 *
 * The prediction usually rises with the rating of the new rounds, but not
 * always: a very low round can be dropped as an outlier while it still moves
 * the window. Scanning down from MAX_TARGET_ROUND and stopping at the first
 * rating that falls short gives an answer where every higher rating works too.
 */
export function targetAverage(rounds: readonly RoundInput[], target: number, options: TargetOptions): TargetResult {
  const { count, date, deadline, leaveOut, currentRating } = options;
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`Invalid round count: ${count}`);
  if (!Number.isInteger(target) || target < 1) throw new RangeError(`Invalid target: ${target}`);
  if (deadline !== undefined && compareDates(date, deadline) > 0) {
    throw new RangeError(`Rounds on ${date} count only after the deadline ${deadline}`);
  }

  const predict: PredictOptions = {
    ...(deadline !== undefined && { deadline }),
    ...(leaveOut !== undefined && { leaveOut }),
  };
  const reaches = (rating: number | null) => rating !== null && rating >= target;
  const before = predictRating(rounds, { ...predict, currentRating });
  const without = before.rating;
  const reached = reaches(without);

  // The window follows from the dates alone, and the new rounds' date is
  // fixed, so it is the same for every candidate rating. Rounds outside it,
  // DNF rounds, rounds PDGA or the user left out and rounds after the
  // deadline never change the result, so the scan leaves them out and each
  // engine run is cheaper. PDGA's flags go too: the rounds they leave out
  // are already gone, and the flags of a subset would read PDGA's window
  // differently.
  const probe = predictRating([...upcoming(count, date, MAX_TARGET_ROUND), ...rounds], predict);
  const ignored = new Set(['outside-window', 'dnf', 'excluded', 'left-out', 'after-deadline']);
  const relevant = rounds
    .filter((_, i) => !ignored.has(probe.rounds[count + i]!.status))
    .map(({ pdga: _flags, ...round }) => round);
  // The same window shows which counted rounds the new rounds push out.
  const counted = new Set(['included', 'doubled']);
  const leaving = rounds
    .filter((_, i) => counted.has(before.rounds[i]!.status) && probe.rounds[count + i]!.status === 'outside-window')
    .map((round) => round.id);
  const ratingAt = (average: number) => predictRating([...upcoming(count, date, average), ...relevant], predict).rating;

  let rating = probe.rating;
  if (!reaches(rating)) return { without, reached, average: null, rating, leaving };

  let average = MAX_TARGET_ROUND;
  for (let next = MAX_TARGET_ROUND - 1; next >= 0; next -= 1) {
    const at = ratingAt(next);
    if (!reaches(at)) break;
    average = next;
    rating = at;
  }
  return { without, reached, average, rating, leaving };
}
