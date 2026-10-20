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
    const model = buildModel(stored({ player: rawPlayer({ currentRating: '950' }), details }), 100001);
    expect(model.player).toMatchObject({ pdgaNumber: 100001, currentRating: 950, ratingDate: '2026-09-08' });
    expect(model.prediction.rating).toBe(960);
    expect(model.prediction.change).toBe(10);
    expect(model.importedAt).toBe(AT);
    expect(model.rows.map(({ round }) => round.eventName)).toEqual(['Example Open', 'Example Open', 'Example Spring']);
  });

  it('hides the change without an official rating', () => {
    const model = buildModel(stored({ details }), 100001);
    expect(model.player).toBeNull();
    expect(model.prediction.change).toBeNull();
  });

  it("adds the imported player's rounds from event pages, newest first", () => {
    const model = buildModel(stored({ player: rawPlayer(), details, events: [rawEvent()] }), 100001);
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

  it('picks event rows by the number the import is stored under', () => {
    const model = buildModel(stored({ events: [rawEvent()] }), 100002);
    expect(model.pdgaNumber).toBe(100002);
    expect(model.player).toBeNull();
    expect(model.rows.map(({ round }) => round.rating)).toEqual([990, 980]);
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
    const model = buildModel(stored({ details: [...many, low, old] }), 100001);
    const status = (rating: number | null) => model.rows.find(({ round }) => round.rating === rating)!.result.status;
    expect(status(700)).toBe('dropped');
    expect(status(900)).toBe('outside-window');
    expect(model.prediction.stats.roundsCounted).toBe(8);
  });

  it('explains the change with the rounds that are new since the official update', () => {
    const model = buildModel(stored({ player: rawPlayer({ currentRating: '960' }), details, events: [rawEvent()] }), 100001);
    expect(model.changes!.map(({ round, item }) => [round.rating, round.source, item.kind])).toEqual([
      [955, 'unofficial', 'new'],
      [960, 'unofficial', 'new'],
    ]);
    // The official rounds give 960: a 960 round changes nothing, a 955 one lowers it.
    expect(model.changes![0]!.item.effect).toBeLessThan(0);
    expect(model.changes![1]!.item.effect).toBe(0);
    expect(model.difference).toBeNull();
  });

  it('has no explanation without ratings details', () => {
    expect(buildModel(stored({ events: [rawEvent()] }), 100001).changes).toBeNull();
  });

  it("adds the difference from PDGA's last calculation, so the lines add up to the change shown", () => {
    // PDGA's rounds give 960, but the official rating is 950.
    const model = buildModel(stored({ player: rawPlayer({ currentRating: '950' }), details, events: [rawEvent()] }), 100001);
    const effects = model.changes!.reduce((sum, { item }) => sum + item.effect, 0);
    expect(model.difference).not.toBeNull();
    expect(effects + model.difference!).toBeCloseTo(model.prediction.change!, 9);
    expect(buildModel(stored({ details }), 100001).difference).toBeNull();
  });

  describe('stale ratings details', () => {
    // The official rating is from 2026-09-08.
    const staleAt = (extra: Partial<StoredImport>) =>
      buildModel(stored({ player: rawPlayer(), details, ...extra }), 100001).staleDetails;

    it('are imported before the official rating date', () => {
      expect(staleAt({ at: '2026-09-07T10:00:00.000Z' })).toBe(true);
      expect(staleAt({ at: '2026-09-08T10:00:00.000Z' })).toBe(false);
      expect(staleAt({ at: '2026-09-09T10:00:00.000Z' })).toBe(false);
    });

    it('go by when the details were imported, and by the last import in older data', () => {
      expect(staleAt({ at: AT, detailsAt: '2026-09-01T10:00:00.000Z' })).toBe(true);
      expect(staleAt({ at: AT, detailsAt: '2026-09-10T10:00:00.000Z' })).toBe(false);
      expect(staleAt({ at: '2026-09-01T10:00:00.000Z' })).toBe(true);
    });

    it('need an official rating date', () => {
      expect(buildModel(stored({ details, at: '2026-09-01T10:00:00.000Z' }), 100001).staleDetails).toBe(false);
    });
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
    const model = buildModel(stored({ details }), 100001, [manual]);
    expect(model.rows[0]!.round).toBe(manual);
    expect(model.prediction.stats.totalRounds).toBe(4);
  });
});
