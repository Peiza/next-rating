import {
  compareDates,
  explainChange,
  nextRatingUpdate,
  officialState,
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
  normalizeRatingsHistory,
  normalizeCareer,
  normalizeWins,
  type Career,
  type HistoryEntry,
  type ListedRound,
  type PlayerInfo,
} from '../parsers';
import { today } from './format';
import type { StoredImport } from './import';
import type { StoredManualRound, StoredPlayer } from './storage';

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
    ...(round.example && { example: true }),
    ...(round.leftOut && { leftOut: true }),
  }));
}

/**
 * The engine input with another set of manual rounds in place of the
 * player's: the imported rounds, then the manual ones newest added first,
 * the order buildModel uses (mergeRounds keeps every manual round, last).
 */
export function withManualRounds(model: Model, manual: readonly StoredManualRound[]): ListedRound[] {
  return [...model.rounds.filter((round) => round.source !== 'manual'), ...manualToRounds(manual).reverse()];
}

/**
 * X-tier events with non-standard rules, such as mulligans, may produce round
 * ratings that do not count (Competition Manual 5.10); other X-tier events
 * count normally. So their unofficial rounds count, marked as maybe not.
 */
export function isXTier(tier: string | undefined): boolean {
  return /^x/i.test(tier ?? '');
}

/**
 * A league (tier L) is rated only once the whole league is finished and
 * reported, so its unofficial rounds may miss the next update.
 */
export function isLeague(tier: string | undefined): boolean {
  return /^l$/i.test(tier ?? '');
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
  league: boolean;
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
  /** Dated after the following update's deadline too, so it counts in a later update than that. */
  later: boolean;
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
  /** The update after the next one. */
  followingUpdate: RatingUpdate;
  /**
   * The prediction for the following update, only when some rounds count
   * there and not in the next one. Null otherwise, since it is then the
   * next update's prediction.
   */
  following: FollowingPrediction | null;
  /** The official rating from each update on, oldest first; empty before an import brings the ratings history. */
  history: HistoryEntry[];
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
  /** Tournaments and wins, in the career and in the rating window. */
  wins: WinsSummary;
}

export interface WinsSummary {
  /** PDGA's career events and wins, from the player page; null before an import brings them. */
  career: Career | null;
  /**
   * Events in the rating window: those with imported rounds in it, and the
   * wins dated in it. Null without a window.
   */
  periodEvents: number | null;
  /** The wins dated in the rating window; null without a window or before the wins page is imported. */
  periodWins: number | null;
}

/**
 * The career figures, and the events and wins in the rating window. A win
 * is in the window by its date on the wins page. A player whose career
 * shows no wins has none in the window either, without the wins page.
 */
export function winsSummary(stored: StoredImport, rounds: readonly ListedRound[], prediction: Prediction): WinsSummary {
  const career = stored.career ? normalizeCareer(stored.career) : null;
  const { windowStart, windowEnd } = prediction.stats;
  if (windowStart === null || windowEnd === null) return { career, periodEvents: null, periodWins: null };
  const events = new Set(
    rounds
      .filter((round, i) => round.source !== 'manual' && ['included', 'dropped'].includes(prediction.rounds[i]!.status))
      .map((round) => round.eventKey),
  );
  const list = stored.wins ? normalizeWins(stored.wins) : career?.wins === 0 ? [] : null;
  const inWindow = list?.filter((win) => compareDates(win.date, windowStart) >= 0 && compareDates(win.date, windowEnd) <= 0);
  for (const win of inWindow ?? []) events.add(eventKeyOf(win.eventId, win.name, win.date));
  return { career, periodEvents: events.size, periodWins: inWindow?.length ?? null };
}

export interface FollowingPrediction {
  rating: number;
  /**
   * The change vs the next update's prediction, which the following update
   * starts from; null when the next update has no prediction.
   */
  change: number | null;
}

/**
 * The following update's prediction: the same rounds with its deadline, the
 * same left-out events. Null when no round waits for it.
 */
function followingPrediction(
  rounds: readonly ListedRound[],
  prediction: Prediction,
  followingUpdate: RatingUpdate,
  predict: (deadline: PlainDate) => Prediction,
): FollowingPrediction | null {
  const waiting = rounds.some(
    (round, i) => prediction.rounds[i]!.status === 'after-deadline' && compareDates(round.date, followingUpdate.deadline) <= 0,
  );
  if (!waiting) return null;
  const { rating } = predict(followingUpdate.deadline);
  if (rating === null) return null;
  return { rating, change: prediction.rating === null ? null : rating - prediction.rating };
}

/** The official state's unrounded rating, when it rounds to the official rating. */
function officialExactOf(rounds: readonly ListedRound[], currentRating: number | null): number | null {
  if (currentRating === null || !rounds.some((round) => round.source === 'official')) return null;
  const state = officialState(rounds);
  return state.rating === currentRating ? state.exact : null;
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
      league: isLeague(tier),
      leftOut,
      ifCounted,
    });
  }
  return [...events.values()].sort((a, b) => compareDates(b.date, a.date));
}

/**
 * The stored ratings history, oldest first. When the player header shows a
 * newer update than the history, as when only the details were imported
 * since, that update is added, so the last step is the current rating.
 */
export function historyOf(stored: StoredImport, player: PlayerInfo | null): HistoryEntry[] {
  const history = normalizeRatingsHistory(stored.history ?? []);
  const last = history.at(-1);
  const { currentRating, ratingDate } = player ?? {};
  if (last && currentRating != null && ratingDate != null && compareDates(ratingDate, last.date) > 0) {
    history.push({ date: ratingDate, rating: currentRating, rounds: null });
  }
  return history;
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
  // Published on the next update's day, so the one after it is the following month's.
  const followingUpdate = nextRatingUpdate(nextUpdate.update, nextUpdate.update);
  const unofficialKeys = new Set(rounds.filter((round) => round.source === 'unofficial').map((round) => round.eventKey));
  const leaveOut = new Set(leftOut.filter((key) => unofficialKeys.has(key)));
  const predict = (keys: ReadonlySet<string>, deadline = nextUpdate.deadline) =>
    predictRating(rounds, { currentRating, deadline, leaveOut: keys });
  const prediction = predict(leaveOut);
  const rows = rounds
    .map((round, i) => {
      const result = prediction.rounds[i]!;
      return { round, result, later: result.status === 'after-deadline' && compareDates(round.date, followingUpdate.deadline) > 0 };
    })
    .sort((a, b) => (a.round.date < b.round.date ? 1 : a.round.date > b.round.date ? -1 : 0));

  const explanation = explainChange(rounds, prediction, currentRating);
  const byId = new Map(rounds.map((round) => [round.id, round]));
  // A manual round the user unticked is parked, not news, so it gets no line.
  const changes =
    explanation?.items
      .map((item) => ({ round: byId.get(item.id)!, item }))
      .filter(({ round }) => !(round.source === 'manual' && round.leftOut)) ?? null;
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
    followingUpdate,
    following: followingPrediction(rounds, prediction, followingUpdate, (deadline) => predict(leaveOut, deadline)),
    history: historyOf(stored, player),
    changes,
    difference: explanation?.difference ?? null,
    netChange: explanation ? explanation.total + (explanation.difference ?? 0) : null,
    officialExact: officialExactOf(rounds, currentRating),
    staleDetails,
    importedAt: stored.at,
    stale: now.getTime() - Date.parse(stored.at) > STALE_DAYS * DAY_MS,
    eventsWithoutRounds,
    unofficialEvents: unofficialEvents(rounds, prediction, predict, leaveOut),
    wins: winsSummary(stored, rounds, prediction),
  };
}

/** A stored player's model, with the player's manual rounds and left-out events: what the Rating tab shows. */
export function playerModel(player: StoredPlayer, stored: StoredImport, now: Date): Model {
  return buildModel(stored, player.pdgaNumber, now, manualToRounds(player.manualRounds), player.leftOut);
}

/** The Rating tab's prediction in brief, for the players list. */
export interface ListPrediction {
  rating: number;
  /** The change vs the official rating; null without one. */
  change: number | null;
  /** No new round counts in the next update, so the rating is the official one. */
  unchanged: boolean;
}

/** A player's prediction for the players list; null before an import, or when no rated round counts. */
export function listPrediction(player: StoredPlayer, now: Date): ListPrediction | null {
  if (!player.import) return null;
  const { rating, change, unchanged } = playerModel(player, player.import, now).prediction;
  return rating === null ? null : { rating, change, unchanged };
}

export type PredictionCache = (player: StoredPlayer, now: Date) => ListPrediction | null;

/**
 * `listPrediction`, remembered per player while the player's data and the
 * day stay the same. The players list shows every stored player on each
 * render, and storage hands out new objects after every change, so the key is
 * the content: every import sets a new `at`, and the day decides the update.
 */
export function createPredictionCache(): PredictionCache {
  const cache = new Map<number, { key: string; value: ListPrediction | null }>();
  return (player, now) => {
    const key = JSON.stringify([player.import?.at ?? null, player.manualRounds, player.leftOut, today(now)]);
    const hit = cache.get(player.pdgaNumber);
    if (hit?.key === key) return hit.value;
    const value = listPrediction(player, now);
    cache.set(player.pdgaNumber, { key, value });
    return value;
  };
}
