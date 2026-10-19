// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractEvent, normalizeEvent, parseEvent } from '../../src/parsers/event';
import { ParseError } from '../../src/parsers/values';
import { eventDivision, eventPage, eventRow, layoutTooltip, parseHtml } from './html';

const tip = (division: string, round: number) => `#layout-details-900001-${division}-round-${round}`;

describe('event results', () => {
  it('reads event, divisions, hole counts and every round of every row', () => {
    const doc = parseHtml(
      eventPage({
        body:
          layoutTooltip(tip('MPO', 1).slice(1), 18) +
          layoutTooltip(tip('MPO', 2).slice(1), 9) +
          eventDivision(
            'MPO',
            [tip('MPO', 1), tip('MPO', 2)],
            [
              eventRow({ rounds: [['54', '950'], ['27', '960']], withPoints: true }),
              eventRow({ name: 'Other Player', pdgaNumber: '100002', rounds: [['60', '900'], ['30', '910']], withPoints: true }),
            ],
            true,
          ) +
          eventDivision('MA1', [''], [eventRow({ name: 'Third Player', pdgaNumber: '100003' })]),
      }),
    );
    expect(parseEvent(doc)).toEqual({
      eventId: 900001,
      name: 'Example Open',
      date: '2026-08-23',
      official: true,
      divisions: [
        {
          division: 'MPO',
          holes: [18, 9],
          rows: [
            {
              pdgaNumber: 100001,
              name: 'Test Player',
              rounds: [
                { score: 54, rating: 950, dnf: false },
                { score: 27, rating: 960, dnf: false },
              ],
            },
            {
              pdgaNumber: 100002,
              name: 'Other Player',
              rounds: [
                { score: 60, rating: 900, dnf: false },
                { score: 30, rating: 910, dnf: false },
              ],
            },
          ],
        },
        {
          division: 'MA1',
          holes: [null],
          rows: [{ pdgaNumber: 100003, name: 'Third Player', rounds: [{ score: 54, rating: 950, dnf: false }] }],
        },
      ],
    });
  });

  it('tells unofficial results from official ones', () => {
    const body = eventDivision('MPO', [''], [eventRow()]);
    expect(parseEvent(parseHtml(eventPage({ mode: 'live', body }))).official).toBe(false);
    expect(parseEvent(parseHtml(eventPage({ mode: 'normal', body }))).official).toBe(true);
  });

  it('falls back to the results heading when the leaderboard has no mode', () => {
    const doc = parseHtml(`<h2>Unofficial Results</h2><div>${eventDivision('MPO', [''], [eventRow()])}</div>`);
    expect(parseEvent(doc).official).toBe(false);
    expect(parseEvent(parseHtml(eventDivision('MPO', [''], [eventRow()]))).official).toBeNull();
  });

  it('reads a player without a PDGA number', () => {
    const doc = parseHtml(eventPage({ body: eventDivision('MPO', [''], [eventRow({ name: 'Guest', pdgaNumber: '' })]) }));
    expect(parseEvent(doc).divisions[0]!.rows[0]).toMatchObject({ pdgaNumber: null, name: 'Guest' });
  });

  it('marks DNF rounds and leaves rounds without a rating yet unrated', () => {
    const doc = parseHtml(
      eventPage({
        mode: 'live',
        body: eventDivision(
          'MPO',
          ['', '', ''],
          [eventRow({ rounds: [['54', ''], ['999', ''], ['DNF', '']] })],
        ),
      }),
    );
    expect(parseEvent(doc).divisions[0]!.rows[0]!.rounds).toEqual([
      { score: 54, rating: null, dnf: false },
      { score: null, rating: null, dnf: true },
      { score: null, rating: null, dnf: true },
    ]);
  });

  it('reads a pasted results table without the rest of the page', () => {
    const fragment = parseHtml(eventDivision('MPO', [''], [eventRow()]).replace(/<\/?details[^>]*>/g, ''));
    const results = parseEvent(fragment);
    expect(results).toMatchObject({ eventId: null, name: '', date: null, official: null });
    expect(results.divisions).toEqual([
      { division: '', holes: [null], rows: [{ pdgaNumber: 100001, name: 'Test Player', rounds: [{ score: 54, rating: 950, dnf: false }] }] },
    ]);
  });

  it('ignores tables without a PDGA# column', () => {
    const doc = parseHtml(eventPage({ body: '<table class="summary"><tr><th class="status">Status</th></tr></table>' }));
    expect(extractEvent(doc).divisions).toEqual([]);
  });

  describe('normalize', () => {
    const raw = (rows: unknown, divisions = 1) => ({
      eventId: '1',
      name: 'x',
      date: '1-Jan-2026',
      status: 'official',
      divisions: new Array(divisions).fill({ division: 'MPO', holes: [], rows }),
    });

    it('rejects malformed structure', () => {
      expect(() => normalizeEvent(null)).toThrow(ParseError);
      expect(() => normalizeEvent({ divisions: {} })).toThrow(ParseError);
      expect(() => normalizeEvent(raw([{ rounds: [{ score: 54 }] }]))).toThrow(ParseError);
    });

    it('limits the number of results across all divisions', () => {
      expect(() => normalizeEvent(raw(new Array(3000).fill({ rounds: [] }), 2))).toThrow(/more than/);
      expect(() => normalizeEvent(raw([{ rounds: new Array(31).fill({}) }]))).toThrow(/more than/);
    });

    it('reads an unknown status as null', () => {
      expect(normalizeEvent({ ...raw([]), status: 'maybe' }).official).toBeNull();
    });
  });
});
