import { compareDates, isPlainDate, subtractMonths, TOP_COUNT, type PlainDate } from '../../engine';
import { t, type MessageKey } from '../../i18n';
import type { ListedRound } from '../../parsers';
import { el } from '../dom';
import { formatDate, formatRating } from '../format';
import type { TopEight, TopPeriod } from '../top8';
import { eventUrl } from './pdga';

/*
 * The content of the Top 8 card on the Rating tab: the period, then a card
 * laid out like the PDGA Global Masters Series player card in the app's own
 * themes, with Sum, Average and High, then the rounds highest first.
 */

/** PDGA's page about the Global Masters Series, which the Top 8 follows. */
export const GMS_URL = 'https://www.pdga.com/global-masters-series';

export const TOP8_PERIOD_ID = 'top8-period';
const FROM_ID = 'top8-from';
const TO_ID = 'top8-to';
const RANGE_STATUS_ID = 'top8-range-status';

export interface Top8Props {
  top: TopEight;
  /** Today, which ends a custom range when one is first picked. */
  today: PlainDate;
  onPeriod: (period: TopPeriod) => void;
}

/** The select's value for a period: "year:2026", "window" or "custom". */
function periodValue({ period, year }: TopEight): string {
  return period.kind === 'year' ? `year:${year}` : period.kind;
}

/** The window option names its length and dates, so the line below does not need to. */
function windowLabel(window: TopEight['window']): string {
  if (!window) return t('top8.window');
  return t('top8.windowOption', {
    months: t('stats.windowMonths', { count: window.months }),
    start: formatDate(window.start),
    end: formatDate(window.end),
  });
}

/**
 * One select: each year (newest first), the rating window and a custom
 * range. Picking the current year stores no year, so it follows New Year.
 */
function periodSelect({ top, today, onPeriod }: Top8Props): HTMLElement {
  const value = periodValue(top);
  const option = (optionValue: string, label: string) => el('option', { value: optionValue, selected: optionValue === value }, label);
  const change = (event: Event) => {
    const picked = (event.target as HTMLSelectElement).value;
    if (picked === 'window') onPeriod({ kind: 'window' });
    else if (picked === 'custom') onPeriod({ kind: 'custom', from: subtractMonths(today, 12), to: today });
    else {
      const year = Number(picked.slice('year:'.length));
      onPeriod({ kind: 'year', year: year === top.currentYear ? null : year });
    }
  };
  return el(
    'div',
    { class: 'field' },
    el('label', { for: TOP8_PERIOD_ID, class: 'label' }, t('top8.period')),
    el(
      'select',
      { id: TOP8_PERIOD_ID, class: 'input', onchange: change },
      ...top.years.map((year) => option(`year:${year}`, String(year))),
      option('window', windowLabel(top.window)),
      option('custom', t('top8.custom')),
    ),
  );
}

/** From and to dates, both inclusive. A change counts only when both are dates and from comes first. */
function customRange(period: { from: PlainDate; to: PlainDate }, onPeriod: Top8Props['onPeriod']): HTMLElement {
  const status = el('p', { id: RANGE_STATUS_ID, class: 'status', role: 'status' });
  const change = (event: Event) => {
    for (const input of [from, to]) input.removeAttribute('aria-invalid');
    const [start, end] = [from.value, to.value];
    const missing = [from, to].find((input) => !isPlainDate(input.value));
    if (missing || compareDates(start, end) > 0) {
      (missing ?? (event.target as HTMLInputElement)).setAttribute('aria-invalid', 'true');
      status.className = 'status error';
      status.textContent = t(missing ? 'top8.rangeMissing' : 'top8.rangeOrder');
      return;
    }
    onPeriod({ kind: 'custom', from: start, to: end });
  };
  const input = (id: string, value: PlainDate) =>
    el('input', { id, class: 'input', type: 'date', value, 'aria-describedby': RANGE_STATUS_ID, onchange: change });
  const from = input(FROM_ID, period.from);
  const to = input(TO_ID, period.to);
  return el(
    'div',
    { class: 'top8-range' },
    el('div', { class: 'field' }, el('label', { for: FROM_ID, class: 'label' }, t('top8.from')), from),
    el('div', { class: 'field' }, el('label', { for: TO_ID, class: 'label' }, t('top8.to')), to),
    status,
  );
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

/** The period as the closed card names it: the year, the rating window, or the custom dates. */
function periodLabel({ period, year }: TopEight): string {
  if (period.kind === 'custom') return t('top8.range', { from: formatDate(period.from), to: formatDate(period.to) });
  return year !== null ? String(year) : t('top8.window');
}

/**
 * One line for the closed card, following the chosen period: "Average 1014
 * · 2026", with fewer than 8 rounds "Average 1003 · 5 of 8 · 2026".
 */
export function top8Teaser(top: TopEight): string {
  const { average, found } = top.result;
  const period = periodLabel(top);
  if (average === null) return t('top8.teaserEmpty', { period });
  if (found < TOP_COUNT) {
    return t('top8.teaserFew', { average: formatRating(average), count: found, total: TOP_COUNT, period });
  }
  return t('top8.teaser', { average: formatRating(average), period });
}

/** The card's content: the period (with its dates for a custom range), then the GMS-style card. */
export function top8Panel(props: Top8Props): HTMLElement[] {
  const { period } = props.top;
  return [
    periodSelect(props),
    ...(period.kind === 'custom' ? [customRange(period, props.onPeriod)] : []),
    gmsCard(props.top),
  ];
}
