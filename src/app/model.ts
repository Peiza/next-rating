import { predictRating, type PlainDate, type Prediction, type RoundResult } from '../engine';
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

export interface Model {
  /** The player header from pdga.com, or null when the import has none. */
  player: PlayerInfo | null;
  /** The player the import is stored under; event rows are picked by this number. */
  pdgaNumber: number;
  /** Rounds with their status, newest first. */
  rows: ListedResult[];
  prediction: Prediction;
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
  const prediction = predictRating(rounds, { currentRating: player?.currentRating ?? null });
  const rows = rounds
    .map((round, i) => ({ round, result: prediction.rounds[i]! }))
    .sort((a, b) => (a.round.date < b.round.date ? 1 : a.round.date > b.round.date ? -1 : 0));

  return { player, pdgaNumber, rows, prediction, importedAt: stored.at, eventsWithoutRounds };
}
