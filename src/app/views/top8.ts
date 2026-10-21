import { TOP_COUNT, type PlainDate } from '../../engine';
import { t, type MessageKey } from '../../i18n';
import type { ListedRound } from '../../parsers';
import { el } from '../dom';
import { formatRating } from '../format';
import type { TopEight, TopPeriod } from '../top8';
import { periodControls, periodId, periodLabel } from './period';
import { eventUrl } from './pdga';

/*
 * The content of the Top 8 card on the Rating tab: the period, then a card
 * laid out like the PDGA Global Masters Series player card in the app's own
 * themes, with Sum, Average and High, then the rounds highest first.
 */

/** PDGA's page about the Global Masters Series, which the Top 8 follows. */
export const GMS_URL = 'https://www.pdga.com/global-masters-series';

export const TOP8_PERIOD_ID = periodId('top8');
export const TOP8_OWN_ID = 'top8-own';

export interface Top8Props {
  top: TopEight;
  /** Today, which ends a custom range when one is first picked. */
  today: PlainDate;
  onPeriod: (period: TopPeriod) => void;
  /** Counts the user's own (manual) rounds in the Top 8, or stops counting them. */
  onOwn: (own: boolean) => void;
}

/** Shown only when the player has a rated manual round, since only then does it change anything. */
function ownSwitch({ top, onOwn }: Top8Props): HTMLElement {
  return el(
    'div',
    { class: 'check top8-own' },
    el('input', {
      id: TOP8_OWN_ID,
      type: 'checkbox',
      checked: top.own,
      onchange: (change) => onOwn((change.target as HTMLInputElement).checked),
    }),
    el('label', { for: TOP8_OWN_ID }, t('top8.own')),
  );
}

/** A round number as "RD 2"; a named round such as "Finals" as it is. */
function roundLabel(label: string): string {
  return /^\d+$/.test(label) ? t('top8.round', { number: label }) : label;
}

/** A round; the user's own reads "Own" where a round number would be, with its event name if it has one. */
function row(round: ListedRound): HTMLElement {
  const own = round.source === 'manual';
  const name = own
    ? round.eventName || t('top8.ownRound')
    : round.eventName && round.eventId !== null
      ? el('a', { href: eventUrl(round.eventId), rel: 'noreferrer' }, round.eventName)
      : round.eventName;
  return el(
    'li',
    { class: own ? 'top8-row top8-row-own' : 'top8-row' },
    el('span', { class: 'top8-label' }, own ? t('top8.ownLabel') : roundLabel(round.roundLabel)),
    el('span', { class: 'top8-event' }, name),
    el('span', { class: 'top8-rating' }, formatRating(round.rating!)),
  );
}

function figure(label: MessageKey, value: number): HTMLElement {
  return el('div', { class: 'top8-figure' }, el('dt', {}, t(label)), el('dd', {}, formatRating(value)));
}

function gmsCard(top: TopEight): HTMLElement {
  const { result } = top;
  if (result.sum === null || result.average === null || result.high === null) {
    return el('div', { class: 'top8-card' }, el('p', { class: 'top8-empty' }, t('top8.empty')));
  }
  return el(
    'div',
    { class: 'top8-card' },
    el(
      'dl',
      { class: 'top8-figures' },
      figure('top8.sum', result.sum),
      figure('top8.average', result.average),
      figure('top8.high', result.high),
    ),
    result.found < TOP_COUNT &&
      el('p', { id: 'top8-found', class: 'top8-found' }, t('top8.found', { count: result.found, total: TOP_COUNT })),
    el('ol', { class: 'top8-rounds' }, ...result.rounds.map(row)),
  );
}

/**
 * One line for the closed card, following the chosen period: "Average 1014
 * · 2026", with fewer than 8 rounds "Average 1003 · 5 of 8 · 2026".
 */
export function top8Teaser(top: TopEight): string {
  const { average, found } = top.result;
  const period = periodLabel(top.period, top.year);
  if (average === null) return t('top8.teaserEmpty', { period });
  if (found < TOP_COUNT) {
    return t('top8.teaserFew', { average: formatRating(average), count: found, total: TOP_COUNT, period });
  }
  return t('top8.teaser', { average: formatRating(average), period });
}

/**
 * The card's content: the period (with its dates for a custom range), the
 * switch for the user's own rounds, then the GMS-style card.
 */
export function top8Panel(props: Top8Props): HTMLElement[] {
  const { top, today, onPeriod } = props;
  return [
    ...periodControls({
      id: 'top8',
      ...top,
      today,
      windowDates: true,
      // The Top 8 offers no "last 24 months", so its select never picks it.
      onPeriod: (period) => period.kind !== 'recent' && onPeriod(period),
    }),
    ...(top.hasOwn ? [ownSwitch(props)] : []),
    gmsCard(props.top),
  ];
}
