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
 * Turns the stored import (and, from step 3 on, manual rounds) into what the
 * Rating tab shows. Pure, so it is tested with synthetic data.
 */

export interface ListedResult {
  round: ListedRound;
  result: RoundResult;
}

export interface Model {
  player: PlayerInfo | null;
  /** Whose rows are taken from event pages: the imported player, or the default player. */
  pdgaNumber: number | null;
  /** Rounds with their status, newest first. */
  rows: ListedResult[];
  prediction: Prediction;
  importedAt: string;
  /** True when there are event pages but no PDGA number to pick rows by. */
  needsNumber: boolean;
  /** Imported events with no rated rounds for the player. */
  eventsWithoutRounds: { name: string; date: PlainDate | null }[];
}

export function buildModel(
  stored: StoredImport,
  defaultPdgaNumber: number | null,
  manualRounds: readonly ListedRound[] = [],
): Model {
  const player = stored.player ? normalizePlayer(stored.player) : null;
  const pdgaNumber = player?.pdgaNumber ?? defaultPdgaNumber;
  const official = detailsToRounds(normalizeRatingsDetails(stored.details ?? []).rounds);

  const eventsWithoutRounds: Model['eventsWithoutRounds'] = [];
  const eventRounds = stored.events.map((raw) => {
    if (pdgaNumber === null) return [];
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

  return {
    player,
    pdgaNumber,
    rows,
    prediction,
    importedAt: stored.at,
    needsNumber: pdgaNumber === null && stored.events.length > 0,
    eventsWithoutRounds,
  };
}
