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
  eventKeyOf,
  eventToRounds,
  mergeRounds,
  normalizeEvent,
  normalizePlayer,
  normalizeProfileEvents,
  normalizeRatingsDetails,
  type ListedRound,
  type PlayerInfo,
} from '../parsers';
import { today } from './format';
import type { StoredImport } from './import';
import type { StoredManualRound } from './storage';

/*
 * Turns one player's stored import and manual rounds into what the Rating
 * tab shows. Pure, so it is tested with synthetic data.
 */

/**
 * Manual rounds for the engine. Rounds with the same event name (in any
 * case) and date form one event, so the mid-event double-weight rule applies;
 * a round without a name is an event of its own. The "m:" prefix keeps manual
 * events apart from imported ones.
 */
export function manualToRounds(rounds: readonly StoredManualRound[]): ListedRound[] {
  return rounds.map((round) => ({
    id: `m:${round.id}`,
    rating: round.rating,
    date: round.date,
    eventKey: round.eventName ? `m:${eventKeyOf(null, round.eventName.toLowerCase(), round.date)}` : `m:${round.id}`,
    ...(round.holes !== null && { holes: round.holes }),
    source: 'manual',
    eventId: null,
    eventName: round.eventName,
    roundLabel: '',
  }));
}

/**
 * X-tier events with non-standard rules, such as mulligans, may produce round
 * ratings that do not count (Competition Manual 5.10); other X-tier events
 * count normally. So their unofficial rounds count, marked as maybe not.
 */
export function isXTier(tier: string | undefined): boolean {
  return /^x/i.test(tier ?? '');
}

/** An unofficial event with rated rounds, which the user can leave out of the prediction. */
export interface UnofficialEvent {
  /** The engine's event key, which the stored choice refers to. */
  key: string;
  name: string;
  date: PlainDate;
  /** The tier from the profile page, such as "XA"; '' when unknown. */
  tier: string;
  xTier: boolean;
  leftOut: boolean;
  /**
   * For a left-out event: the prediction if it counted, and how far that is
   * from the prediction shown (unrounded). Null for a counted event.
   */
  ifCounted: { rating: number; effect: number } | null;
}

/** Data older than this many days gets a notice to refresh it on pdga.com. */
export const STALE_DAYS = 7;
const DAY_MS = 86_400_000;

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
  /** The engine input: every round, in the order the prediction used. */
  rounds: ListedRound[];
  /** The unofficial events left out of the prediction, by event key: what the target calculator leaves out too. */
  leaveOut: ReadonlySet<string>;
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
   * What the "Why it changed" lines add up to, the difference line included.
   * Many lines can offset each other, so this shows how big the change really
   * is before rounding. Null without an explanation.
   */
  netChange: number | null;
  /**
   * The official rating as the engine calculates it from the official state,
   * unrounded, such as 977.65 for 978. Only when that state rounds to the
   * official rating; null otherwise.
   */
  officialExact: number | null;
  /**
   * The ratings details were imported before the official rating date, so
   * they may be older than the last update.
   */
  staleDetails: boolean;
  importedAt: string;
  /** The last import is more than STALE_DAYS old, so the Rating tab suggests a refresh on pdga.com. */
  stale: boolean;
  /** Imported events with no rated rounds for the player. */
  eventsWithoutRounds: { name: string; date: PlainDate | null }[];
  /** The unofficial events, newest first. */
  unofficialEvents: UnofficialEvent[];
}

/**
 * One entry per unofficial event among the rounds, newest first. A left-out
 * event also gets the prediction it would give if it counted, from the
 * engine, so Why it changed can show what leaving it out does.
 */
function unofficialEvents(
  rounds: readonly ListedRound[],
  prediction: Prediction,
  predict: (leaveOut: ReadonlySet<string>) => Prediction,
  leaveOut: ReadonlySet<string>,
): UnofficialEvent[] {
  const events = new Map<string, UnofficialEvent>();
  for (const round of rounds) {
    if (round.source !== 'unofficial' || events.has(round.eventKey)) continue;
    const tier = round.tier ?? '';
    const leftOut = leaveOut.has(round.eventKey);
    let ifCounted: UnofficialEvent['ifCounted'] = null;
    if (leftOut) {
      const counted = predict(new Set([...leaveOut].filter((key) => key !== round.eventKey)));
      if (counted.rating !== null && counted.exact !== null && prediction.exact !== null) {
        ifCounted = { rating: counted.rating, effect: counted.exact - prediction.exact };
      }
    }
    events.set(round.eventKey, {
      key: round.eventKey,
      name: round.eventName,
      date: round.date,
      tier,
      xTier: isXTier(tier),
      leftOut,
      ifCounted,
    });
  }
  return [...events.values()].sort((a, b) => compareDates(b.date, a.date));
}

/**
 * `leftOut` holds the event keys of the unofficial events the user left out
 * of the prediction; keys of other events are ignored.
 */
export function buildModel(
  stored: StoredImport,
  pdgaNumber: number,
  now: Date,
  manualRounds: readonly ListedRound[] = [],
  leftOut: readonly string[] = [],
): Model {
  const player = stored.player ? normalizePlayer(stored.player) : null;
  const official = detailsToRounds(normalizeRatingsDetails(stored.details ?? []).rounds);
  // Event pages do not show the tier; the profile page lists it for the season's events.
  const tiers = new Map(normalizeProfileEvents(stored.profileEvents ?? []).map((event) => [event.eventId, event.tier]));

  const eventsWithoutRounds: Model['eventsWithoutRounds'] = [];
  const eventRounds = stored.events.map((raw) => {
    const event = normalizeEvent(raw);
    const tier = event.eventId !== null ? tiers.get(event.eventId) : undefined;
    const rounds = eventToRounds(event, pdgaNumber).map((round) => (tier ? { ...round, tier } : round));
    if (rounds.length === 0) eventsWithoutRounds.push({ name: event.name, date: event.date });
    return rounds;
  });

  // Newest first for the engine too: on the same date, earlier counts as more recent.
  const rounds = mergeRounds(official, ...eventRounds.reverse(), [...manualRounds].reverse());
  const currentRating = player?.currentRating ?? null;
  const nextUpdate = nextRatingUpdate(today(now), player?.ratingDate ?? null);
  const unofficialKeys = new Set(rounds.filter((round) => round.source === 'unofficial').map((round) => round.eventKey));
  const leaveOut = new Set(leftOut.filter((key) => unofficialKeys.has(key)));
  const predict = (keys: ReadonlySet<string>) =>
    predictRating(rounds, { currentRating, deadline: nextUpdate.deadline, leaveOut: keys });
  const prediction = predict(leaveOut);
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
    rounds,
    leaveOut,
    rows,
    prediction,
    nextUpdate,
    changes,
    difference: explanation?.difference ?? null,
    netChange: explanation ? explanation.total + (explanation.difference ?? 0) : null,
    officialExact:
      explanation && currentRating !== null && explanation.before.rating === currentRating ? explanation.before.exact : null,
    staleDetails,
    importedAt: stored.at,
    stale: now.getTime() - Date.parse(stored.at) > STALE_DAYS * DAY_MS,
    eventsWithoutRounds,
    unofficialEvents: unofficialEvents(rounds, prediction, predict, leaveOut),
  };
}
