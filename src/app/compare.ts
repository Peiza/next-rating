import type { ListedRound } from '../parsers';
import type { Model } from './model';

/*
 * Compares players from their stored data: each one's figures in their own
 * rating window, and head-to-head meetings between two of them. Pure, so it
 * is tested with synthetic data.
 */

/** One player's line in the comparison. */
export interface CompareLine {
  pdgaNumber: number;
  /** The predicted rating; null when no rated round counts. */
  rating: number | null;
  /** Events in the rating window; null without a window. */
  events: number | null;
  /** Wins dated in the rating window; null when not known. */
  wins: number | null;
  /** Unweighted average of the rounds in the window. */
  average: number | null;
}

export function compareLine(model: Model): CompareLine {
  const { prediction, wins } = model;
  return {
    pdgaNumber: model.pdgaNumber,
    rating: prediction.rating,
    events: wins.periodEvents,
    wins: wins.periodWins,
    average: prediction.stats.averageInWindow,
  };
}

/** Head-to-head between two players, from the first one's side. */
export interface HeadToHead {
  /** Events both played, with at least one round in common. */
  events: number;
  eventsWon: number;
  eventsLost: number;
  eventsTied: number;
  /** Rounds both played: the same event and the same round. */
  rounds: number;
  roundsWon: number;
  roundsLost: number;
  roundsTied: number;
}

/**
 * A rated round that a meeting can count: imported, not DNF. Manual rounds
 * are the user's own guesses, so they are never a meeting.
 */
function played(round: ListedRound): boolean {
  return round.source !== 'manual' && !round.dnf && round.rating !== null;
}

/** Rounds by event and round, so the same round in two divisions meets. */
function byRound(rounds: readonly ListedRound[]): Map<string, ListedRound> {
  const found = new Map<string, ListedRound>();
  for (const round of rounds) {
    if (played(round)) found.set(`${round.eventKey}\u0000${round.roundLabel}`, round);
  }
  return found;
}

const sign = (a: number, b: number) => (a > b ? 1 : a < b ? -1 : 0);

/**
 * The rounds two players played in the same event and round, in any
 * division, from all imported rounds. A round is won by the higher round
 * rating, which compares scores fairly also when the divisions played other
 * layouts; an event by the higher average over the rounds both played.
 */
export function headToHead(a: readonly ListedRound[], b: readonly ListedRound[]): HeadToHead {
  const theirs = byRound(b);
  const events = new Map<string, [mine: number, theirs: number, count: number]>();
  const result: HeadToHead = {
    events: 0,
    eventsWon: 0,
    eventsLost: 0,
    eventsTied: 0,
    rounds: 0,
    roundsWon: 0,
    roundsLost: 0,
    roundsTied: 0,
  };
  for (const [key, round] of byRound(a)) {
    const other = theirs.get(key);
    if (!other) continue;
    const [mine, their] = [round.rating!, other.rating!];
    result.rounds += 1;
    const won = sign(mine, their);
    if (won > 0) result.roundsWon += 1;
    else if (won < 0) result.roundsLost += 1;
    else result.roundsTied += 1;
    const sums = events.get(round.eventKey) ?? [0, 0, 0];
    events.set(round.eventKey, [sums[0] + mine, sums[1] + their, sums[2] + 1]);
  }
  for (const [mine, their] of events.values()) {
    result.events += 1;
    // The same number of rounds on both sides, so the sums compare as averages.
    const won = sign(mine, their);
    if (won > 0) result.eventsWon += 1;
    else if (won < 0) result.eventsLost += 1;
    else result.eventsTied += 1;
  }
  return result;
}
