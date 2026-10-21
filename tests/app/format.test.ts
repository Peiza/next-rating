import { afterEach, describe, expect, it } from 'vitest';
import {
  dateLocale,
  formatAge,
  formatAverage,
  formatChange,
  formatCount,
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatEffect,
  formatMonth,
  formatRating,
  setDateOrder,
} from '../../src/app/format';

describe('formatting', () => {
  it('formats dates in the locale', () => {
    expect(formatDate('2026-08-06', 'sv-SE')).toBe('2026-08-06');
    expect(formatDate('2026-08-06', 'en-US')).toBe('08/06/2026');
    expect(formatDate('2026-08-06', 'en-GB')).toBe('06/08/2026');
  });

  it("formats dates in the app's language with the device's region", () => {
    expect(dateLocale('en', 'sv-SE')).toBe('en-SE');
    expect(dateLocale('sv', 'en-US')).toBe('sv-US');
    // A device language without a region gets its likely one.
    expect(dateLocale('en', 'sv')).toBe('en-SE');
    // An English app on a Swedish phone: English month names, the Swedish date order.
    expect(formatMonth('2026-07-01', dateLocale('en', 'sv-SE'))).toBe('Jul');
    expect(formatDayMonth('2026-08-06', dateLocale('en', 'sv-SE'))).toBe('6 Aug');
    expect(formatDate('2026-08-06', dateLocale('en', 'sv-SE'))).toBe('2026-08-06');
    expect(formatMonth('2026-08-01', dateLocale('sv', 'en-US'))).toBe('aug.');
    expect(dateLocale('en', 'not a tag')).toBe('en');
  });

  it('formats a day and month without the year', () => {
    expect(formatDayMonth('2026-11-10', 'en-GB')).toBe('10 Nov');
    expect(formatDayMonth('2026-11-10', 'en-US')).toBe('Nov 10');
    expect(formatDayMonth('2026-11-10', 'sv-SE')).toBe('10 nov.');
    expect(formatDayMonth('2027-01-01', 'sv-SE')).toBe('1 jan.');
  });

  it('keeps the calendar day at the edges of the year', () => {
    expect(formatDate('2026-01-01', 'sv-SE')).toBe('2026-01-01');
    expect(formatDate('2025-12-31', 'sv-SE')).toBe('2025-12-31');
  });

  it('never groups the thousands of a rating', () => {
    expect(formatRating(1024, 'sv-SE')).toBe('1024');
    expect(formatRating(1024, 'en-US')).toBe('1024');
    expect(formatRating(1024, 'de-DE')).toBe('1024');
  });

  it('groups the thousands of a count as on the device', () => {
    expect(formatCount(4171, 'sv-SE')).toBe('4 171');
    expect(formatCount(4171, 'en-US')).toBe('4,171');
    expect(formatCount(4171, 'de-DE')).toBe('4.171');
  });

  it('formats averages with two decimals', () => {
    expect(formatAverage(976.45, 'sv-SE')).toBe('976,45');
    expect(formatAverage(976.45, 'en-US')).toBe('976.45');
    expect(formatAverage(1001.5, 'sv-SE')).toBe('1001,50');
  });

  it('signs a change with plus or a true minus sign', () => {
    expect(formatChange(12, 'en-US')).toBe('+12');
    expect(formatChange(-3, 'en-US')).toBe('−3');
    expect(formatChange(-3, 'sv-SE')).toBe('−3');
    expect(formatChange(0, 'en-US')).toBe('0');
  });

  it('shows an effect with one decimal and its sign', () => {
    expect(formatEffect(1.44, 'en-US')).toBe('+1.4');
    expect(formatEffect(-0.6, 'sv-SE')).toBe('−0,6');
    expect(formatEffect(0, 'en-US')).toBe('0.0');
    // Too small to show gets no sign.
    expect(formatEffect(-0.04, 'en-US')).toBe('0.0');
  });
});

describe('a date format from Settings', () => {
  afterEach(() => setDateOrder(null));

  it('puts the year, day or month first, whatever the locale', () => {
    for (const locale of ['en-US', 'sv-SE']) {
      expect(formatDate('2026-08-06', locale, 'year')).toBe('2026-08-06');
      expect(formatDate('2026-08-06', locale, 'day')).toBe('06/08/2026');
      expect(formatDate('2026-08-06', locale, 'month')).toBe('08/06/2026');
    }
  });

  it('applies to every date once set, and Automatic follows the locale again', () => {
    setDateOrder('day');
    expect(formatDate('2026-08-06', 'en-US')).toBe('06/08/2026');
    setDateOrder(null);
    expect(formatDate('2026-08-06', 'en-US')).toBe('08/06/2026');
  });

  it('puts the month name first only for Month first, in the language', () => {
    expect(formatDayMonth('2026-11-10', 'en-US', 'day')).toBe('10 Nov');
    expect(formatDayMonth('2026-11-10', 'en-US', 'year')).toBe('10 Nov');
    expect(formatDayMonth('2026-11-10', 'en-GB', 'month')).toBe('Nov 10');
    expect(formatDayMonth('2026-11-10', 'sv-SE', 'month')).toBe('nov. 10');
    expect(formatDayMonth('2026-11-10', 'sv-SE', 'day')).toBe('10 nov.');
  });

  it('formats an import time with the date in that order', () => {
    const at = new Date(2026, 9, 21, 15, 4).toISOString();
    expect(formatDateTime(at, 'sv-SE', 'day')).toBe('21/10/2026 15:04');
    expect(formatDateTime(at, 'sv-SE', 'month')).toBe('10/21/2026 15:04');
  });

  it('uses a 24-hour clock with Year first and Day first, also in US English', () => {
    const afternoon = new Date(2026, 9, 21, 15, 4).toISOString();
    expect(formatDateTime(afternoon, 'en-US', 'year')).toBe('2026-10-21 15:04');
    expect(formatDateTime(afternoon, 'en-US', 'day')).toBe('21/10/2026 15:04');
    // Midnight is 00, not 24.
    expect(formatDateTime(new Date(2026, 9, 21, 0, 5).toISOString(), 'en-US', 'year')).toBe('2026-10-21 00:05');
  });

  it('keeps AM and PM in US English with Month first and Automatic', () => {
    const afternoon = new Date(2026, 9, 21, 15, 4).toISOString();
    // ICU puts a narrow no-break space before PM; any space matches.
    expect(formatDateTime(afternoon, 'en-US', 'month')).toMatch(/^10\/21\/2026 3:04\sPM$/);
    expect(formatDateTime(afternoon, 'en-US', null)).toMatch(/^10\/21\/26, 3:04\sPM$/);
    expect(formatDateTime(afternoon, 'sv-SE', null)).toBe('2026-10-21 15:04');
  });
});

describe('formatAge', () => {
  const now = new Date('2026-10-20T12:00:00.000Z');

  it('says how long ago, in the app language', () => {
    expect(formatAge('2026-10-20T11:59:50.000Z', now, 'en')).toBe('now');
    expect(formatAge('2026-10-20T11:15:00.000Z', now, 'en')).toBe('45 minutes ago');
    expect(formatAge('2026-10-20T07:00:00.000Z', now, 'en')).toBe('5 hours ago');
    expect(formatAge('2026-10-19T10:00:00.000Z', now, 'en')).toBe('yesterday');
    expect(formatAge('2026-10-10T12:00:00.000Z', now, 'en')).toBe('10 days ago');
    expect(formatAge('2026-10-17T12:00:00.000Z', now, 'sv')).toBe('för 3 dagar sedan');
  });

  it('never says a time in the future', () => {
    expect(formatAge('2026-10-21T12:00:00.000Z', now, 'en')).toBe('now');
  });
});
