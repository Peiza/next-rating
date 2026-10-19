import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  ParseError,
  RANGES,
  asList,
  asRecord,
  asText,
  parseInteger,
  parsePdgaDate,
  toPdgaDate,
} from '../../src/parsers/values';

describe('parsePdgaDate', () => {
  it('reads a single day, with or without a leading zero', () => {
    expect(parsePdgaDate('6-Aug-2026')).toBe('2026-08-06');
    expect(parsePdgaDate('09-May-2026')).toBe('2026-05-09');
  });

  it('uses the last day of a range', () => {
    expect(parsePdgaDate('1-Aug to 2-Aug-2026')).toBe('2026-08-02');
    expect(parsePdgaDate('2-Jul to 25-Aug-2024')).toBe('2024-08-25');
  });

  it('uses the last day of a range across new year', () => {
    expect(parsePdgaDate('30-Dec-2025 to 02-Jan-2026')).toBe('2026-01-02');
  });

  it('finds the date inside surrounding text', () => {
    expect(parsePdgaDate('Date: 22-Aug to 23-Aug-2026')).toBe('2026-08-23');
    expect(parsePdgaDate('(as of 08-Sep-2026)')).toBe('2026-09-08');
  });

  it('ignores the case of the month', () => {
    expect(parsePdgaDate('6-AUG-2026')).toBe('2026-08-06');
  });

  it('rejects unknown months, impossible days and other text', () => {
    expect(parsePdgaDate('6-Foo-2026')).toBeNull();
    expect(parsePdgaDate('30-Feb-2026')).toBeNull();
    expect(parsePdgaDate('2026-08-06')).toBeNull();
    expect(parsePdgaDate('')).toBeNull();
  });
});

describe('toPdgaDate', () => {
  it('writes dates the way pdga.com does, so they read back', () => {
    expect(toPdgaDate('2026-08-06')).toBe('6-Aug-2026');
    expect(toPdgaDate('2025-12-31')).toBe('31-Dec-2025');
    for (const date of ['2026-01-01', '2024-02-29', '2026-09-30']) expect(parsePdgaDate(toPdgaDate(date))).toBe(date);
  });
});

describe('parseInteger', () => {
  it('reads whole numbers within the range', () => {
    expect(parseInteger('1024', RANGES.rating)).toBe(1024);
    expect(parseInteger('0', RANGES.rating)).toBe(0);
  });

  it('rejects numbers out of range and anything that is not a whole number', () => {
    expect(parseInteger('2001', RANGES.rating)).toBeNull();
    expect(parseInteger('-5', RANGES.rating)).toBeNull();
    expect(parseInteger('9.5', RANGES.rating)).toBeNull();
    expect(parseInteger('1,024', RANGES.rating)).toBeNull();
    expect(parseInteger('1e3', RANGES.rating)).toBeNull();
    expect(parseInteger('', RANGES.rating)).toBeNull();
    expect(parseInteger('9'.repeat(20), RANGES.id)).toBeNull();
  });
});

describe('validators', () => {
  const codeOf = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      return error instanceof ParseError ? error.code : 'other';
    }
    return null;
  };

  it('accepts records only', () => {
    expect(asRecord({ a: 1 }, 'x')).toEqual({ a: 1 });
    expect(codeOf(() => asRecord(null, 'x'))).toBe('malformed');
    expect(codeOf(() => asRecord([], 'x'))).toBe('malformed');
    expect(codeOf(() => asRecord('text', 'x'))).toBe('malformed');
  });

  it('accepts lists up to the limit', () => {
    expect(asList([1, 2], 2, 'x')).toEqual([1, 2]);
    expect(codeOf(() => asList([1, 2, 3], 2, 'x'))).toBe('too-large');
    expect(codeOf(() => asList({ length: 1 }, 2, 'x'))).toBe('malformed');
  });

  it('accepts text up to the limit, trimmed, and reads a missing value as empty', () => {
    expect(asText('  a \n b ', 'x')).toBe('a b');
    expect(asText(undefined, 'x')).toBe('');
    expect(codeOf(() => asText(5, 'x'))).toBe('malformed');
    expect(codeOf(() => asText(null, 'x'))).toBe('malformed');
    expect(codeOf(() => asText('a'.repeat(LIMITS.text + 1), 'x'))).toBe('too-large');
  });
});
