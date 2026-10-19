import { describe, expect, it } from 'vitest';
import { normalizeRatingsDetails } from '../../src/parsers/details';
import { normalizeEvent } from '../../src/parsers/event';
import { extractDetailsTsv, extractEventTsv } from '../../src/parsers/tsv';
import { LIMITS, ParseError } from '../../src/parsers/values';

const tsv = (...rows: string[][]) => rows.map((cells) => cells.join('\t')).join('\r\n');

describe('ratings details as text', () => {
  const header = ['Tournament', 'Tier', 'Date', 'Division', 'Round', 'Score', 'Rating', 'Evaluated', 'Included'];

  it('reads rows below the header', () => {
    const text = tsv(
      ['Some text above the table'],
      header,
      ['Example Open', 'C', '1-Aug to 2-Aug-2026', 'MA1', '2', '54', '950', 'Yes', 'No'],
      ['Example Cup', 'B', '6-Jul-2026', 'MA1', 'Finals', '30', '1002', 'No', 'No'],
      [''],
    );
    const { rounds, skipped } = normalizeRatingsDetails(extractDetailsTsv(text));
    expect(skipped).toBe(0);
    expect(rounds).toEqual([
      {
        eventId: null,
        eventName: 'Example Open',
        tier: 'C',
        date: '2026-08-02',
        division: 'MA1',
        round: 2,
        roundLabel: '2',
        score: 54,
        rating: 950,
        holes: null,
        evaluated: true,
        included: false,
      },
      expect.objectContaining({ eventName: 'Example Cup', round: null, roundLabel: 'Finals', rating: 1002 }),
    ]);
  });

  it('finds columns by header text, in any order', () => {
    const text = tsv(['Included', 'Rating', 'Date', 'Evaluated'], ['Yes', '977', '3-Mar-2026', 'Yes']);
    expect(normalizeRatingsDetails(extractDetailsTsv(text)).rounds[0]).toMatchObject({
      rating: 977,
      date: '2026-03-03',
      included: true,
    });
  });

  it('reads nothing without a header row', () => {
    expect(extractDetailsTsv(tsv(['Example Open', 'C', '6-Aug-2026', 'MA1', '1', '54', '950', 'Yes', 'Yes']))).toEqual([]);
  });

  it('rejects text that is too long', () => {
    expect(() => extractDetailsTsv('x'.repeat(LIMITS.paste + 1))).toThrow(ParseError);
  });
});

describe('event results as text', () => {
  it('pairs score and rating columns between Par and Total', () => {
    const text = tsv(
      ['MPO · Mixed Pro Open (2)'],
      ['Place', 'Points', 'Name', 'PDGA#', 'Rating', 'Par', 'Rd1', '', 'Rd2', '', 'Total', 'Prize'],
      ['1', '40.00', 'Test Player', '100001', '940', '+2', '54', '950', '55', '945', '109', '$10'],
      ['2', '30.00', 'Guest', '', '', '+9', '60', '900', '999', '', '1059', ''],
    );
    expect(normalizeEvent(extractEventTsv(text)).divisions[0]!.rows).toEqual([
      {
        pdgaNumber: 100001,
        name: 'Test Player',
        rounds: [
          { score: 54, rating: 950, dnf: false },
          { score: 55, rating: 945, dnf: false },
        ],
      },
      {
        pdgaNumber: null,
        name: 'Guest',
        rounds: [
          { score: 60, rating: 900, dnf: false },
          { score: null, rating: null, dnf: true },
        ],
      },
    ]);
  });

  it('reads several division tables pasted at once, each with its own header', () => {
    const text = tsv(
      ['Place', 'Name', 'PDGA#', 'Rating', 'Par', 'Rd1', '', 'Total'],
      ['1', 'Test Player', '100001', '940', '-2', '48', '1008', '48'],
      ['FPO · Mixed (1)'],
      ['Place', 'Name', 'PDGA#', 'Rating', 'Par', 'Rd1', '', 'Rd2', '', 'Total'],
      ['1', 'Other Player', '100002', '900', '+1', '50', '980', '51', '970', '101'],
    );
    const rows = normalizeEvent(extractEventTsv(text)).divisions[0]!.rows;
    expect(rows.map((row) => [row.pdgaNumber, row.rounds.map((round) => round.rating)])).toEqual([
      [100001, [1008]],
      [100002, [980, 970]],
    ]);
  });

  it('has no event id, date or status', () => {
    expect(normalizeEvent(extractEventTsv(''))).toEqual({
      eventId: null,
      name: '',
      date: null,
      official: null,
      divisions: [{ division: '', holes: [], rows: [] }],
    });
  });
});
