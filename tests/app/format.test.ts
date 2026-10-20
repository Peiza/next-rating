import { describe, expect, it } from 'vitest';
import { formatAge, formatAverage, formatChange, formatDate, formatEffect, formatRating } from '../../src/app/format';

describe('formatting', () => {
  it('formats dates in the locale', () => {
    expect(formatDate('2026-08-06', 'sv-SE')).toBe('2026-08-06');
    expect(formatDate('2026-08-06', 'en-US')).toBe('08/06/2026');
    expect(formatDate('2026-08-06', 'en-GB')).toBe('06/08/2026');
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
