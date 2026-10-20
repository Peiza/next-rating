// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  extractRatingsDetails,
  normalizeRatingsDetails,
  parseRatingsDetails,
} from '../../src/parsers/details';
import { ParseError } from '../../src/parsers/values';
import { detailsRow, detailsTable, layoutTooltip, page, parseHtml, playerHeader } from './html';

const TOOLTIP = '#layout-details-900001-MA1-round-1';

describe('ratings details', () => {
  it('reads every column of a row', () => {
    const doc = parseHtml(
      page(
        playerHeader() +
          layoutTooltip(TOOLTIP.slice(1), 18) +
          detailsTable([detailsRow({ tooltip: TOOLTIP, rowClass: 'evaluated included odd' })]),
      ),
    );
    expect(parseRatingsDetails(doc)).toEqual({
      rounds: [
        {
          eventId: 900001,
          eventName: 'Example Open',
          tier: 'C',
          date: '2026-08-06',
          division: 'MA1',
          round: 1,
          roundLabel: '1',
          score: 54,
          rating: 950,
          holes: 18,
          evaluated: true,
          included: true,
        },
      ],
      skipped: 0,
    });
  });

  it('uses the last day of a multi-day event', () => {
    const doc = parseHtml(page(detailsTable([detailsRow({ date: '1-Aug to 2-Aug-2026' })])));
    expect(parseRatingsDetails(doc).rounds[0]!.date).toBe('2026-08-02');
  });

  it('takes the round number from the tooltip when the label is "Finals"', () => {
    const tooltip = '#layout-details-900001-MA1-round-12';
    const doc = parseHtml(
      page(layoutTooltip(tooltip.slice(1), 9) + detailsTable([detailsRow({ round: 'Finals', tooltip })])),
    );
    const [round] = parseRatingsDetails(doc).rounds;
    expect(round).toMatchObject({ round: 12, roundLabel: 'Finals', holes: 9 });
  });

  it('reads a hole count other than 18', () => {
    const doc = parseHtml(
      page(layoutTooltip(TOOLTIP.slice(1), 19) + detailsTable([detailsRow({ tooltip: TOOLTIP })])),
    );
    expect(parseRatingsDetails(doc).rounds[0]!.holes).toBe(19);
  });

  it('leaves hole count and round number unknown without tooltips', () => {
    const doc = parseHtml(page(detailsTable([detailsRow({ round: 'Finals' })])));
    expect(parseRatingsDetails(doc).rounds[0]).toMatchObject({ round: null, roundLabel: 'Finals', holes: null });
  });

  it('prefers the row classes for the flags, and falls back to the cells', () => {
    const doc = parseHtml(
      page(
        detailsTable([
          detailsRow({ rowClass: 'not-evaluated not-included', evaluated: 'Yes', included: 'Yes' }),
          detailsRow({ evaluated: 'Yes', included: 'No' }),
        ]),
      ),
    );
    const rounds = parseRatingsDetails(doc).rounds;
    expect(rounds.map((round) => [round.evaluated, round.included])).toEqual([
      [false, false],
      [true, false],
    ]);
  });

  it('reads a table without id, page title or canonical link', () => {
    const fragment = parseHtml(detailsTable([detailsRow(), detailsRow({ round: '2', rating: '960' })], ''));
    expect(parseRatingsDetails(fragment).rounds.map((round) => round.rating)).toEqual([950, 960]);
  });

  it('finds columns by header text, in any order', () => {
    const doc = parseHtml(`<table>
      <tr><th>Rating</th><th>Included</th><th>Date</th><th>Evaluated</th><th>Tournament</th></tr>
      <tr><td>1001</td><td>No</td><td>3-Mar-2026</td><td>Yes</td><td>Example Cup</td></tr></table>`);
    expect(parseRatingsDetails(doc).rounds[0]).toMatchObject({
      rating: 1001,
      date: '2026-03-03',
      eventName: 'Example Cup',
      eventId: null,
      evaluated: true,
      included: false,
    });
  });

  it('ignores other tables', () => {
    const doc = parseHtml(page('<table><tr><th>Division</th></tr><tr><td>MPO</td></tr></table>'));
    expect(extractRatingsDetails(doc)).toEqual([]);
  });

  it('skips and counts rows without a readable rating or date', () => {
    const doc = parseHtml(
      page(detailsTable([detailsRow({ rating: '' }), detailsRow({ date: 'soon' }), detailsRow()])),
    );
    const details = parseRatingsDetails(doc);
    expect(details.rounds).toHaveLength(1);
    expect(details.skipped).toBe(2);
  });

  describe('normalize', () => {
    it('rejects input that is not a list of records', () => {
      expect(() => normalizeRatingsDetails({})).toThrow(ParseError);
      expect(() => normalizeRatingsDetails([null])).toThrow(ParseError);
      expect(() => normalizeRatingsDetails([{ rating: 950 }])).toThrow(ParseError);
    });

    it('rejects too many rows and too long text', () => {
      expect(() => normalizeRatingsDetails(new Array(5001).fill({}))).toThrow(/more than/);
      expect(() => normalizeRatingsDetails([{ eventName: 'x'.repeat(1000) }])).toThrow(/too long/);
    });

    it('drops out of range values', () => {
      const [round] = normalizeRatingsDetails([
        { date: '6-Aug-2026', rating: '950', score: '-3', holes: '500', eventId: '12abc', round: '0' },
      ]).rounds;
      expect(round).toMatchObject({ score: null, holes: null, eventId: null, round: null });
    });
  });
});
