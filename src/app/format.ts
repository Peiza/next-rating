import type { PlainDate } from '../engine/dates';

/*
 * Dates and numbers follow the device locale, also when the user picks
 * another UI language. Ratings never get a thousands separator.
 */

export function deviceLocale(): string {
  const tag = (typeof navigator !== 'undefined' && (navigator.languages?.[0] ?? navigator.language)) || 'en';
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? 'en';
  } catch {
    return 'en';
  }
}

/** Formats a calendar date, "2026-08-06" in Swedish. UTC keeps it from shifting a day. */
export function formatDate(date: PlainDate, locale = deviceLocale()): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** A whole rating, such as "1024". */
export function formatRating(rating: number, locale = deviceLocale()): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: false }).format(rating);
}

/** An average with two decimals, "976,45" in Swedish. */
export function formatAverage(value: number, locale = deviceLocale()): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
}

/** A rating change with its sign, "+12" or "−3" with a true minus sign. */
export function formatChange(change: number, locale = deviceLocale()): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: false,
    signDisplay: 'exceptZero',
  })
    .format(change)
    .replace('-', '−');
}
