import { topRounds, type PlainDate, type TopResult } from '../engine';
import type { ListedRound } from '../parsers';
import type { Model } from './model';

/*
 * The Top 8 panel on the Rating tab, like the PDGA Global Masters Series
 * player card: the 8 highest rated rounds of a period. Pure, so it is tested
 * with synthetic data; the engine picks the rounds.
 */

/** The calendar year of today (the default), or the window the prediction uses. */
export type TopPeriod = 'year' | 'window';

export interface TopEight {
  period: TopPeriod;
  /** The calendar year of today. */
  year: number;
  /** The prediction's window, with its anchor and fallback. Null without rated rounds. */
  window: { months: 12 | 24; start: PlainDate; end: PlainDate } | null;
  result: TopResult<ListedRound>;
}

/**
 * The Top 8 for a period. The calendar year follows today, so it also
 * counts unofficial rounds after the report deadline. The window is exactly
 * the prediction's, so those rounds fall outside it, and a manual round can
 * be its anchor while not being listed.
 */
export function topEight(model: Model, period: TopPeriod, today: PlainDate): TopEight {
  const year = today.slice(0, 4);
  const { windowMonths: months, windowStart: start, windowEnd: end } = model.prediction.stats;
  const window = months !== null && start !== null && end !== null ? { months, start, end } : null;
  const range = period === 'year' ? { start: `${year}-01-01`, end: `${year}-12-31` } : window;
  // Without a window there is no rated round to list.
  const result = topRounds(range ? model.rounds : [], range?.start ?? today, range?.end ?? today);
  return { period, year: Number(year), window, result };
}
