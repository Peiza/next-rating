import type { PlainDate } from '../engine/dates';
import { activeLanguage } from '../i18n';

/*
 * Dates follow the app's language with the device's region, so month names
 * are in the app's language while the order of a numeric date follows the
 * device: an English app on a Swedish phone shows "Aug" and 2026-08-06.
 * Numbers follow the device locale (976,45 on a Swedish phone), and ratings
 * never get a thousands separator.
 */

export function deviceLocale(): string {
  const tag = (typeof navigator !== 'undefined' && (navigator.languages?.[0] ?? navigator.language)) || 'en';
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? 'en';
  } catch {
    return 'en';
  }
}

/** The app's language with the device's region, such as "en-SE"; the language alone without a region. */
export function dateLocale(language = activeLanguage(), device = deviceLocale()): string {
  try {
    const { region } = new Intl.Locale(device).maximize();
    return region ? new Intl.Locale(language, { region }).toString() : language;
  } catch {
    return language;
  }
}

/** Formats a calendar date, "2026-08-06" in Swedish. UTC keeps it from shifting a day. */
export function formatDate(date: PlainDate, locale = dateLocale()): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** A day and month without the year, "10 Nov" in British English and "10 nov." in Swedish. */
export function formatDayMonth(date: PlainDate, locale = dateLocale()): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/** A month's short name, "Oct" in English and "okt." in Swedish, for the chart's axis. */
export function formatMonth(date: PlainDate, locale = dateLocale()): string {
  const [year, month] = date.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** A point in time, such as an import timestamp, in the device's time zone. */
export function formatDateTime(timestamp: string, locale = dateLocale()): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp));
}

/**
 * How long ago a timestamp was, such as "3 days ago" or "yesterday". These
 * are words, so they follow the app's language rather than the device locale.
 */
export function formatAge(timestamp: string, now = new Date(), language = activeLanguage()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(timestamp)) / 60_000));
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  if (minutes < 1) return format.format(0, 'second');
  if (minutes < 60) return format.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format.format(-hours, 'hour');
  return format.format(-Math.round(hours / 24), 'day');
}

/** Today's date in the device's time zone. */
export function today(now = new Date()): PlainDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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

/** A round's effect on the prediction, with one decimal and its sign: "+1.4", "−0,6" in Swedish. */
export function formatEffect(effect: number, locale = deviceLocale()): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: false,
    signDisplay: 'exceptZero',
  })
    .format(effect)
    .replace('-', '−');
}
