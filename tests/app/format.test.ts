import { describe, expect, it } from 'vitest';
import { formatAverage, formatChange, formatDate, formatRating } from '../../src/app/format';

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
});
