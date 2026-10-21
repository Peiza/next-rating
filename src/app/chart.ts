import { compareDates, subtractMonths, type PlainDate, type RoundStatus } from '../engine';
import type { ListedResult, Model } from './model';
import type { ChartPeriod } from './storage';

/*
 * What the rating chart shows, without drawing it: the rated rounds in the
 * chosen period as points, the prediction's window, the official and the
 * predicted rating across that window, and the axes' ticks. Pure, so the view only scales and
 * draws.
 */

export type { ChartPeriod };

/** The default period's length. */
export const RECENT_MONTHS = 24;

/** Where a round comes from, which the point's shape shows. */
export type PointKind = 'official' | 'unofficial' | 'own';

/**
 * What the next update does with a round, which the point's fill shows:
 * counts (filled), counts twice (filled with a ring), does not count because
 * of its date (hollow), or does not count because a rule or the user left it
 * out (hollow with a cross).
 */
export type PointMark = 'counts' | 'twice' | 'not' | 'ruled-out';

const MARKS: Record<RoundStatus, PointMark> = {
  included: 'counts',
  doubled: 'twice',
  dropped: 'ruled-out',
  excluded: 'ruled-out',
  'left-out': 'ruled-out',
  'outside-window': 'not',
  'after-deadline': 'not',
  dnf: 'not',
};

export interface ChartPoint {
  row: ListedResult;
  date: PlainDate;
  rating: number;
  kind: PointKind;
  mark: PointMark;
}

/** An x-axis tick on the first of a month; `year` when its label also names the year. */
export interface MonthTick {
  date: PlainDate;
  year: boolean;
}

export interface ChartData {
  period: ChartPeriod;
  /** The year of today, which a year period without a year follows. */
  currentYear: number;
  /** The calendar year shown, or null for another kind of period. */
  year: number | null;
  /** The years to choose from, newest first: those with a rated round, the current year and the chosen year. */
  years: number[];
  /** The prediction's window, with its anchor and fallback. Null without rated rounds. */
  window: { months: 12 | 24; start: PlainDate; end: PlainDate } | null;
  /** The x range, both ends inclusive. */
  from: PlainDate;
  to: PlainDate;
  /** The rated rounds in the period, oldest first. */
  points: ChartPoint[];
  /** The prediction's window within the period, shaded; null when they do not meet. */
  band: { from: PlainDate; to: PlainDate } | null;
  /**
   * The official rating, drawn as a line across the band; null when unknown
   * or without a band. Both lines are today's values, so they cover only the
   * window they come from.
   */
  official: number | null;
  /** The predicted rating, drawn like the official one; null without one or without a band. */
  predicted: number | null;
  /** Both lines are drawn and equal, so the value shows once. */
  same: boolean;
  /**
   * The ratings the y range must fit: the rounds and the lines drawn. Empty
   * without rounds. The view picks the ticks, since how many fit depends on
   * the size it draws at.
   */
  values: number[];
}

/** The y range, from tick to tick. */
export interface RatingAxis {
  min: number;
  max: number;
  ticks: number[];
}

/** Days since 1970-01-01, so dates can be placed on a line. */
export function dayNumber(date: PlainDate): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function yearOf(date: PlainDate): number {
  return Number(date.slice(0, 4));
}

function later(a: PlainDate, b: PlainDate): PlainDate {
  return compareDates(a, b) >= 0 ? a : b;
}

function earlier(a: PlainDate, b: PlainDate): PlainDate {
  return compareDates(a, b) <= 0 ? a : b;
}

function kindOf({ round }: ListedResult): PointKind {
  return round.source === 'manual' ? 'own' : round.source;
}

/** The years the period select offers, newest first. */
export function chartYears(model: Model, period: ChartPeriod, today: PlainDate): number[] {
  const years = new Set([yearOf(today)]);
  for (const round of model.rounds) if (round.rating !== null) years.add(yearOf(round.date));
  if (period.kind === 'year' && period.year !== null) years.add(period.year);
  return [...years].sort((a, b) => b - a);
}

/** Tick steps for ratings, smallest first. */
const RATING_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500];
/** At most this many gaps between rating ticks by default, as fit 200 px. */
const MAX_RATING_GAPS = 5;

/**
 * The y range: from the lowest to the highest value, widened to whole ticks
 * of the smallest step that needs at most `maxGaps` gaps. A single value gets
 * a step on each side. Null without values.
 */
export function ratingAxis(values: readonly number[], maxGaps = MAX_RATING_GAPS): RatingAxis | null {
  if (values.length === 0) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const step =
    RATING_STEPS.find((candidate) => Math.ceil(high / candidate) - Math.floor(low / candidate) <= maxGaps) ??
    RATING_STEPS[RATING_STEPS.length - 1]!;
  let min = Math.floor(low / step) * step;
  let max = Math.ceil(high / step) * step;
  if (min === max) {
    min -= step;
    max += step;
  }
  const ticks: number[] = [];
  for (let tick = min; tick <= max; tick += step) ticks.push(tick);
  return { min, max, ticks };
}

/** Month steps for the x-axis, smallest first; 12 and up fall on January. */
const MONTH_STEPS = [1, 2, 3, 6, 12, 24, 60];
/** At most this many labelled x ticks by default, as fit side by side at 320 px. */
const MAX_MONTH_TICKS = 5;

/**
 * Ticks on the first of the month, every 1, 2, 3, 6 or 12 months, at most
 * `maxTicks`. A label names the year on the first tick and on each January.
 * A range with fewer than two month starts gets its two ends instead.
 */
export function monthTicks(from: PlainDate, to: PlainDate, maxTicks = MAX_MONTH_TICKS): MonthTick[] {
  const starts: { year: number; month: number }[] = [];
  let year = yearOf(from);
  let month = Number(from.slice(5, 7));
  if (from.slice(8) !== '01') month += 1;
  for (; ; month += 1) {
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const date = `${year}-${String(month).padStart(2, '0')}-01`;
    if (compareDates(date, to) > 0) break;
    starts.push({ year, month });
  }
  if (starts.length < 2) return [from, to].map((date) => ({ date, year: true }));
  const step = MONTH_STEPS.find((candidate) => starts.filter(({ year, month }) => (year * 12 + month - 1) % candidate === 0).length <= maxTicks) ?? 60;
  const picked = starts.filter(({ year, month }) => (year * 12 + month - 1) % step === 0);
  return picked.map(({ year, month }, i) => ({
    date: `${year}-${String(month).padStart(2, '0')}-01`,
    year: step >= 12 || i === 0 || month === 1,
  }));
}

/** The dates a period covers, both inclusive. */
function rangeOf(model: Model, period: ChartPeriod, today: PlainDate, year: number | null): { from: PlainDate; to: PlainDate } {
  if (year !== null) return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (period.kind === 'custom') return { from: period.from, to: period.to };
  const { windowStart, windowEnd } = model.prediction.stats;
  if (period.kind === 'window' && windowStart !== null && windowEnd !== null) return { from: windowStart, to: windowEnd };
  // The last 24 months run to today, or to a planned round when one is later.
  const newest = model.rounds.reduce((date, round) => (round.rating !== null ? later(date, round.date) : date), today);
  return { from: subtractMonths(today, RECENT_MONTHS), to: newest };
}

/**
 * The chart for a period. The last 24 months end today, or at the newest
 * round when a planned one is later; a year runs from 1 January to 31
 * December; the window is exactly the prediction's; a custom range takes
 * both dates as they are.
 */
export function chartData(model: Model, period: ChartPeriod, today: PlainDate): ChartData {
  const currentYear = yearOf(today);
  const year = period.kind === 'year' ? (period.year ?? currentYear) : null;
  const { windowMonths: months, windowStart: start, windowEnd: end } = model.prediction.stats;
  const window = months !== null && start !== null && end !== null ? { months, start, end } : null;
  const { from, to } = rangeOf(model, period, today, year);
  const inRange = (date: PlainDate) => compareDates(date, from) >= 0 && compareDates(date, to) <= 0;

  const points = model.rows
    .filter(({ round }) => round.rating !== null && inRange(round.date))
    .map((row): ChartPoint => ({ row, date: row.round.date, rating: row.round.rating!, kind: kindOf(row), mark: MARKS[row.result.status] }))
    // Rows are newest first, with the rounds of one day in event order, which the stable sort keeps.
    .sort((a, b) => compareDates(a.date, b.date));

  const bandFrom = window ? later(window.start, from) : null;
  const bandTo = window ? earlier(window.end, to) : null;
  const band = bandFrom && bandTo && compareDates(bandFrom, bandTo) <= 0 ? { from: bandFrom, to: bandTo } : null;

  const official = band ? (model.player?.currentRating ?? null) : null;
  const predicted = band ? model.prediction.rating : null;
  const values = points.map((point) => point.rating);
  // The lines only matter next to rounds; on an empty period there is nothing to compare them with.
  if (values.length > 0) for (const line of [official, predicted]) if (line !== null) values.push(line);

  return {
    period,
    currentYear,
    year,
    years: chartYears(model, period, today),
    window,
    from,
    to,
    points,
    band,
    official,
    predicted,
    same: official !== null && official === predicted,
    values,
  };
}
