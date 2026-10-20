import { isTopRound, topRounds, type PlainDate, type TopResult } from '../engine';
import type { ListedRound } from '../parsers';
import type { Model } from './model';
import type { TopPeriod } from './storage';

/*
 * The Top 8 card on the Rating tab, like the PDGA Global Masters Series
 * player card: the 8 highest rated rounds of a period. Pure, so it is tested
 * with synthetic data; the engine picks the rounds.
 */

export type { TopPeriod };

export interface TopEight {
  period: TopPeriod;
  /** The year of today, which a year period without a year follows. */
  currentYear: number;
  /** The calendar year shown, or null for the window or a custom range. */
  year: number | null;
  /**
   * The years to choose from, newest first: those with a round the Top 8
   * can take, the current year, and the chosen year.
   */
  years: number[];
  /** The prediction's window, with its anchor and fallback. Null without rated rounds. */
  window: { months: 12 | 24; start: PlainDate; end: PlainDate } | null;
  result: TopResult<ListedRound>;
}

function yearOf(date: PlainDate): number {
  return Number(date.slice(0, 4));
}

/** The years the period select offers, newest first. */
export function periodYears(model: Model, period: TopPeriod, today: PlainDate): number[] {
  const years = new Set([yearOf(today)]);
  for (const round of model.rounds) if (isTopRound(round)) years.add(yearOf(round.date));
  if (period.kind === 'year' && period.year !== null) years.add(period.year);
  return [...years].sort((a, b) => b - a);
}

/**
 * The Top 8 for a period. A calendar year runs from 1 January to 31
 * December, so the current one also counts unofficial rounds after the
 * report deadline. The window is exactly the prediction's, so those rounds
 * fall outside it, and a manual round can be its anchor while not being
 * listed. A custom range takes both dates as they are.
 */
export function topEight(model: Model, period: TopPeriod, today: PlainDate): TopEight {
  const currentYear = yearOf(today);
  const { windowMonths: months, windowStart: start, windowEnd: end } = model.prediction.stats;
  const window = months !== null && start !== null && end !== null ? { months, start, end } : null;
  const year = period.kind === 'year' ? (period.year ?? currentYear) : null;
  const range =
    year !== null
      ? { start: `${year}-01-01`, end: `${year}-12-31` }
      : period.kind === 'custom'
        ? { start: period.from, end: period.to }
        : window;
  // Without a window there is no rated round to list.
  const result = topRounds(range ? model.rounds : [], range?.start ?? today, range?.end ?? today);
  return { period, currentYear, year, years: periodYears(model, period, today), window, result };
}
