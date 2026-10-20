import { predictRating } from './rating';
import type { Prediction, RoundInput, RoundResult, RoundStatus } from './types';

/** What happened to a round between the last official update and the prediction. */
export type ChangeKind =
  /** Not an official round: unofficial or manual. */
  | 'new'
  | 'left-window'
  /** Rare: a later anchor switched to the 24-month window and brought it back. */
  | 'entered-window'
  | 'started-doubling'
  | 'stopped-doubling'
  | 'newly-dropped'
  | 'no-longer-dropped';

export interface ChangeItem {
  id: string;
  kind: ChangeKind;
  rating: number;
  /** Status in the official state, null for a new round. */
  before: RoundStatus | null;
  after: RoundStatus;
  /** Rating points this round moves the unrounded prediction. */
  effect: number;
}

export interface Explanation {
  /** The official state: the official rounds only. */
  before: Prediction;
  /** Largest effect first. */
  items: ChangeItem[];
  /** after.exact - before.exact. The effects add up to this. */
  total: number;
}

/** The kind of an official round whose weight changed. */
function kindOf(before: RoundStatus, after: RoundStatus): ChangeKind {
  if (after === 'outside-window') return 'left-window';
  if (before === 'outside-window') return 'entered-window';
  if (after === 'dropped') return 'newly-dropped';
  if (before === 'dropped') return 'no-longer-dropped';
  return after === 'doubled' ? 'started-doubling' : 'stopped-doubling';
}

/**
 * Explains the change from the last official update to the prediction. The
 * official state is the engine run on the official rounds only, which
 * reproduces the official rating; `after` is the run on all rounds.
 *
 * Each round's effect is (weight after - weight before) * (rating - official
 * average) / total weight after. Since the official weights average to the
 * official average, the effects add up exactly to the change, and effects of
 * one round on another (moving the window, the drop limits or the
 * double-weight boundary) are credited to the rounds whose weight changed.
 *
 * Listed: every new round with a rating, also one that does not count (effect
 * 0), and every official round whose weight changed.
 */
export function explainChange(rounds: readonly RoundInput[], after: Prediction): Explanation | null {
  const before = predictRating(rounds.filter((round) => round.source === 'official'));
  if (before.exact === null || after.exact === null) return null;
  const average = before.exact;

  const beforeById = new Map<string, RoundResult>(before.rounds.map((result) => [result.id, result]));
  const totalWeight = after.rounds.reduce((sum, result) => sum + result.weight, 0);

  const items: ChangeItem[] = [];
  rounds.forEach((round, i) => {
    const result = after.rounds[i]!;
    const previous = beforeById.get(round.id) ?? null;
    if (round.rating === null || result.status === 'dnf') return;
    const weightChange = result.weight - (previous?.weight ?? 0);
    if (previous !== null && weightChange === 0) return;
    items.push({
      id: round.id,
      kind: previous === null ? 'new' : kindOf(previous.status, result.status),
      rating: round.rating,
      before: previous?.status ?? null,
      after: result.status,
      effect: weightChange === 0 ? 0 : (weightChange * (round.rating - average)) / totalWeight,
    });
  });

  // The sort is stable, so equal items keep input order (newest first).
  items.sort(
    (a, b) => Math.abs(b.effect) - Math.abs(a.effect) || Number(b.kind === 'new') - Number(a.kind === 'new'),
  );
  return { before, items, total: after.exact - average };
}
