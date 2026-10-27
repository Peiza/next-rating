import type { PlainDate } from '../engine/dates';
import type { RoundInput } from '../engine/types';
import type { DetailsRound, EventResults } from './types';

/** A round with what the round list shows. The engine ignores the extra fields. */
export type ListedRound = RoundInput & {
  /** The pdga.com event id, which the round list links to; null when unknown. */
  eventId: number | null;
  eventName: string;
  /** Round label as pdga.com shows it, such as "2" or "Finals". */
  roundLabel: string;
  /** The player's score, division and the course and layout, for head-to-head; missing when unknown. */
  score?: number;
  division?: string;
  layout?: string;
  /**
   * The event's tier as pdga.com shows it, such as "A" or "XA". Official
   * rounds take it from the ratings details; the app adds it to event rounds
   * from the profile page. Missing when unknown.
   */
  tier?: string;
  /** A manual round added as an example under the target answer. */
  example?: boolean;
};

/** Groups rounds by pdga.com event id, or by name and date when the id is unknown. */
export function eventKeyOf(eventId: number | null, name: string, date: PlainDate | null): string {
  return eventId !== null ? `e:${eventId}` : `n:${name}|${date ?? ''}`;
}

/** Makes ids unique by appending the position when one repeats. */
function uniqueIds<T extends RoundInput>(rounds: T[]): T[] {
  const seen = new Set<string>();
  return rounds.map((round, i) => {
    const id = seen.has(round.id) ? `${round.id}:${i}` : round.id;
    seen.add(id);
    return { ...round, id };
  });
}

/** Rounds from the ratings details page, in page order (newest first). */
export function detailsToRounds(rounds: readonly DetailsRound[]): ListedRound[] {
  return uniqueIds(
    rounds.map((round) => {
      const eventKey = eventKeyOf(round.eventId, round.eventName, round.date);
      return {
        id: `o:${eventKey}:${round.division}:${round.round ?? round.roundLabel}`,
        rating: round.rating,
        date: round.date,
        eventKey,
        ...(round.holes !== null && { holes: round.holes }),
        source: 'official',
        pdga: { evaluated: round.evaluated, included: round.included },
        eventId: round.eventId,
        eventName: round.eventName,
        roundLabel: round.roundLabel,
        ...(round.tier && { tier: round.tier }),
        ...(round.score !== null && { score: round.score }),
        ...(round.division && { division: round.division }),
        ...(round.layout && { layout: round.layout }),
      };
    }),
  );
}

/**
 * One player's rounds from an event results page. Rounds without a rating
 * yet are left out; DNF rounds are kept so they show in the round list.
 */
export function eventToRounds(results: EventResults, pdgaNumber: number): ListedRound[] {
  const { date } = results;
  if (date === null) return [];
  const eventKey = eventKeyOf(results.eventId, results.name, date);
  const rounds: ListedRound[] = [];
  for (const division of results.divisions) {
    for (const row of division.rows) {
      if (row.pdgaNumber !== pdgaNumber) continue;
      row.rounds.forEach((round, i) => {
        if (!round.dnf && round.rating === null) return;
        const holes = division.holes[i] ?? null;
        const layout = division.layouts?.[i];
        rounds.push({
          id: `u:${eventKey}:${division.division}:${i + 1}`,
          rating: round.rating,
          date,
          eventKey,
          ...(holes !== null && { holes }),
          ...(round.dnf && { dnf: true }),
          source: 'unofficial',
          eventId: results.eventId,
          eventName: results.name,
          roundLabel: String(i + 1),
          ...(round.score !== null && { score: round.score }),
          ...(division.division && { division: division.division }),
          ...(layout && { layout }),
        });
      });
    }
  }
  return uniqueIds(rounds);
}

/**
 * Adds rounds from event pages to the official rounds, leaving out events
 * that are already in the ratings details and rounds seen before.
 */
export function mergeRounds<T extends RoundInput>(official: readonly T[], ...others: (readonly T[])[]): T[] {
  const officialEvents = new Set(official.map((round) => round.eventKey));
  const ids = new Set(official.map((round) => round.id));
  const merged = [...official];
  for (const round of others.flat()) {
    if (officialEvents.has(round.eventKey) || ids.has(round.id)) continue;
    ids.add(round.id);
    merged.push(round);
  }
  return merged;
}
