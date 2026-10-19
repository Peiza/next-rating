import { describe, expect, it } from 'vitest';
import type { StoredImport } from '../../src/app/import';
import { buildModel } from '../../src/app/model';
import type { ListedRound } from '../../src/parsers';
import { rawDetailsRow, rawEvent, rawEventRow, rawPlayer } from '../handoff/raw';

const AT = '2026-10-01T10:00:00.000Z';

function stored(extra: Partial<StoredImport> = {}): StoredImport {
  return { at: AT, events: [], ...extra };
}

const details = [
  rawDetailsRow({ eventId: '900001', date: '2-Aug-2026', round: '2', roundLabel: '2', rating: '970' }),
  rawDetailsRow({ eventId: '900001', date: '2-Aug-2026', round: '1', roundLabel: '1', rating: '960' }),
  rawDetailsRow({ eventId: '900000', eventName: 'Example Spring', date: '10-May-2026', rating: '950' }),
];

describe('buildModel', () => {
  it('predicts from the ratings details, with the change vs the official rating', () => {
    const model = buildModel(stored({ player: rawPlayer({ currentRating: '950' }), details }), null);
    expect(model.player).toMatchObject({ pdgaNumber: 100001, currentRating: 950, ratingDate: '2026-09-08' });
    expect(model.prediction.rating).toBe(960);
    expect(model.prediction.change).toBe(10);
    expect(model.importedAt).toBe(AT);
    expect(model.rows.map(({ round }) => round.eventName)).toEqual(['Example Open', 'Example Open', 'Example Spring']);
  });

  it('hides the change without an official rating', () => {
    const model = buildModel(stored({ details }), null);
    expect(model.player).toBeNull();
    expect(model.prediction.change).toBeNull();
  });

  it("adds the imported player's rounds from event pages, newest first", () => {
    const model = buildModel(stored({ player: rawPlayer(), details, events: [rawEvent()] }), 100009);
    expect(model.pdgaNumber).toBe(100001);
    expect(model.rows.map(({ round }) => [round.date, round.rating, round.source, round.roundLabel])).toEqual([
      ['2026-09-06', 960, 'unofficial', '1'],
      ['2026-09-06', 955, 'unofficial', '2'],
      ['2026-08-02', 970, 'official', '2'],
      ['2026-08-02', 960, 'official', '1'],
      ['2026-05-10', 950, 'official', '1'],
    ]);
    expect(model.rows[1]!.round.holes).toBe(9);
  });

  it('picks event rows by the default PDGA number without an imported player', () => {
    const model = buildModel(stored({ events: [rawEvent()] }), 100002);
    expect(model.rows.map(({ round }) => round.rating)).toEqual([990, 980]);
    expect(model.needsNumber).toBe(false);
  });

  it('asks for a PDGA number when there are events but no number', () => {
    const model = buildModel(stored({ events: [rawEvent()] }), null);
    expect(model.needsNumber).toBe(true);
    expect(model.rows).toEqual([]);
    expect(model.prediction.rating).toBeNull();
  });

  it('lists events without rated rounds for the player', () => {
    const unrated = rawEvent({ eventId: '900003', name: 'Example Final' }, [rawEventRow('100001', ['', ''])]);
    const model = buildModel(stored({ events: [rawEvent(), unrated] }), 100001);
    expect(model.eventsWithoutRounds).toEqual([{ name: 'Example Final', date: '2026-09-06' }]);
  });

  it('gives each round its status', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      rawDetailsRow({ eventId: String(900010 + i), date: `${i + 1}-Aug-2026`, rating: '950' }),
    );
    const low = rawDetailsRow({ eventId: '900020', date: '20-Jul-2026', rating: '700' });
    const old = rawDetailsRow({ eventId: '900021', date: '1-Jul-2024', rating: '900' });
    const model = buildModel(stored({ details: [...many, low, old] }), null);
    const status = (rating: number | null) => model.rows.find(({ round }) => round.rating === rating)!.result.status;
    expect(status(700)).toBe('dropped');
    expect(status(900)).toBe('outside-window');
    expect(model.prediction.stats.roundsCounted).toBe(8);
  });

  it('adds manual rounds', () => {
    const manual: ListedRound = {
      id: 'm:1',
      rating: 1000,
      date: '2026-09-20',
      eventKey: 'm:1',
      source: 'manual',
      eventName: '',
      roundLabel: '',
    };
    const model = buildModel(stored({ details }), null, [manual]);
    expect(model.rows[0]!.round).toBe(manual);
    expect(model.prediction.stats.totalRounds).toBe(4);
  });
});
