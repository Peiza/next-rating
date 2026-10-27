// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { detectPage, extractCareer, extractWins, normalizeCareer, normalizeWins } from '../../src/parsers';
import { careerLines, page, parseHtml, playerHeader, winsTable } from './html';

/* All names, numbers and results here are invented. */

const URL = 'https://www.pdga.com/player/100001/wins';
const WINS = page(
  `${playerHeader('Test Player', '100001', '950', careerLines('53', '2'))}${winsTable([
    ['900001', '01-Aug-2024'],
    ['900002', '17-Jul to 18-Jul-2024'],
  ])}`,
  URL,
);

describe('career wins', () => {
  it('is a page kind of its own', () => {
    expect(detectPage(parseHtml(WINS), URL)).toBe('wins');
    expect(detectPage(parseHtml(WINS), `${URL}/`)).toBe('wins');
  });

  it('reads the career lines of the player info', () => {
    const doc = parseHtml(WINS);
    expect(extractCareer(doc)).toEqual({ events: '53', wins: '2' });
    expect(normalizeCareer(extractCareer(doc))).toEqual({ events: 53, wins: 2 });
  });

  it('counts no wins when only the events line is there', () => {
    const doc = parseHtml(page(playerHeader('Test Player', '100001', '950', careerLines('7', null))));
    expect(normalizeCareer(extractCareer(doc))).toEqual({ events: 7, wins: 0 });
  });

  it('reads nothing without career lines', () => {
    expect(extractCareer(parseHtml(page(playerHeader())))).toBeNull();
    expect(normalizeCareer({ events: '', wins: '' })).toEqual({ events: null, wins: null });
  });

  it('reads one row per win, not the sticky header copy', () => {
    const raw = extractWins(parseHtml(WINS));
    expect(raw).toEqual([
      { eventId: '900001', name: 'Example Open', division: 'Mixed Pro Open', tier: 'C', date: '01-Aug-2024' },
      { eventId: '900002', name: 'Example Open', division: 'Mixed Pro Open', tier: 'C', date: '17-Jul to 18-Jul-2024' },
    ]);
    expect(normalizeWins(raw).map(({ eventId, date }) => [eventId, date])).toEqual([
      [900001, '2024-08-01'],
      [900002, '2024-07-18'],
    ]);
  });

  it('leaves out rows without a date and rejects malformed data', () => {
    expect(normalizeWins([{ eventId: '1', name: 'A', division: '', tier: '', date: '' }])).toEqual([]);
    expect(() => normalizeWins([{ eventId: 1, date: '01-Aug-2024' }])).toThrow();
    expect(() => normalizeCareer('53')).toThrow();
  });
});
