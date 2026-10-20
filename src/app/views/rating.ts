import { type ChangeKind, type PlainDate, type RatingStats, type RoundStatus } from '../../engine';
import { t, type MessageKey } from '../../i18n';
import type { ListedRound } from '../../parsers';
import { disclosure, el, textWithNodes, type Child, type Disclosure } from '../dom';
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
import { STALE_DAYS, type ListedChange, type ListedResult, type Model } from '../model';
import { DEFAULT_CARDS, type CardName, type CardState } from '../storage';
import { card, cardIntro } from './card';
import { manualEntry, type ManualProps } from './manual';
import { detailsUrl, eventUrl } from './pdga';
import { targetCalculator, type TargetProps } from './target';
import { GMS_URL, top8Panel, type Top8Props } from './top8';

export interface RatingProps {
  model: Model;
  /** The Add a round card's content. */
  manual?: ManualProps;
  /** The Reach a target rating card's content. */
  target?: TargetProps;
  /** The Top 8 card's content. */
  top8?: Top8Props;
  /** Whether "How to refresh" is open; it follows the data age when left out. */
  refresh?: Disclosure;
  /** Which cards are open; only Rounds when left out. */
  cards?: CardState;
  onToggleCard?: (name: CardName) => void;
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

/** Opens the player's ratings details on pdga.com, where the bookmarklet refreshes the data. */
function refreshButton(pdgaNumber: number, primary: boolean): HTMLElement {
  return el(
    'a',
    {
      id: 'refresh',
      class: primary ? 'button button-primary button-block' : 'button button-block',
      href: detailsUrl(pdgaNumber),
      rel: 'noreferrer',
    },
    t('rating.refresh'),
  );
}

/**
 * The data age with a small "How to refresh" that explains the round trip,
 * and the Refresh button under it. Old data turns it into a warning that
 * opens by itself.
 */
function refreshBox(model: Model, now: Date, state: Disclosure | undefined): HTMLElement {
  const { stale, pdgaNumber, importedAt } = model;
  return el(
    'div',
    { id: 'refresh-box', class: stale ? 'refresh refresh-warning' : 'refresh' },
    el(
      'details',
      { id: 'refresh-help', class: 'refresh-help', ...disclosure(state ?? { open: stale, onToggle: () => {} }) },
      el(
        'summary',
        {},
        el('span', { id: 'updated', class: 'updated' }, t('rating.updated', { age: formatAge(importedAt, now) })),
        el('span', { class: 'refresh-how' }, t('rating.howToRefresh')),
      ),
      stale && el('p', { id: 'stale', class: 'refresh-stale' }, t('rating.stale', { days: STALE_DAYS })),
      el('p', {}, t('rating.refreshHow')),
      el('p', { class: 'hint' }, t('rating.lastImport', { time: formatDateTime(importedAt) })),
    ),
    refreshButton(pdgaNumber, stale),
  );
}

/** "Official rating 978 (calculated 977.65), as of …", the calculated value when the engine reproduces the rating. */
function officialLine(official: number, exact: number | null, date: PlainDate | null): HTMLElement {
  const rating =
    exact === null
      ? formatRating(official)
      : t('rating.officialCalculated', { rating: formatRating(official), exact: formatAverage(exact) });
  return el(
    'p',
    { id: 'official', class: 'official' },
    date ? t('rating.official', { rating, date: formatDate(date) }) : t('rating.officialNoDate', { rating }),
  );
}

function summary({ model, favorite, now, refresh, onAddFavorite }: RatingProps): HTMLElement {
  const { player, pdgaNumber, prediction } = model;
  const official = player?.currentRating ?? null;
  return el(
    'div',
    { class: 'summary' },
    prediction.rating !== null && el('p', { class: 'visually-hidden' }, t('rating.title')),
    prediction.rating !== null
      ? el('p', { id: 'predicted', class: 'predicted' }, formatRating(prediction.rating))
      : el('p', { id: 'predicted', class: 'lead' }, t('rating.none')),
    prediction.change !== null && change(prediction.change),
    official !== null && officialLine(official, model.officialExact, player?.ratingDate ?? null),
    nextUpdate(model.nextUpdate),
    refreshBox(model, now, refresh),
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

/** What happened to the round, such as "985 no longer counts twice". */
function reasonText({ item }: ListedChange): string {
  const key = item.kind === 'new' ? (NEW_ROUND[item.after] ?? REASON.new) : REASON[item.kind];
  return t(key, { rating: formatRating(item.rating) });
}

function reasonItem(change: ListedChange): HTMLElement {
  const { round, item } = change;
  const where = [round.eventName, round.roundLabel && roundLabel(round.roundLabel), formatDate(round.date)];
  return el(
    'li',
    { class: 'reason' },
    effect(item.effect),
    el('p', { class: 'reason-text' }, reasonText(change)),
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

/** True when there is something to explain about the change. */
function hasChanges({ changes, prediction, difference }: Model): boolean {
  return prediction.change !== null && changes !== null && (changes.length > 0 || difference !== null);
}

/** The largest effect as one line for the closed card, such as "907 no longer counts twice, +0.7". */
function whyTeaser({ changes, difference }: Model): string | false {
  const top = changes?.[0];
  const [reason, value] =
    top && (difference === null || Math.abs(top.item.effect) >= Math.abs(difference))
      ? [reasonText(top), top.item.effect]
      : difference !== null
        ? [t('why.difference'), difference]
        : [null, 0];
  return reason !== null && t('why.teaser', { reason, effect: formatEffect(value) });
}

/** What changed since the last official update, largest effect first. */
/**
 * What the lines add up to, and what that rounds to, so a long list of
 * effects that offset each other does not look like a big change.
 */
function netLine(net: number, change: number): HTMLElement {
  const text =
    change === 0
      ? t('why.netNoChange', { net: formatEffect(net) })
      : t('why.net', { net: formatEffect(net), change: formatChange(change) });
  return el('p', { id: 'why-net', class: 'why-net' }, text);
}

function whyBody(model: Model, changes: ListedChange[]): Child[] {
  const { difference, staleDetails, player, netChange, prediction } = model;
  const shown = changes.slice(0, REASONS_SHOWN);
  const more = changes.slice(REASONS_SHOWN);
  return [
    netChange !== null && prediction.change !== null && netLine(netChange, prediction.change),
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
  ];
}

function statsList(stats: RatingStats, exact: number | null): HTMLElement {
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
    'dl',
    { class: 'stats' },
    ...rows.map(([key, value, detail]) =>
      el(
        'div',
        { class: 'stat' },
        el('dt', {}, t(key)),
        el('dd', {}, value),
        detail !== undefined && el('dd', { class: 'stat-detail' }, detail),
      ),
    ),
  );
}

/** Every round, newest first, after the events that have no rated round for the player yet. */
function roundsBody(model: Model): Child[] {
  return [
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
    model.rows.length > 0 && el('ol', { class: 'rounds' }, ...model.rows.map(roundItem)),
  ];
}

/** The Top 8 explanation, with the Global Masters Series linked to PDGA's page about it. */
function top8Intro(): HTMLElement {
  const gms = el('a', { href: GMS_URL, rel: 'noreferrer' }, t('top8.gms'));
  return cardIntro(...textWithNodes(t('top8.intro'), { gms }));
}

/**
 * The Rating tab once there is imported data: the summary, then one card
 * per section, each starting with a one-line explanation.
 */
export function ratingView(props: RatingProps): HTMLElement {
  const { model, manual, target, top8, cards = DEFAULT_CARDS, onToggleCard = () => {} } = props;
  const section = (name: CardName, title: MessageKey, body: () => Child[], teaser?: string | false) =>
    card({ name, title, open: cards[name], teaser, onToggle: onToggleCard }, body);
  const { changes } = model;
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
    hasChanges(model) &&
      section('why', 'why.title', () => [cardIntro(t('why.intro')), ...whyBody(model, changes!)], whyTeaser(model)),
    manual &&
      section(
        'manual',
        'manual.toggle',
        () => [cardIntro(t('manual.intro')), ...manualEntry(manual)],
        manual.rounds.length > 0 && t('manual.count', { count: manual.rounds.length }),
      ),
    target && section('target', 'target.toggle', () => [cardIntro(t('target.intro')), targetCalculator(target)]),
    top8 && section('top8', 'top8.title', () => [top8Intro(), ...top8Panel(top8)]),
    section('stats', 'stats.title', () => [
      cardIntro(t('stats.intro')),
      statsList(model.prediction.stats, model.prediction.exact),
    ]),
    (model.rows.length > 0 || model.eventsWithoutRounds.length > 0) &&
      section('rounds', 'rating.rounds', () => [cardIntro(t('rating.roundsIntro')), ...roundsBody(model)]),
    el('p', { class: 'notice' }, t('app.unofficial')),
  );
}
