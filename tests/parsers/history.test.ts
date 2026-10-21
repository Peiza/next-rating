// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractRatingsHistory, normalizeRatingsHistory, parsePlayer, parseRatingsHistory } from '../../src/parsers';
import { historyTable, page, parseHtml, playerHeader } from './html';

const HISTORY = page(
  `${playerHeader()}${historyTable([
    ['8-Sep-2026', '950', '34'],
    ['11-Aug-2026', '947', '31'],
    ['14-Jul-2026', '951', ''],
  ])}`,
  'https://www.pdga.com/player/100001/history',
);

describe('ratings history page', () => {
  it('reads one raw row per update, as shown', () => {
    expect(extractRatingsHistory(parseHtml(HISTORY))).toEqual([
      { date: '8-Sep-2026', rating: '950', rounds: '34' },
      { date: '11-Aug-2026', rating: '947', rounds: '31' },
      { date: '14-Jul-2026', rating: '951', rounds: '' },
    ]);
  });

  it('gives the updates oldest first', () => {
    expect(parseRatingsHistory(parseHtml(HISTORY))).toEqual([
      { date: '2026-07-14', rating: 951, rounds: null },
      { date: '2026-08-11', rating: 947, rounds: 31 },
      { date: '2026-09-08', rating: 950, rounds: 34 },
    ]);
  });

  it('has the same player header as the other player pages', () => {
    expect(parsePlayer(parseHtml(HISTORY))).toMatchObject({ pdgaNumber: 100001, currentRating: 950 });
  });

  it('is empty without the history table', () => {
    expect(parseRatingsHistory(parseHtml(page(playerHeader())))).toEqual([]);
  });

  it('leaves out rows without a date or a rating', () => {
    expect(
      normalizeRatingsHistory([
        { date: 'soon', rating: '950', rounds: '3' },
        { date: '8-Sep-2026', rating: '', rounds: '3' },
        { date: '8-Sep-2026', rating: '3000', rounds: '3' },
        { date: '8-Sep-2026', rating: '950', rounds: 'x' },
      ]),
    ).toEqual([{ date: '2026-09-08', rating: 950, rounds: null }]);
  });

  it('rejects malformed rows', () => {
    expect(() => normalizeRatingsHistory('rows')).toThrow();
    expect(() => normalizeRatingsHistory([{ date: 5 }])).toThrow();
    expect(() => normalizeRatingsHistory(Array.from({ length: 5001 }, () => ({})))).toThrow();
  });
});
