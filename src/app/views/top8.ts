import { TOP_COUNT } from '../../engine';
import { t, type MessageKey } from '../../i18n';
import type { ListedRound } from '../../parsers';
import { el } from '../dom';
import { formatDate, formatRating } from '../format';
import type { TopEight, TopPeriod } from '../top8';
import { eventUrl } from './pdga';
import { segmented, type Segment } from './segmented';

/*
 * The content of the Top 8 card on the Rating tab, laid out like the PDGA
 * Global Masters Series player card in the app's own themes: a band with the
 * period, Sum, Average and High, then the rounds highest first.
 */

/** PDGA's page about the Global Masters Series, which the Top 8 follows. */
export const GMS_URL = 'https://www.pdga.com/global-masters-series';

export interface Top8Props {
  top: TopEight;
  onPeriod: (period: TopPeriod) => void;
}

export const TOP8_PERIODS: readonly Segment<TopPeriod>[] = [
  { value: 'year', id: 'top8-year', label: 'top8.year' },
  { value: 'window', id: 'top8-window', label: 'top8.window' },
];

function band({ period, year, window }: TopEight): string {
  if (period === 'year') return t('top8.bandYear', { year: String(year) });
  if (!window) return t('top8.window');
  return t('top8.bandWindow', {
    months: t('stats.windowMonths', { count: window.months }),
    start: formatDate(window.start),
    end: formatDate(window.end),
  });
}

/** A round number as "RD 2"; a named round such as "Finals" as it is. */
function roundLabel(label: string): string {
  return /^\d+$/.test(label) ? t('top8.round', { number: label }) : label;
}

function row(round: ListedRound): HTMLElement {
  const name =
    round.eventName && round.eventId !== null
      ? el('a', { href: eventUrl(round.eventId), rel: 'noreferrer' }, round.eventName)
      : round.eventName;
  return el(
    'li',
    { class: 'top8-row' },
    el('span', { class: 'top8-label' }, roundLabel(round.roundLabel)),
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
    return el(
      'div',
      { class: 'top8-card' },
      el('p', { class: 'top8-band' }, band(top)),
      el(
        'p',
        { class: 'top8-empty' },
        top.period === 'year' ? t('top8.emptyYear', { year: String(top.year) }) : t('top8.emptyWindow'),
      ),
    );
  }
  return el(
    'div',
    { class: 'top8-card' },
    el('p', { class: 'top8-band' }, band(top)),
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

/** The card's content: the period, then the GMS-style card. */
export function top8Panel(props: Top8Props): HTMLElement[] {
  return [segmented('top8.period', 'top8-period', TOP8_PERIODS, props.top.period, props.onPeriod), gmsCard(props.top)];
}
