/**
 * Calendar dates without time or time zone, formatted YYYY-MM-DD.
 * ISO dates with four-digit years sort correctly as plain strings.
 */
export type PlainDate = string;

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function splitDate(value: string): [number, number, number] | null {
  const match = PLAIN_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return [year, month, day];
}

function formatDate(year: number, month: number, day: number): PlainDate {
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function isPlainDate(value: unknown): value is PlainDate {
  return typeof value === 'string' && splitDate(value) !== null;
}

export function compareDates(a: PlainDate, b: PlainDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Moves a date back by whole calendar months. A day that does not exist in
 * the target month is clamped to its last day, so 2026-03-31 minus one month
 * is 2026-02-28 (JavaScript's Date would overflow to 2026-03-03).
 */
export function subtractMonths(date: PlainDate, months: number): PlainDate {
  const parts = splitDate(date);
  if (!parts) throw new RangeError(`Invalid date: ${date}`);
  const [year, month, day] = parts;
  const monthIndex = year * 12 + (month - 1) - months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12 + 1;
  return formatDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}
