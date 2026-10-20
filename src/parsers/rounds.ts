import type { PlainDate } from '../engine/dates';
import type { RoundInput } from '../engine/types';
import type { DetailsRound, EventResults } from './types';

/** A round with what the round list shows. The engine ignores the extra fields. */
export type ListedRound = RoundInput & {
  eventName: string;
  /** Round label as pdga.com shows it, such as "2" or "Finals". */
  roundLabel: string;
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
        eventName: round.eventName,
        roundLabel: round.roundLabel,
      };
    }),
  );
}

/**
 * One player's rounds from an event results page. Rounds without a rating
 * yet are left out; DNF rounds are kept so they show in the round list.
 * `date` overrides the event date, which pasted results do not include.
 */
export function eventToRounds(
  results: EventResults,
  pdgaNumber: number,
  date: PlainDate | null = results.date,
): ListedRound[] {
  if (date === null) return [];
  const eventKey = eventKeyOf(results.eventId, results.name, date);
  const rounds: ListedRound[] = [];
  for (const division of results.divisions) {
    for (const row of division.rows) {
      if (row.pdgaNumber !== pdgaNumber) continue;
      row.rounds.forEach((round, i) => {
        if (!round.dnf && round.rating === null) return;
        const holes = division.holes[i] ?? null;
        rounds.push({
          id: `u:${eventKey}:${division.division}:${i + 1}`,
          rating: round.rating,
          date,
          eventKey,
          ...(holes !== null && { holes }),
          ...(round.dnf && { dnf: true }),
          source: 'unofficial',
          eventName: results.name,
          roundLabel: String(i + 1),
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
