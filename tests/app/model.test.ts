import { describe, expect, it } from 'vitest';
import type { StoredImport } from '../../src/app/import';
import { predictRating } from '../../src/engine';
import { buildModel, createPredictionCache, listPrediction, manualToRounds, playerModel, STALE_DAYS } from '../../src/app/model';
import type { StoredManualRound, StoredPlayer } from '../../src/app/storage';
import type { ListedRound } from '../../src/parsers';
import { rawDetailsRow, rawEvent, rawEventRow, rawHistoryRow, rawPlayer, rawProfileEvent } from '../handoff/raw';

const AT = '2026-10-01T10:00:00.000Z';
const NOW = new Date(AT);

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
    const model = buildModel(stored({ player: rawPlayer({ currentRating: '950' }), details, events: [rawEvent()] }), 100001, NOW);
    expect(model.player).toMatchObject({ pdgaNumber: 100001, currentRating: 950, ratingDate: '2026-09-08' });
    expect(model.prediction.rating).toBe(959);
    expect(model.prediction.change).toBe(9);
    expect(model.importedAt).toBe(AT);
    expect(model.rows.map(({ round }) => round.eventName)).toEqual(['Example Cup', 'Example Cup', 'Example Open', 'Example Open', 'Example Spring']);
  });

  it('keeps the official rating without new rated rounds, with nothing to explain', () => {
    const model = buildModel(stored({ player: rawPlayer({ currentRating: '950' }), details }), 100001, NOW);
    expect(model.prediction).toMatchObject({ rating: 950, change: 0, unchanged: true });
    expect(model.prediction.exact).toBe(960);
    expect([model.changes, model.difference, model.netChange]).toEqual([null, null, null]);
  });

  it('hides the change without an official rating', () => {
    const model = buildModel(stored({ details }), 100001, NOW);
    expect(model.player).toBeNull();
    expect(model.prediction.change).toBeNull();
  });

  it("adds the imported player's rounds from event pages, newest first", () => {
    const model = buildModel(stored({ player: rawPlayer(), details, events: [rawEvent()] }), 100001, NOW);
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
    const model = buildModel(stored({ events: [rawEvent()] }), 100002, NOW);
    expect(model.pdgaNumber).toBe(100002);
    expect(model.player).toBeNull();
    expect(model.rows.map(({ round }) => round.rating)).toEqual([990, 980]);
  });

  it('lists events without rated rounds for the player', () => {
    const unrated = rawEvent({ eventId: '900003', name: 'Example Final' }, [rawEventRow('100001', ['', ''])]);
    const model = buildModel(stored({ events: [rawEvent(), unrated] }), 100001, NOW);
    expect(model.eventsWithoutRounds).toEqual([{ name: 'Example Final', date: '2026-09-06' }]);
  });

  it('gives each round its status', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      rawDetailsRow({ eventId: String(900010 + i), date: `${i + 1}-Aug-2026`, rating: '950' }),
    );
    const low = rawDetailsRow({ eventId: '900020', date: '20-Jul-2026', rating: '700' });
    const old = rawDetailsRow({ eventId: '900021', date: '1-Jul-2024', rating: '900' });
    const model = buildModel(stored({ details: [...many, low, old] }), 100001, NOW);
    const status = (rating: number | null) => model.rows.find(({ round }) => round.rating === rating)!.result.status;
    expect(status(700)).toBe('dropped');
    expect(status(900)).toBe('outside-window');
    expect(model.prediction.stats.roundsCounted).toBe(8);
  });

  it('explains the change with the rounds that are new since the official update', () => {
    const model = buildModel(stored({ player: rawPlayer({ currentRating: '960' }), details, events: [rawEvent()] }), 100001, NOW);
    expect(model.changes!.map(({ round, item }) => [round.rating, round.source, item.kind])).toEqual([
      [955, 'unofficial', 'new'],
      [960, 'unofficial', 'new'],
    ]);
    // The official rounds give 960: a 960 round changes nothing, a 955 one lowers it.
    expect(model.changes![0]!.item.effect).toBeLessThan(0);
    expect(model.changes![1]!.item.effect).toBe(0);
    expect(model.difference).toBeNull();
  });

  describe('report deadline', () => {
    // On 2026-09-07 the next update is 2026-09-08, for events reported by 2026-09-06.
    const later = rawEvent({ eventId: '900004', name: 'Example Late', date: '7-Sep-2026' });
    const model = (at: Date, ratingDate = '(as of 08-Aug-2026)') =>
      buildModel(stored({ player: rawPlayer({ ratingDate }), details, events: [rawEvent(), later] }), 100001, at);

    it('leaves rounds of events after it for the following update', () => {
      const { rows, prediction, changes, nextUpdate } = model(new Date('2026-09-07T10:00:00'));
      expect(nextUpdate).toEqual({ update: '2026-09-08', deadline: '2026-09-06' });
      const late = rows.filter(({ round }) => round.eventName === 'Example Late');
      expect(late.map(({ result }) => result.status)).toEqual(['after-deadline', 'after-deadline']);
      expect(rows.filter(({ result }) => result.status === 'after-deadline')).toEqual(late);
      expect(prediction.stats.windowEnd).toBe('2026-09-06');
      expect(changes!.map(({ round }) => round.eventName)).not.toContain('Example Late');
    });

    it('moves to the following update once the official rating is from the update day', () => {
      const { rows, nextUpdate } = model(new Date('2026-09-08T20:00:00'), '(as of 08-Sep-2026)');
      expect(nextUpdate).toEqual({ update: '2026-10-13', deadline: '2026-10-11' });
      expect(rows.map(({ result }) => result.status)).not.toContain('after-deadline');
    });
  });

  it('has no explanation without ratings details', () => {
    expect(buildModel(stored({ events: [rawEvent()] }), 100001, NOW).changes).toBeNull();
  });

  it("adds the difference from PDGA's last calculation, so the lines add up to the change shown", () => {
    // PDGA's rounds give 960, but the official rating is 950.
    const model = buildModel(stored({ player: rawPlayer({ currentRating: '950' }), details, events: [rawEvent()] }), 100001, NOW);
    const effects = model.changes!.reduce((sum, { item }) => sum + item.effect, 0);
    expect(model.difference).not.toBeNull();
    expect(effects + model.difference!).toBeCloseTo(model.prediction.change!, 9);
    expect(buildModel(stored({ details }), 100001, NOW).difference).toBeNull();
  });

  it('adds the lines up to a net change, the difference line included', () => {
    const net = (currentRating: string) => {
      const model = buildModel(stored({ player: rawPlayer({ currentRating }), details, events: [rawEvent()] }), 100001, NOW);
      const lines = model.changes!.reduce((sum, { item }) => sum + item.effect, 0) + (model.difference ?? 0);
      expect(model.netChange).toBeCloseTo(lines, 9);
      return model;
    };
    // Reproduced: the unrounded change from the official state.
    const reproduced = net('960');
    expect(reproduced.netChange).toBeCloseTo(reproduced.prediction.exact! - reproduced.officialExact!, 9);
    net('950');
    expect(buildModel(stored({ events: [rawEvent()] }), 100001, NOW).netChange).toBeNull();
  });

  it('calculates the official rating unrounded only when the official state gives it', () => {
    const model = (currentRating: string) =>
      buildModel(stored({ player: rawPlayer({ currentRating }), details }), 100001, NOW);
    const reproduced = model('960').officialExact!;
    expect(Math.round(reproduced)).toBe(960);
    expect(model('950').officialExact).toBeNull();
    expect(buildModel(stored({ player: rawPlayer({ currentRating: '' }), details }), 100001, NOW).officialExact).toBeNull();
  });

  describe('stale ratings details', () => {
    // The official rating is from 2026-09-08.
    const staleAt = (extra: Partial<StoredImport>) =>
      buildModel(stored({ player: rawPlayer(), details, ...extra }), 100001, NOW).staleDetails;

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
      expect(buildModel(stored({ details, at: '2026-09-01T10:00:00.000Z' }), 100001, NOW).staleDetails).toBe(false);
    });
  });

  it('adds manual rounds', () => {
    const manual: ListedRound = {
      id: 'm:1',
      rating: 1000,
      date: '2026-09-20',
      eventKey: 'm:1',
      eventId: null,
      source: 'manual',
      eventName: '',
      roundLabel: '',
    };
    const model = buildModel(stored({ details }), 100001, NOW, [manual]);
    expect(model.rows[0]!.round).toBe(manual);
    expect(model.prediction.stats.totalRounds).toBe(4);
  });
});

describe('unofficial events', () => {
  const xTier = rawEvent({ eventId: '900003', name: 'Example XA', date: '13-Sep-2026' }, [rawEventRow('100001', ['1040', '1030'])]);
  const profileEvents = [rawProfileEvent({ eventId: '900003', name: 'Example XA', tier: 'XA', date: '13-Sep-2026' }), rawProfileEvent()];
  const base = stored({ player: rawPlayer({ currentRating: '950' }), details, events: [rawEvent(), xTier], profileEvents });

  it('lists each one newest first, with the tier from the profile page, and counts X-tier rounds by default', () => {
    const model = buildModel(base, 100001, NOW);
    expect(model.unofficialEvents.map((event) => [event.key, event.name, event.tier, event.xTier, event.leftOut, event.ifCounted])).toEqual([
      ['e:900003', 'Example XA', 'XA', true, false, null],
      ['e:900002', 'Example Cup', 'C', false, false, null],
    ]);
    const xTierRows = model.rows.filter(({ round }) => round.tier === 'XA');
    expect(xTierRows.map(({ result }) => result.status)).toEqual(['included', 'included']);
  });

  it('knows a league by tier L, which still counts by default', () => {
    const league = [rawProfileEvent({ eventId: '900003', name: 'Example XA', tier: 'L', date: '13-Sep-2026' }), rawProfileEvent()];
    const model = buildModel({ ...base, profileEvents: league }, 100001, NOW);
    expect(model.unofficialEvents.map((event) => [event.tier, event.xTier, event.league, event.leftOut])).toEqual([
      ['L', false, true, false],
      ['C', false, false, false],
    ]);
  });

  it('knows no tier without the profile page', () => {
    const model = buildModel({ ...base, profileEvents: undefined }, 100001, NOW);
    expect(model.unofficialEvents.map((event) => [event.tier, event.xTier])).toEqual([
      ['', false],
      ['', false],
    ]);
  });

  it('leaves out the events the user chose, and says what counting each would give', () => {
    const counted = buildModel(base, 100001, NOW);
    const model = buildModel(base, 100001, NOW, [], ['e:900003']);
    const statuses = model.rows.filter(({ round }) => round.eventKey === 'e:900003').map(({ result }) => result.status);
    expect(statuses).toEqual(['left-out', 'left-out']);
    expect(model.leaveOut).toEqual(new Set(['e:900003']));
    const [left, other] = model.unofficialEvents;
    expect(left!.leftOut).toBe(true);
    expect(left!.ifCounted!.rating).toBe(counted.prediction.rating);
    expect(left!.ifCounted!.effect).toBeCloseTo(counted.prediction.exact! - model.prediction.exact!, 9);
    expect(left!.ifCounted!.effect).toBeGreaterThan(0);
    expect(other!.ifCounted).toBeNull();
    // The left-out rounds are still listed in Why it changed, with no effect.
    expect(model.changes!.filter(({ item }) => item.after === 'left-out').map(({ item }) => item.effect)).toEqual([0, 0]);
  });

  it('ignores left-out keys of events that are not unofficial', () => {
    const model = buildModel(base, 100001, NOW, [], ['e:900001', 'e:999999']);
    expect(model.leaveOut.size).toBe(0);
    expect(model.prediction.exact).toBe(buildModel(base, 100001, NOW).prediction.exact);
  });
});

describe('manualToRounds', () => {
  const manual = (id: string, eventName: string, date = '2026-09-20', holes: number | null = null): StoredManualRound => ({
    id,
    rating: 1000,
    date,
    eventName,
    holes,
  });

  it('groups rounds with the same event name and date into one event, apart from imported events', () => {
    const rounds = manualToRounds([
      manual('m1', 'Club night'),
      manual('m2', 'club night'),
      manual('m3', 'Club night', '2026-09-21'),
      manual('m4', ''),
      manual('m5', ''),
    ]);
    const keys = rounds.map(({ eventKey }) => eventKey);
    expect(keys[0]).toBe(keys[1]);
    expect(new Set(keys).size).toBe(4);
    expect(keys.every((key) => key.startsWith('m:'))).toBe(true);
    expect(rounds[0]).toMatchObject({ id: 'm:m1', source: 'manual', eventId: null, eventName: 'Club night', roundLabel: '' });
  });

  it('weighs a short round by its holes', () => {
    const [nine] = manualToRounds([manual('m1', '', '2026-09-20', 9)]);
    expect(nine!.holes).toBe(9);
    const model = buildModel(stored({ details }), 100001, NOW, [nine!]);
    expect(model.prediction.rounds.find(({ id }) => id === 'm:m1')!.weight).toBe(0.5);
  });

  it('counts a round dated ahead by the report deadline, and moves a later one to the following update', () => {
    // On 1 Oct 2026 the next update is 13 Oct, for events reported by 11 Oct.
    const rounds = manualToRounds([manual('m1', '', '2026-10-10'), manual('m2', '', '2026-10-12')]);
    const model = buildModel(stored({ player: rawPlayer(), details }), 100001, NOW, rounds);
    const status = (id: string) => model.prediction.rounds.find((round) => round.id === id)!.status;
    expect(status('m:m1')).toBe('included');
    expect(status('m:m2')).toBe('after-deadline');
  });
});

describe('the following update', () => {
  // On 1 Oct 2026 the next update is 13 Oct (deadline 11 Oct), the following one 10 Nov (deadline 8 Nov).
  const imported = stored({ player: rawPlayer({ currentRating: '950' }), details, events: [rawEvent()] });
  const manual = (id: string, date: string, rating = 1000): StoredManualRound => ({ id, rating, date, eventName: '', holes: null });
  const model = (rounds: StoredManualRound[], data = imported, leftOut: string[] = []) =>
    buildModel(data, 100001, NOW, manualToRounds(rounds), leftOut);

  it('is the month after the next update', () => {
    expect(model([]).followingUpdate).toEqual({ update: '2026-11-10', deadline: '2026-11-08' });
    const december = buildModel(imported, 100001, new Date('2026-12-01T10:00:00'));
    expect(december.nextUpdate).toEqual({ update: '2026-12-08', deadline: '2026-12-06' });
    expect(december.followingUpdate).toEqual({ update: '2027-01-12', deadline: '2027-01-10' });
  });

  const later = ({ rows }: ReturnType<typeof model>) => rows.filter((row) => row.later).map(({ round }) => round.id);

  it('has no prediction of its own when no round waits for it', () => {
    const counted = model([manual('m1', '2026-10-05')]);
    expect(counted.following).toBeNull();
    expect(later(counted)).toEqual([]);
  });

  it('counts the rounds after the next deadline, with the change vs the next prediction', () => {
    const withLater = model([manual('m1', '2026-10-20')]);
    const next = model([]);
    expect(withLater.prediction.rating).toBe(next.prediction.rating);
    const expected = predictRating(withLater.rounds, { currentRating: 950, deadline: '2026-11-08', leaveOut: withLater.leaveOut });
    expect(withLater.following).toEqual({ rating: expected.rating, change: expected.rating! - withLater.prediction.rating! });
    expect(withLater.following!.change).toBeGreaterThan(0);
  });

  it('leaves rounds after its own deadline for a later update', () => {
    const both = model([manual('m1', '2026-10-20'), manual('m2', '2026-11-20', 700)]);
    expect(both.following).toEqual(model([manual('m1', '2026-10-20')]).following);
    expect(later(both)).toEqual(['m:m2']);
    const onlyLater = model([manual('m2', '2026-11-20')]);
    expect(onlyLater.following).toBeNull();
    expect(later(onlyLater)).toEqual(['m:m2']);
    // A round that waits for the following update is not later than it.
    expect(both.rows.find(({ round }) => round.id === 'm:m1')).toMatchObject({ result: { status: 'after-deadline' }, later: false });
  });

  it('keeps left-out events out', () => {
    const late = rawEvent({ eventId: '900005', name: 'Example Late', date: '20-Oct-2026' });
    const data = { ...imported, events: [rawEvent(), late] };
    expect(model([], data).following).not.toBeNull();
    expect(model([], data, ['e:900005']).following).toBeNull();
    const withManual = model([manual('m1', '2026-10-20')], data, ['e:900005']);
    expect(withManual.following).toEqual(model([manual('m1', '2026-10-20')]).following);
  });

  describe('on 22 Oct 2026', () => {
    // The next update is 10 Nov (deadline 8 Nov), the following one 8 Dec (deadline 6 Dec).
    const oct22 = new Date('2026-10-22T10:00:00');
    const on = (rounds: StoredManualRound[]) => buildModel(imported, 100001, oct22, manualToRounds(rounds));

    it('counts a round dated up to 6 Dec in the 8 Dec update, and leaves a later one for a later update', () => {
      const { nextUpdate, followingUpdate } = on([]);
      expect([nextUpdate, followingUpdate]).toEqual([
        { update: '2026-11-10', deadline: '2026-11-08' },
        { update: '2026-12-08', deadline: '2026-12-06' },
      ]);
      expect(on([manual('m1', '2026-12-06')]).following).not.toBeNull();
      for (const date of ['2026-12-07', '2026-12-15']) {
        const model = on([manual('m1', date)]);
        expect(model.following).toBeNull();
        expect(later(model)).toEqual(['m:m1']);
        expect(model.prediction.rating).toBe(on([]).prediction.rating);
      }
    });

    it('keeps the line of a round before 6 Dec when a later round is added, with the same figures', () => {
      const november = on([manual('m1', '2026-11-15')]);
      const both = on([manual('m1', '2026-11-15'), manual('m2', '2026-12-15', 700)]);
      expect(both.following).toEqual(november.following);
      expect(both.prediction.rating).toBe(november.prediction.rating);
    });
  });

  it('has no change without a next prediction', () => {
    const { prediction, following } = model([manual('m1', '2026-10-20')], stored());
    expect(prediction.rating).toBeNull();
    expect(following).toEqual({ rating: 1000, change: null });
  });
});

describe('stale data', () => {
  const at = (days: number, minutes = 0) => new Date(NOW.getTime() + days * 86_400_000 + minutes * 60_000);

  it(`is stale only when the last import is more than ${STALE_DAYS} days old`, () => {
    expect(buildModel(stored({ details }), 100001, at(STALE_DAYS)).stale).toBe(false);
    expect(buildModel(stored({ details }), 100001, at(STALE_DAYS, 1)).stale).toBe(true);
  });
});

describe('ratings history', () => {
  const history = [rawHistoryRow('8-Sep-2026', '950', '20'), rawHistoryRow('11-Aug-2026', '947', '18')];

  it('is empty before an import brings it', () => {
    expect(buildModel(stored({ player: rawPlayer(), details }), 100001, NOW).history).toEqual([]);
  });

  it('lists the updates oldest first', () => {
    const model = buildModel(stored({ player: rawPlayer({ ratingDate: '(as of 08-Sep-2026)' }), details, history }), 100001, NOW);
    expect(model.history).toEqual([
      { date: '2026-08-11', rating: 947, rounds: 18 },
      { date: '2026-09-08', rating: 950, rounds: 20 },
    ]);
  });

  it('adds a newer update from the player header', () => {
    const player = rawPlayer({ currentRating: '953', ratingDate: '(as of 13-Oct-2026)' });
    const model = buildModel(stored({ player, details, history }), 100001, NOW);
    expect(model.history.at(-1)).toEqual({ date: '2026-10-13', rating: 953, rounds: null });
    expect(model.history).toHaveLength(3);
  });
});

describe('the prediction in the players list', () => {
  const imported = stored({ player: rawPlayer({ currentRating: '950' }), details, events: [rawEvent()] });
  const manual: StoredManualRound = { id: 'm1', rating: 1000, date: '2026-09-20', eventName: '', holes: null };
  const player = (extra: Partial<StoredPlayer> = {}): StoredPlayer => ({
    pdgaNumber: 100001,
    favorite: true,
    import: imported,
    manualRounds: [],
    leftOut: [],
    ...extra,
  });

  it("is the Rating tab's prediction, with the change vs the official rating", () => {
    expect(listPrediction(player(), NOW)).toEqual({ rating: 959, change: 9, unchanged: false });
  });

  it('counts manual rounds and leaves out what the user left out, as the Rating tab does', () => {
    const withManual = player({ manualRounds: [manual] });
    const model = playerModel(withManual, imported, NOW);
    expect(listPrediction(withManual, NOW)).toEqual({ rating: model.prediction.rating, change: model.prediction.change, unchanged: false });
    expect(model.prediction.rating).toBeGreaterThan(959);
    // Without the unofficial event no new round counts, so it is the official rating.
    expect(listPrediction(player({ leftOut: ['e:900002'] }), NOW)).toEqual({ rating: 950, change: 0, unchanged: true });
  });

  it('has no change without an official rating', () => {
    expect(listPrediction(player({ import: stored({ details }) }), NOW)).toEqual({ rating: 960, change: null, unchanged: false });
  });

  it('is null before an import and without a rated round or an official rating', () => {
    expect(listPrediction(player({ import: null }), NOW)).toBeNull();
    expect(listPrediction(player({ import: stored({ events: [rawEvent({}, [rawEventRow('100001', ['', ''])])] }) }), NOW)).toBeNull();
    // With only the player header, the official rating stands, as on the Rating tab.
    expect(listPrediction(player({ import: stored({ player: rawPlayer() }) }), NOW)).toEqual({ rating: 950, change: 0, unchanged: true });
  });

  it('is remembered while the data and the day stay the same', () => {
    const predict = createPredictionCache();
    const first = predict(player(), NOW);
    // A new object with the same content, as storage hands out after any change.
    expect(predict(player(), NOW)).toBe(first);
    const later = predict(player({ manualRounds: [manual] }), NOW);
    expect(later).not.toBe(first);
    expect(later!.rating).toBeGreaterThan(959);
    expect(predict(player({ import: { ...imported, at: '2026-10-02T10:00:00.000Z' } }), NOW)).not.toBe(later);
    const reimported = predict(player(), NOW);
    expect(predict(player(), new Date('2026-10-02T10:00:00.000Z'))).not.toBe(reimported);
  });
});
