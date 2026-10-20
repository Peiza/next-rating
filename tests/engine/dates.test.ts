import { describe, expect, it } from 'vitest';
import { compareDates, daysInMonth, isPlainDate, nextRatingUpdate, subtractMonths } from '../../src/engine/dates';

describe('isPlainDate', () => {
  it('accepts valid calendar dates', () => {
    expect(isPlainDate('2026-08-27')).toBe(true);
    expect(isPlainDate('2028-02-29')).toBe(true);
  });

  it('rejects malformed or impossible dates', () => {
    for (const value of ['2026-8-27', '27-Aug-2026', '2026-02-29', '2026-13-01', '2026-04-31', '', 20260827]) {
      expect(isPlainDate(value)).toBe(false);
    }
  });
});

describe('daysInMonth', () => {
  it('handles leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});

describe('subtractMonths', () => {
  it('moves back whole calendar months', () => {
    expect(subtractMonths('2026-08-27', 12)).toBe('2025-08-27');
    expect(subtractMonths('2026-01-15', 1)).toBe('2025-12-15');
    expect(subtractMonths('2026-08-27', 24)).toBe('2024-08-27');
  });

  it('clamps to the last day of a shorter month', () => {
    expect(subtractMonths('2026-03-31', 1)).toBe('2026-02-28');
    expect(subtractMonths('2028-03-31', 1)).toBe('2028-02-29');
    expect(subtractMonths('2028-02-29', 12)).toBe('2027-02-28');
    expect(subtractMonths('2026-05-31', 1)).toBe('2026-04-30');
  });

  it('rejects an invalid date', () => {
    expect(() => subtractMonths('2026-02-30', 1)).toThrow(RangeError);
  });
});

describe('nextRatingUpdate', () => {
  it("is this month's second Tuesday until it has passed, with the Sunday before as deadline", () => {
    // November 2026 starts on a Sunday, so its Tuesdays are the 3rd and the 10th.
    expect(nextRatingUpdate('2026-11-01')).toEqual({ update: '2026-11-10', deadline: '2026-11-08' });
    expect(nextRatingUpdate('2026-11-09')).toEqual({ update: '2026-11-10', deadline: '2026-11-08' });
  });

  it('counts the update day itself', () => {
    expect(nextRatingUpdate('2026-11-10').update).toBe('2026-11-10');
  });

  it('moves to next month once the update has passed', () => {
    expect(nextRatingUpdate('2026-10-20')).toEqual({ update: '2026-11-10', deadline: '2026-11-08' });
    expect(nextRatingUpdate('2026-11-11').update).toBe('2026-12-08');
  });

  it('crosses into the next year', () => {
    expect(nextRatingUpdate('2026-12-09')).toEqual({ update: '2027-01-12', deadline: '2027-01-10' });
  });

  it('moves to next month on update day once the official rating is dated that day', () => {
    expect(nextRatingUpdate('2026-11-10', '2026-11-10')).toEqual({ update: '2026-12-08', deadline: '2026-12-06' });
    expect(nextRatingUpdate('2026-11-10', '2026-10-13').update).toBe('2026-11-10');
    expect(nextRatingUpdate('2026-11-10', null).update).toBe('2026-11-10');
    expect(nextRatingUpdate('2026-11-01', '2026-10-13').update).toBe('2026-11-10');
  });

  it('handles a month that starts on a Tuesday', () => {
    // September 2026 starts on a Tuesday.
    expect(nextRatingUpdate('2026-09-01')).toEqual({ update: '2026-09-08', deadline: '2026-09-06' });
  });

  it('rejects an invalid date', () => {
    expect(() => nextRatingUpdate('2026-02-30')).toThrow(RangeError);
  });
});

describe('compareDates', () => {
  it('orders dates chronologically', () => {
    expect(compareDates('2025-12-31', '2026-01-01')).toBeLessThan(0);
    expect(compareDates('2026-01-01', '2025-12-31')).toBeGreaterThan(0);
    expect(compareDates('2026-01-01', '2026-01-01')).toBe(0);
  });
});
