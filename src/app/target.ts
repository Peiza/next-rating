import {
  compareDates,
  nextRatingUpdate,
  targetAverage,
  type PlainDate,
  type RatingUpdate,
  type TargetResult,
} from '../engine';
import type { MessageKey } from '../i18n';
import { RANGES } from '../parsers/values';
import type { Model } from './model';
import { readWhole } from './views/manual';

/*
 * The target calculator on the Rating tab: what average the next rounds
 * need for the next update to reach a target rating. Pure, so it is tested
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
}

export type TargetField = keyof TargetDraft;

export interface TargetQuery {
  target: number;
  count: number;
}

export type TargetRead = { query: TargetQuery } | { field: TargetField; error: MessageKey };

/** The next multiple of 10 above the prediction, a likely first goal, or empty without one. */
export function emptyTargetDraft(prediction: number | null): TargetDraft {
  return {
    target: prediction === null ? '' : String(Math.floor(prediction / 10) * 10 + 10),
    count: String(DEFAULT_TARGET_ROUNDS),
  };
}

/** Reads the typed target and round count, or the first field that is not valid and why. */
export function readTarget(draft: TargetDraft): TargetRead {
  const target = readWhole(draft.target, TARGET_RANGE);
  if (target === null) return { field: 'target', error: 'target.targetInvalid' };
  const count = readWhole(draft.count, ROUNDS_RANGE);
  if (count === null) return { field: 'count', error: 'target.countInvalid' };
  return { query: { target, count } };
}

/**
 * The update that rounds played today count in. On the Monday and Tuesday of
 * update week, before PDGA publishes, today is after the next update's
 * report deadline, so they count only in the following update.
 */
export function targetUpdate(today: PlainDate, next: RatingUpdate): { update: RatingUpdate; following: boolean } {
  if (compareDates(today, next.deadline) <= 0) return { update: next, following: false };
  return { update: nextRatingUpdate(today, next.update), following: true };
}

export interface TargetAnswer {
  query: TargetQuery;
  /** The update the new rounds count in; `without` and `reached` refer to it too. */
  update: RatingUpdate;
  /** The new rounds miss the next update's deadline, so this is for the one after. */
  following: boolean;
  /** The deadline they miss, when `following`. */
  missed: PlainDate;
  result: TargetResult;
}

/** Runs the engine's search on exactly the rounds the prediction uses, manual rounds included. */
export function calculateTarget(model: Model, query: TargetQuery, today: PlainDate): TargetAnswer {
  const { update, following } = targetUpdate(today, model.nextUpdate);
  const result = targetAverage(model.rounds, query.target, {
    count: query.count,
    date: today,
    deadline: update.deadline,
    leaveOut: model.leaveOut,
    currentRating: model.player?.currentRating ?? null,
  });
  return { query, update, following, missed: model.nextUpdate.deadline, result };
}
