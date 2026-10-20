import { explainChange, predictRating, type ChangeItem, type PlainDate, type Prediction, type RoundResult } from '../engine';
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
  /** Why the prediction differs from the official state, largest effect first. Null without official rounds. */
  changes: ListedChange[] | null;
  /**
   * The rating the official rounds give, when it differs from the official
   * rating on the profile, as with ratings details older than the last update.
   */
  officialMismatch: number | null;
  importedAt: string;
  /** Imported events with no rated rounds for the player. */
  eventsWithoutRounds: { name: string; date: PlainDate | null }[];
}

export function buildModel(stored: StoredImport, pdgaNumber: number, manualRounds: readonly ListedRound[] = []): Model {
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
  const prediction = predictRating(rounds, { currentRating });
  const rows = rounds
    .map((round, i) => ({ round, result: prediction.rounds[i]! }))
    .sort((a, b) => (a.round.date < b.round.date ? 1 : a.round.date > b.round.date ? -1 : 0));

  const explanation = explainChange(rounds, prediction);
  const byId = new Map(rounds.map((round) => [round.id, round]));
  const changes = explanation?.items.map((item) => ({ round: byId.get(item.id)!, item })) ?? null;
  const computed = explanation?.before.rating ?? null;
  const officialMismatch = computed !== null && currentRating !== null && computed !== currentRating ? computed : null;

  return {
    player,
    pdgaNumber,
    rows,
    prediction,
    changes,
    officialMismatch,
    importedAt: stored.at,
    eventsWithoutRounds,
  };
}
