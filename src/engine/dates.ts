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

/** The day of the month of the second Tuesday. */
function secondTuesday(year: number, month: number): number {
  const weekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((2 - weekday + 7) % 7) + 7;
}

export interface RatingUpdate {
  /** The day PDGA publishes the update: the second Tuesday of the month. */
  update: PlainDate;
  /** The event report deadline for that update: the Sunday before it. */
  deadline: PlainDate;
}

/**
 * The next ratings update on or after `today`, and its report deadline, as
 * PDGA publishes them (https://www.pdga.com/faq/ratings/when-updated). The
 * second Tuesday is never before the 8th, so the deadline is in the same month.
 */
export function nextRatingUpdate(today: PlainDate): RatingUpdate {
  const parts = splitDate(today);
  if (!parts) throw new RangeError(`Invalid date: ${today}`);
  let [year, month] = parts;
  let day = secondTuesday(year, month);
  if (parts[2] > day) {
    [year, month] = month === 12 ? [year + 1, 1] : [year, month + 1];
    day = secondTuesday(year, month);
  }
  return { update: formatDate(year, month, day), deadline: formatDate(year, month, day - 2) };
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
