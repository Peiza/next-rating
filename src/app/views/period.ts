import { compareDates, isPlainDate, subtractMonths, type PlainDate } from '../../engine';
import { t } from '../../i18n';
import { el } from '../dom';
import { dateInput } from './date-input';
import { formatDate } from '../format';
import type { ChartPeriod } from '../storage';

/*
 * The period select the Top 8 and the chart share: each year (newest
 * first), the rating window and a custom range, and in the chart first the
 * last 24 months. A custom range adds from and to dates.
 */

export interface PeriodProps {
  /** The ids start with this, such as "top8" for "top8-period". */
  id: string;
  period: ChartPeriod;
  /** The calendar year shown, or null for another kind of period. */
  year: number | null;
  /** A year period without a year follows this one. */
  currentYear: number;
  years: readonly number[];
  window: { months: 12 | 24; start: PlainDate; end: PlainDate } | null;
  /** Today, which ends a custom range when one is first picked. */
  today: PlainDate;
  /** Offers the last 24 months first. */
  recent?: boolean;
  /** Names the window's dates under the select while it is picked, for a card without a chart legend that does. */
  windowDates?: boolean;
  onPeriod: (period: ChartPeriod) => void;
}

/** The select's id, so focus can return to it. */
export function periodId(id: string): string {
  return `${id}-period`;
}

/** The select's value for a period: "year:2026", "recent", "window" or "custom". */
function periodValue(period: ChartPeriod, year: number | null): string {
  return period.kind === 'year' ? `year:${year}` : period.kind;
}

/** The window option names its length; its dates would not fit the select on a phone. */
function windowLabel(window: PeriodProps['window']): string {
  if (!window) return t('period.window');
  return t('period.windowOption', { months: t('stats.windowMonths', { count: window.months }) });
}

/** Picking the current year stores no year, so it follows New Year. */
function periodSelect({ id, period, year, currentYear, years, window, today, recent, windowDates, onPeriod }: PeriodProps): HTMLElement {
  const value = periodValue(period, year);
  const datesId = `${id}-window-dates`;
  const dates = windowDates && period.kind === 'window' && window;
  const option = (optionValue: string, label: string) => el('option', { value: optionValue, selected: optionValue === value }, label);
  const change = (event: Event) => {
    const picked = (event.target as HTMLSelectElement).value;
    if (picked === 'recent') onPeriod({ kind: 'recent' });
    else if (picked === 'window') onPeriod({ kind: 'window' });
    else if (picked === 'custom') onPeriod({ kind: 'custom', from: subtractMonths(today, 12), to: today });
    else {
      const pickedYear = Number(picked.slice('year:'.length));
      onPeriod({ kind: 'year', year: pickedYear === currentYear ? null : pickedYear });
    }
  };
  return el(
    'div',
    { class: 'field' },
    el('label', { for: periodId(id), class: 'label' }, t('period.label')),
    el(
      'select',
      { id: periodId(id), class: 'input', 'aria-describedby': dates ? datesId : undefined, onchange: change },
      recent && option('recent', t('period.recent')),
      ...years.map((each) => option(`year:${each}`, String(each))),
      option('window', windowLabel(window)),
      option('custom', t('period.custom')),
    ),
    dates && el('p', { id: datesId, class: 'hint' }, t('stats.windowRange', { start: formatDate(dates.start), end: formatDate(dates.end) })),
  );
}

/** From and to dates, both inclusive. A change counts only when both are dates and from comes first. */
function customRange(id: string, period: { from: PlainDate; to: PlainDate }, onPeriod: PeriodProps['onPeriod']): HTMLElement {
  const statusId = `${id}-range-status`;
  const status = el('p', { id: statusId, class: 'status', role: 'status' });
  const change = (event: Event) => {
    for (const input of [from, to]) input.removeAttribute('aria-invalid');
    const [start, end] = [from.value, to.value];
    const missing = [from, to].find((input) => !isPlainDate(input.value));
    if (missing || compareDates(start, end) > 0) {
      (missing ?? (event.target as HTMLInputElement)).setAttribute('aria-invalid', 'true');
      status.className = 'status error';
      status.textContent = t(missing ? 'period.rangeMissing' : 'period.rangeOrder');
      return;
    }
    onPeriod({ kind: 'custom', from: start, to: end });
  };
  const input = (inputId: string, value: PlainDate) =>
    el('input', { id: inputId, class: 'input', type: 'date', value, 'aria-describedby': statusId, onchange: change });
  const from = input(`${id}-from`, period.from);
  const to = input(`${id}-to`, period.to);
  return el(
    'div',
    { class: 'period-range' },
    el('div', { class: 'field' }, el('label', { for: from.id, class: 'label' }, t('period.from')), dateInput(from)),
    el('div', { class: 'field' }, el('label', { for: to.id, class: 'label' }, t('period.to')), dateInput(to)),
    status,
  );
}

/** The select, and for a custom range its dates. */
export function periodControls(props: PeriodProps): HTMLElement[] {
  const { period } = props;
  return [periodSelect(props), ...(period.kind === 'custom' ? [customRange(props.id, period, props.onPeriod)] : [])];
}

/** The period as a closed card names it: the last 24 months, the year, the rating window, or the custom dates. */
export function periodLabel(period: ChartPeriod, year: number | null): string {
  if (period.kind === 'custom') return t('period.range', { from: formatDate(period.from), to: formatDate(period.to) });
  if (period.kind === 'recent') return t('period.recent');
  return year !== null ? String(year) : t('period.window');
}
