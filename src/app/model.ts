import {
  compareDates,
  explainChange,
  nextRatingUpdate,
  predictRating,
  type ChangeItem,
  type PlainDate,
  type Prediction,
  type RatingUpdate,
  type RoundResult,
} from '../engine';
import {
  detailsToRounds,
  eventToRounds,
  mergeRounds,
  normalizeEvent,
  normalizePlayer,
  normalizeRatingsDetails,
  type ListedRound,
  type PlayerInfo,
} from '../parsers';
import { today } from './format';
import type { StoredImport } from './import';

/*
 * Turns one player's stored import (and, from step 3 on, manual rounds) into
 * what the Rating tab shows. Pure, so it is tested with synthetic data.
 */

export interface ListedResult {
  round: ListedRound;
  result: RoundResult;
}

/** One line of "Why it changed": a round and what happened to it. */
export interface ListedChange {
  round: ListedRound;
  item: ChangeItem;
}

export interface Model {
  /** The player header from pdga.com, or null when the import has none. */
  player: PlayerInfo | null;
  /** The player the import is stored under; event rows are picked by this number. */
  pdgaNumber: number;
  /** Rounds with their status, newest first. */
  rows: ListedResult[];
  prediction: Prediction;
  /** The update the prediction is for; new rounds after its deadline count in the following one. */
  nextUpdate: RatingUpdate;
  /** Why the prediction differs from the official state, largest effect first. Null without official rounds. */
  changes: ListedChange[] | null;
  /**
   * When PDGA's own round set does not give the official rating: the change
   * shown minus the listed effects, so the lines add up to the change.
   */
  difference: number | null;
  /**
   * The ratings details were imported before the official rating date, so
   * they may be older than the last update.
   */
  staleDetails: boolean;
  importedAt: string;
  /** Imported events with no rated rounds for the player. */
  eventsWithoutRounds: { name: string; date: PlainDate | null }[];
}

export function buildModel(
  stored: StoredImport,
  pdgaNumber: number,
  now: Date,
  manualRounds: readonly ListedRound[] = [],
): Model {
  const player = stored.player ? normalizePlayer(stored.player) : null;
  const official = detailsToRounds(normalizeRatingsDetails(stored.details ?? []).rounds);

  const eventsWithoutRounds: Model['eventsWithoutRounds'] = [];
  const eventRounds = stored.events.map((raw) => {
    const event = normalizeEvent(raw);
    const rounds = eventToRounds(event, pdgaNumber);
    if (rounds.length === 0) eventsWithoutRounds.push({ name: event.name, date: event.date });
    return rounds;
  });

  // Newest first for the engine too: on the same date, earlier counts as more recent.
  const rounds = mergeRounds(official, ...eventRounds.reverse(), [...manualRounds].reverse());
  const currentRating = player?.currentRating ?? null;
  const nextUpdate = nextRatingUpdate(today(now), player?.ratingDate ?? null);
  const prediction = predictRating(rounds, { currentRating, deadline: nextUpdate.deadline });
  const rows = rounds
    .map((round, i) => ({ round, result: prediction.rounds[i]! }))
    .sort((a, b) => (a.round.date < b.round.date ? 1 : a.round.date > b.round.date ? -1 : 0));

  const explanation = explainChange(rounds, prediction, currentRating);
  const byId = new Map(rounds.map((round) => [round.id, round]));
  const changes = explanation?.items.map((item) => ({ round: byId.get(item.id)!, item })) ?? null;
  const detailsDate = today(new Date(stored.detailsAt ?? stored.at));
  const staleDetails = player?.ratingDate != null && compareDates(detailsDate, player.ratingDate) < 0;

  return {
    player,
    pdgaNumber,
    rows,
    prediction,
    nextUpdate,
    changes,
    difference: explanation?.difference ?? null,
    staleDetails,
    importedAt: stored.at,
    eventsWithoutRounds,
  };
}
