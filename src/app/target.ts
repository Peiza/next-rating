import {
  compareDates,
  isPlainDate,
  nextRatingUpdate,
  targetAverage,
  type PlainDate,
  type RatingUpdate,
  type TargetResult,
} from '../engine';
import type { MessageKey } from '../i18n';
import type { ListedRound } from '../parsers';
import { RANGES } from '../parsers/values';
import type { Model } from './model';
import { latestManualDate, readWhole } from './views/manual';

/*
 * The target calculator on the Rating tab: what average the next rounds
 * need for an update to reach a target rating. Pure, so it is tested
 * with synthetic data; the engine does the search.
 */

export const DEFAULT_TARGET_ROUNDS = 3;
export const MAX_TARGET_ROUNDS = 20;
const TARGET_RANGE = [1, RANGES.rating[1]] as const;
const ROUNDS_RANGE = [1, MAX_TARGET_ROUNDS] as const;

/** What has been typed, kept by main.ts so a re-render does not lose it. */
export interface TargetDraft {
  target: string;
  count: string;
  /** The date of the last new round. */
  date: string;
}

export type TargetField = keyof TargetDraft;

export interface TargetQuery {
  target: number;
  count: number;
  date: PlainDate;
}

/** The dates the last new round can have, both inclusive. */
export interface TargetDates {
  min: PlainDate;
  max: PlainDate;
}

export type TargetRead = { query: TargetQuery } | { field: TargetField; error: MessageKey };

/**
 * The earliest date for the new rounds: today, or the newest stored round
 * when one is dated later, so the new rounds are always the newest. The
 * latest is a year ahead, as for a manual round.
 */
export function targetDates(model: Model, today: PlainDate): TargetDates {
  const min = model.rounds.map((round) => round.date).reduce((a, b) => (compareDates(a, b) >= 0 ? a : b), today);
  return { min, max: latestManualDate(today) };
}

/** The next multiple of 10 above the prediction, a likely first goal, or empty without one; the earliest date. */
export function emptyTargetDraft(prediction: number | null, date: PlainDate): TargetDraft {
  return {
    target: prediction === null ? '' : String(Math.floor(prediction / 10) * 10 + 10),
    count: String(DEFAULT_TARGET_ROUNDS),
    date,
  };
}

/** Reads the typed target, round count and date, or the first field that is not valid and why. */
export function readTarget(draft: TargetDraft, dates: TargetDates): TargetRead {
  const target = readWhole(draft.target, TARGET_RANGE);
  if (target === null) return { field: 'target', error: 'target.targetInvalid' };
  const count = readWhole(draft.count, ROUNDS_RANGE);
  if (count === null) return { field: 'count', error: 'target.countInvalid' };
  const date = draft.date.trim();
  if (!isPlainDate(date)) return { field: 'date', error: 'target.dateMissing' };
  if (compareDates(date, dates.min) < 0) return { field: 'date', error: 'target.dateTooEarly' };
  if (compareDates(date, dates.max) > 0) return { field: 'date', error: 'target.dateTooLate' };
  return { query: { target, count, date } };
}

/**
 * The update that rounds dated `date` count in: the first one whose report
 * deadline is on or after it. A date on the Monday or Tuesday of an update
 * week misses that update's deadline (`missed`) and counts in the one after.
 * Up to the next update's deadline it is always the next update, which on
 * update day, once PDGA has published, is already the following month's.
 */
export function targetUpdate(date: PlainDate, next: RatingUpdate): { update: RatingUpdate; missed: PlainDate | null } {
  if (compareDates(date, next.deadline) <= 0) return { update: next, missed: null };
  const first = nextRatingUpdate(date);
  if (compareDates(date, first.deadline) <= 0) return { update: first, missed: null };
  return { update: nextRatingUpdate(date, first.update), missed: first.deadline };
}

export interface TargetAnswer {
  query: TargetQuery;
  /** The update the new rounds count in; `without` and `reached` refer to it too. */
  update: RatingUpdate;
  /** The deadline the new rounds just miss, on the Monday or Tuesday of an update week. */
  missed: PlainDate | null;
  result: TargetResult;
  /** The rounds that leave the window because of the date, oldest first. */
  leaving: ListedRound[];
}

/** Runs the engine's search on exactly the rounds the prediction uses, manual rounds included. */
export function calculateTarget(model: Model, query: TargetQuery): TargetAnswer {
  const { update, missed } = targetUpdate(query.date, model.nextUpdate);
  const result = targetAverage(model.rounds, query.target, {
    count: query.count,
    date: query.date,
    deadline: update.deadline,
    leaveOut: model.leaveOut,
    currentRating: model.player?.currentRating ?? null,
  });
  const ids = new Set(result.leaving);
  const leaving = model.rounds
    .filter((round) => ids.has(round.id))
    .sort((a, b) => compareDates(a.date, b.date));
  return { query, update, missed, result, leaving };
}
