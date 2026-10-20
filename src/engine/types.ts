import type { PlainDate } from './dates';

/** Where a round comes from: the ratings details page, an event page, or typed in by the user. */
export type RoundSource = 'official' | 'unofficial' | 'manual';

export interface RoundInput {
  /** Unique within one calculation; results refer back to rounds by id. */
  id: string;
  /** Round rating. May be null only for a DNF round. */
  rating: number | null;
  /** Date of the round. For a multi-day event, the last day of the event. */
  date: PlainDate;
  /** Groups the rounds of one event, for the double-weight boundary rule. */
  eventKey: string;
  /** Holes played. Defaults to 18 when unknown. Weighs holes / 18, at most 1. */
  holes?: number;
  /** A DNF round never counts. */
  dnf?: boolean;
  source: RoundSource;
  /**
   * PDGA's flags from the ratings details page, on official rounds.
   * predictRating never trusts the Included flag and recomputes; it reads
   * the Evaluated flags only to find the rounds PDGA left out of the window
   * it evaluated (excludedByPdga). officialState uses both.
   */
  pdga?: { evaluated: boolean; included: boolean };
}

export type RoundStatus =
  /** Counts once (times its hole weight). */
  | 'included'
  /** Among the most recent 25% of counted rounds, so it counts twice. */
  | 'doubled'
  /** In the window, but excluded as a low outlier. */
  | 'dropped'
  /** Older than the 12- or 24-month window. */
  | 'outside-window'
  /**
   * An official round PDGA did not evaluate although it is dated inside the
   * window PDGA evaluated, as for X-tier events with non-standard rules
   * (Competition Manual 5.10). It never counts.
   */
  | 'excluded'
  /**
   * A new round dated after the report deadline of the next update: that
   * update leaves it out, and it counts in the following one.
   */
  | 'after-deadline'
  | 'dnf';

export interface RoundResult {
  id: string;
  status: RoundStatus;
  /** Weight in the final average: holes / 18 (at most 1), doubled when double-weighted, 0 when not counted. */
  weight: number;
}

/** Figures behind the prediction, matching the stats panel of the legacy sheet. */
export interface RatingStats {
  /** Rated rounds, DNF rounds and rounds after the deadline not included. */
  totalRounds: number;
  dnfRounds: number;
  /** Distinct events among official and unofficial rounds (manual rounds not included). */
  careerEvents: number;
  windowMonths: 12 | 24 | null;
  /** First date inside the window (inclusive). */
  windowStart: PlainDate | null;
  /** Date of the most recent rated round. */
  windowEnd: PlainDate | null;
  roundsInWindow: number;
  roundsOutsideWindow: number;
  /** Rounds in the window dropped as low outliers. */
  roundsDropped: number;
  roundsCounted: number;
  roundsDoubled: number;
  /** Unweighted average of all rated rounds. */
  averageAll: number | null;
  /** Unweighted average of the rounds in the window, before dropping outliers. */
  averageInWindow: number | null;
  /** Unweighted average of the counted rounds, after dropping outliers. */
  averageCounted: number | null;
  /** Population standard deviation of the rounds in the window. */
  stdDev: number | null;
  /** The lowest rating in the window. */
  lowestInWindow: number | null;
  /**
   * The lowest round's drop limit, from the other rounds in the window: their
   * mean minus 100 or minus 2.5 standard deviations, whichever is higher.
   * Each round has its own limit. Null when too few rounds for the outlier rule.
   */
  lowestLimit: number | null;
}

export interface PredictOptions {
  /** The current official rating, used for the change. */
  currentRating?: number | null;
  /**
   * The event report deadline of the next update. Unofficial and manual
   * rounds dated after it are 'after-deadline' and left out of everything,
   * including the window and the stats. Official rounds always count.
   */
  deadline?: PlainDate;
}

export interface Prediction {
  /** Predicted rating, rounded to a whole number. Null when no round counts. */
  rating: number | null;
  /** Unrounded weighted average. */
  exact: number | null;
  /** rating - currentRating, when both are known. */
  change: number | null;
  /** One result per input round, in input order. */
  rounds: RoundResult[];
  stats: RatingStats;
}
