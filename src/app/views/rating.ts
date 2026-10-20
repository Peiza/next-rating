import { type ChangeKind, type RatingStats, type RoundStatus } from '../../engine';
import { t, type MessageKey } from '../../i18n';
import type { ListedRound } from '../../parsers';
import { el } from '../dom';
import {
  formatAge,
  formatAverage,
  formatChange,
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatEffect,
  formatRating,
} from '../format';
import type { ListedChange, ListedResult, Model } from '../model';
import { manualEntry, type ManualProps } from './manual';
import { detailsUrl, eventUrl } from './pdga';

export interface RatingProps {
  model: Model;
  /** Quick manual entry, under the prediction. */
  manual?: ManualProps;
  /** False for the unsaved player, which gets an Add to favorites button. */
  favorite: boolean;
  /** For the data age and the next update. */
  now: Date;
  onAddFavorite: (pdgaNumber: number) => void;
}

/** Where PDGA publishes when ratings are updated and which events an update counts. */
const UPDATES_URL = 'https://www.pdga.com/faq/ratings/when-updated';

/** Every status has a symbol and a text label, so it never depends on colour alone. */
const STATUS: Record<RoundStatus, { symbol: string; label: MessageKey }> = {
  included: { symbol: '✓', label: 'round.status.included' },
  doubled: { symbol: '×2', label: 'round.status.doubled' },
  dropped: { symbol: '↓', label: 'round.status.dropped' },
  'outside-window': { symbol: '○', label: 'round.status.outside-window' },
  'after-deadline': { symbol: '»', label: 'round.status.after-deadline' },
  dnf: { symbol: '–', label: 'round.status.dnf' },
};

const SOURCE: Record<ListedResult['round']['source'], MessageKey> = {
  official: 'round.source.official',
  unofficial: 'round.source.unofficial',
  manual: 'round.source.manual',
};

const DASH = '–';

/** The class suffix and arrow for a change. The arrow and a sign carry it, never colour alone. */
function direction(value: number): ['up' | 'down' | 'none', string] {
  return value > 0 ? ['up', '↑'] : value < 0 ? ['down', '↓'] : ['none', '→'];
}

function change(value: number): HTMLElement {
  const [dir, arrow] = direction(value);
  return el(
    'p',
    { class: `change change-${dir}` },
    el('span', { class: 'change-arrow', 'aria-hidden': 'true' }, arrow),
    t('rating.change', { change: formatChange(value) }),
  );
}

/**
 * When the next update comes and which events it counts, linked to PDGA's
 * page with the rule. The same dates the prediction is made for.
 */
function nextUpdate({ update, deadline }: Model['nextUpdate']): HTMLElement {
  return el(
    'p',
    { id: 'next-update', class: 'next-update' },
    el(
      'a',
      { href: UPDATES_URL, rel: 'noreferrer' },
      t('rating.nextUpdate', { update: formatDayMonth(update), deadline: formatDayMonth(deadline) }),
    ),
  );
}

function summary({ model, favorite, now, onAddFavorite }: RatingProps): HTMLElement {
  const { player, pdgaNumber, prediction } = model;
  const official = player?.currentRating ?? null;
  return el(
    'div',
    { class: 'summary' },
    el('p', { id: 'updated', class: 'updated' }, t('rating.updated', { age: formatAge(model.importedAt, now) })),
    prediction.rating !== null && el('p', { class: 'visually-hidden' }, t('rating.title')),
    prediction.rating !== null
      ? el('p', { id: 'predicted', class: 'predicted' }, formatRating(prediction.rating))
      : el('p', { id: 'predicted', class: 'lead' }, t('rating.none')),
    prediction.change !== null && change(prediction.change),
    nextUpdate(model.nextUpdate),
    official !== null &&
      el(
        'p',
        { class: 'official' },
        player?.ratingDate
          ? t('rating.official', { rating: formatRating(official), date: formatDate(player.ratingDate) })
          : t('rating.officialNoDate', { rating: formatRating(official) }),
      ),
    el('p', { class: 'hint' }, t('rating.lastImport', { time: formatDateTime(model.importedAt) })),
    el(
      'a',
      { id: 'refresh', class: 'button button-block', href: detailsUrl(pdgaNumber), rel: 'noreferrer' },
      t('rating.refresh'),
    ),
    !favorite &&
      el(
        'button',
        { id: 'add-favorite', class: 'button', type: 'button', onclick: () => onAddFavorite(pdgaNumber) },
        t('rating.addFavorite', { number: pdgaNumber }),
      ),
  );
}

function roundLabel(label: string): string {
  return /^\d+$/.test(label) ? t('round.number', { number: label }) : label;
}

/** The event name, linked to its pdga.com page when the id is known, then the round. */
function roundEvent(round: ListedRound): HTMLElement | false {
  const label = round.roundLabel && roundLabel(round.roundLabel);
  if (!round.eventName && !label) return false;
  const name =
    round.eventName && round.eventId !== null
      ? el('a', { href: eventUrl(round.eventId), rel: 'noreferrer' }, round.eventName)
      : round.eventName;
  return el('p', { class: 'round-event' }, name, round.eventName && label ? ', ' : '', label);
}

function roundItem({ round, result }: ListedResult): HTMLElement {
  const status = STATUS[result.status];
  const details = [
    formatDate(round.date),
    round.holes !== undefined && round.holes !== 18 ? t('round.holes', { count: round.holes }) : '',
    t(SOURCE[round.source]),
  ].filter(Boolean);
  return el(
    'li',
    { class: `round round-${result.status}` },
    el(
      'div',
      { class: 'round-main' },
      el('span', { class: 'round-rating' }, round.rating !== null ? formatRating(round.rating) : DASH),
      el(
        'span',
        { class: 'round-status' },
        el('span', { class: 'round-symbol', 'aria-hidden': 'true' }, status.symbol),
        ` ${t(status.label)}`,
      ),
    ),
    roundEvent(round),
    el('p', { class: 'round-meta' }, details.join(' · ')),
  );
}

/** The "Why it changed" text for each kind of change. New rounds that do not count say why. */
const REASON: Record<ChangeKind, MessageKey> = {
  new: 'why.new',
  'left-window': 'why.leftWindow',
  'entered-window': 'why.enteredWindow',
  'started-doubling': 'why.startedDoubling',
  'stopped-doubling': 'why.stoppedDoubling',
  'newly-dropped': 'why.newlyDropped',
  'no-longer-dropped': 'why.noLongerDropped',
};

const NEW_ROUND: Partial<Record<RoundStatus, MessageKey>> = {
  doubled: 'why.newDoubled',
  dropped: 'why.newDropped',
  'outside-window': 'why.newOutsideWindow',
};

/** Lines shown before "Show all". */
const REASONS_SHOWN = 5;

function effect(value: number): HTMLElement {
  // The arrow follows the effect as shown, so a tiny effect shown as 0.0 gets →.
  const [dir, arrow] = direction(Math.round(value * 10));
  return el(
    'span',
    { class: `reason-effect change-${dir}` },
    el('span', { class: 'reason-arrow', 'aria-hidden': 'true' }, arrow),
    formatEffect(value),
  );
}

function reasonItem({ round, item }: ListedChange): HTMLElement {
  const key = item.kind === 'new' ? (NEW_ROUND[item.after] ?? REASON.new) : REASON[item.kind];
  const where = [round.eventName, round.roundLabel && roundLabel(round.roundLabel), formatDate(round.date)];
  return el(
    'li',
    { class: 'reason' },
    effect(item.effect),
    el('p', { class: 'reason-text' }, t(key, { rating: formatRating(item.rating) })),
    el('p', { class: 'reason-meta' }, where.filter(Boolean).join(' · ')),
  );
}

/** The part of the change the rounds do not explain, so the lines add up to the change shown. */
function differenceItem(value: number): HTMLElement {
  return el(
    'li',
    { id: 'why-difference', class: 'reason' },
    effect(value),
    el('p', { class: 'reason-text' }, t('why.difference')),
  );
}

/** What changed since the last official update, largest effect first. */
function whyChanged(model: Model): HTMLElement | false {
  const { changes, prediction, difference, staleDetails, player } = model;
  if (prediction.change === null || !changes || (changes.length === 0 && difference === null)) return false;
  const shown = changes.slice(0, REASONS_SHOWN);
  const more = changes.slice(REASONS_SHOWN);
  return el(
    'section',
    { id: 'why', class: 'why', 'aria-labelledby': 'why-title' },
    el('h2', { id: 'why-title' }, t('why.title')),
    el('ul', { class: 'reasons' }, ...shown.map(reasonItem), difference !== null && differenceItem(difference)),
    more.length > 0 &&
      el(
        'details',
        { class: 'reasons-more' },
        el('summary', {}, t('why.showAll', { total: changes.length })),
        el('ul', { class: 'reasons' }, ...more.map(reasonItem)),
      ),
    difference !== null &&
      staleDetails &&
      player?.ratingDate &&
      el('p', { class: 'hint' }, t('why.staleDetails', { date: formatDate(player.ratingDate) })),
  );
}

function statsPanel(stats: RatingStats, exact: number | null): HTMLElement {
  const count = (value: number) => formatRating(value);
  const average = (value: number | null) => (value === null ? DASH : formatAverage(value));
  const hasWindow = stats.windowMonths !== null && stats.windowStart !== null && stats.windowEnd !== null;
  // The window length sits next to its label, and the dates on their own line below.
  const window: [string, string?] = hasWindow
    ? [
        t('stats.windowMonths', { count: stats.windowMonths! }),
        t('stats.windowRange', { start: formatDate(stats.windowStart!), end: formatDate(stats.windowEnd!) }),
      ]
    : [DASH];
  const rows: [MessageKey, string, string?][] = [
    ['stats.exact', average(exact)],
    ['stats.totalRounds', count(stats.totalRounds)],
    ['stats.dnfRounds', count(stats.dnfRounds)],
    ['stats.careerEvents', count(stats.careerEvents)],
    ['stats.window', ...window],
    ['stats.roundsInWindow', count(stats.roundsInWindow)],
    ['stats.roundsOutsideWindow', count(stats.roundsOutsideWindow)],
    ['stats.roundsDropped', count(stats.roundsDropped)],
    ['stats.roundsCounted', count(stats.roundsCounted)],
    ['stats.roundsDoubled', count(stats.roundsDoubled)],
    ['stats.averageAll', average(stats.averageAll)],
    ['stats.averageInWindow', average(stats.averageInWindow)],
    ['stats.averageCounted', average(stats.averageCounted)],
    ['stats.stdDev', average(stats.stdDev)],
    ['stats.lowestInWindow', stats.lowestInWindow === null ? DASH : formatRating(stats.lowestInWindow)],
    ['stats.lowestLimit', average(stats.lowestLimit)],
  ];
  return el(
    'details',
    { id: 'stats', class: 'stats' },
    el('summary', {}, t('stats.title')),
    el(
      'dl',
      {},
      ...rows.map(([key, value, detail]) =>
        el(
          'div',
          { class: 'stat' },
          el('dt', {}, t(key)),
          el('dd', {}, value),
          detail !== undefined && el('dd', { class: 'stat-detail' }, detail),
        ),
      ),
    ),
  );
}

/** The Rating tab once there is imported data. */
export function ratingView(props: RatingProps): HTMLElement {
  const { model } = props;
  return el(
    'section',
    { class: 'view', 'aria-labelledby': 'view-title' },
    el(
      'h1',
      { id: 'view-title' },
      model.player?.name
        ? t('rating.player', { name: model.player.name, number: model.pdgaNumber })
        : t('rating.playerNumber', { number: model.pdgaNumber }),
    ),
    summary(props),
    props.manual && manualEntry(props.manual),
    whyChanged(model),
    model.eventsWithoutRounds.length > 0 &&
      el(
        'p',
        { class: 'hint' },
        t('rating.eventsWithoutRounds', {
          number: model.pdgaNumber,
          events: model.eventsWithoutRounds
            .map(({ name, date }) => name || (date ? formatDate(date) : DASH))
            .join(', '),
        }),
      ),
    statsPanel(model.prediction.stats, model.prediction.exact),
    model.rows.length > 0 && el('h2', {}, t('rating.rounds')),
    model.rows.length > 0 && el('ol', { class: 'rounds' }, ...model.rows.map(roundItem)),
    el('p', { class: 'notice' }, t('app.unofficial')),
  );
}
