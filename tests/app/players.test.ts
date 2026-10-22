import { describe, expect, it } from 'vitest';
import { eventForPlayer, type StoredImport } from '../../src/app/import';
import {
  addFavorite,
  addManualRound,
  clearManualRounds,
  findPlayer,
  initialSelection,
  playerName,
  removeExampleRounds,
  removeManualRound,
  removePlayer,
  replaceExampleRounds,
  restoreManualRound,
  routeImport,
  setLeftOut,
  setMe,
  sortFavorites,
  updateManualRound,
} from '../../src/app/players';
import { EMPTY_DATA, MAX_FAVORITES, MAX_MANUAL_ROUNDS, type AppData, type StoredPlayer } from '../../src/app/storage';
import { rawDetailsRow, rawEvent, rawEventRow, rawPlayer } from '../handoff/raw';

const AT = '2026-10-01T10:00:00.000Z';
const LATER = '2026-10-02T18:30:00.000Z';

const IMPORT: StoredImport = { at: AT, player: rawPlayer(), details: [rawDetailsRow()], events: [] };

function player(pdgaNumber: number, extra: Partial<StoredPlayer> = {}): StoredPlayer {
  return { pdgaNumber, favorite: true, import: null, manualRounds: [], leftOut: [], ...extra };
}

function data(players: StoredPlayer[], me: number | null = null): AppData {
  return { ...EMPTY_DATA, me, players };
}

describe('selection', () => {
  it('opens on "me", else the first favorite, else the unsaved player', () => {
    expect(initialSelection(data([player(100001), player(100002)], 100002))).toBe(100002);
    expect(initialSelection(data([player(100003, { favorite: false }), player(100001)]))).toBe(100001);
    expect(initialSelection(data([player(100003, { favorite: false })]))).toBe(100003);
    expect(initialSelection(EMPTY_DATA)).toBeNull();
  });

  it('opens on the last viewed player when chosen, while that player is stored', () => {
    const players = [player(100001), player(100002), player(100003, { favorite: false })];
    expect(initialSelection({ ...data(players, 100001), openWith: 'last', lastViewed: 100003 })).toBe(100003);
    expect(initialSelection({ ...data(players, 100001), openWith: 'me', lastViewed: 100003 })).toBe(100001);
    expect(initialSelection({ ...data(players, 100001), openWith: 'last', lastViewed: 100009 })).toBe(100001);
    expect(initialSelection({ ...data(players, 100001), openWith: 'last', lastViewed: null })).toBe(100001);
  });

  it('names a player from the last import', () => {
    expect(playerName(player(100001, { import: IMPORT }))).toBe('Test Player');
    expect(playerName(player(100001))).toBe('');
  });
});

describe('sortFavorites', () => {
  const named = (pdgaNumber: number, name: string, at = AT) =>
    player(pdgaNumber, { import: { ...IMPORT, at, player: rawPlayer({ pdgaNumber: String(pdgaNumber), name }) } });
  const players = [
    named(100001, 'Örjan Ek', '2026-10-03T10:00:00.000Z'),
    player(100009),
    named(100002, 'Zoe Ash', '2026-10-01T10:00:00.000Z'),
    named(100003, 'adam Berg', '2026-10-02T10:00:00.000Z'),
    named(100004, 'Me Myself', '2026-09-01T10:00:00.000Z'),
  ];
  const numbers = (sorted: StoredPlayer[]) => sorted.map((one) => one.pdgaNumber);

  it('puts "me" first, then the others A to Z in the locale\'s alphabet, unnamed last', () => {
    expect(numbers(sortFavorites(players, 100004, 'name', 'sv'))).toEqual([100004, 100003, 100002, 100001, 100009]);
  });

  it('follows the alphabet of the locale', () => {
    // In English, Ö sorts as O, before Z.
    expect(numbers(sortFavorites(players, null, 'name', 'en'))).toEqual([100003, 100004, 100001, 100002, 100009]);
  });

  it('puts "me" first, then the newest import, never imported last', () => {
    expect(numbers(sortFavorites(players, 100004, 'updated', 'sv'))).toEqual([100004, 100001, 100003, 100002, 100009]);
  });

  it('does not change the list it is given', () => {
    sortFavorites(players, 100004, 'name', 'sv');
    expect(numbers(players)).toEqual([100001, 100009, 100002, 100003, 100004]);
  });
});

describe('favorites', () => {
  it('adds a favorite ahead of the unsaved player', () => {
    const next = addFavorite(data([player(100001), player(100009, { favorite: false })]), 100002);
    expect(next.players.map((p) => p.pdgaNumber)).toEqual([100001, 100002, 100009]);
  });

  it('keeps the import when the unsaved player is saved', () => {
    const next = addFavorite(data([player(100001), player(100009, { favorite: false, import: IMPORT })]), 100009);
    expect(next.players).toEqual([player(100001), player(100009, { import: IMPORT })]);
  });

  it('changes nothing for a favorite or a full list', () => {
    const one = data([player(100001)]);
    expect(addFavorite(one, 100001)).toBe(one);
    const full = data(Array.from({ length: MAX_FAVORITES }, (_, i) => player(200001 + i)));
    expect(addFavorite(full, 100001)).toBe(full);
    expect(setMe(full, 100001)).toBe(full);
  });

  it('removes a player with its data, and "me" with it', () => {
    const next = removePlayer(data([player(100001, { import: IMPORT }), player(100002)], 100001), 100001);
    expect(next).toEqual(data([player(100002)]));
  });

  it('makes a player "me", saving it as a favorite first', () => {
    expect(setMe(EMPTY_DATA, 100001)).toEqual(data([player(100001)], 100001));
    expect(setMe(data([player(100001)], 100001), null)).toEqual(data([player(100001)]));
  });
});

describe('routeImport', () => {
  const details = { player: rawPlayer(), details: [rawDetailsRow()] };

  it("adds an import to that player's data", () => {
    const before = data([player(100001, { import: IMPORT }), player(100002)], 100002);
    const routed = routeImport(before, { player: rawPlayer({ currentRating: '960' }) }, LATER, null, 100002);
    expect(routed.owner).toBe(100001);
    expect(routed.players).toEqual([100001]);
    expect(findPlayer(routed.data, 100001)!.import).toEqual({ ...IMPORT, at: LATER, player: rawPlayer({ currentRating: '960' }) });
    expect(findPlayer(routed.data, 100002)).toEqual(player(100002));
  });

  it('uses the owner when the import has no player header', () => {
    const routed = routeImport(data([player(100001)]), { details: [rawDetailsRow()] }, AT, 100001, 100001);
    expect(routed.data.players).toEqual([player(100001, { import: { at: AT, detailsAt: AT, details: [rawDetailsRow()], events: [] } })]);
  });

  it('keeps a new player as the unsaved player, replacing the earlier one', () => {
    const before = data([player(100001), player(100008, { favorite: false, import: IMPORT })], 100001);
    const routed = routeImport(before, { ...details, player: rawPlayer({ pdgaNumber: '100009' }) }, AT, null, 100001);
    expect(routed.data.players.map((p) => [p.pdgaNumber, p.favorite])).toEqual([
      [100001, true],
      [100009, false],
    ]);
    expect(routed.data.me).toBe(100001);
  });

  it('changes nothing for an import without data', () => {
    const before = data([player(100001)]);
    expect(routeImport(before, {}, AT, 100001, 100001)).toEqual({ data: before, owner: 100001, players: [], noPlayer: false });
    expect(routeImport(before, {}, AT, null, 100001)).toEqual({ data: before, owner: null, players: [], noPlayer: false });
  });

  describe('event pages without a player', () => {
    const event = rawEvent(); // Rows for 100002 and 100001.

    it('go to every stored player with a row, trimmed to that row', () => {
      const before = data([player(100001), player(100002, { favorite: false }), player(100003)], 100003);
      const routed = routeImport(before, { events: [event] }, AT, null, 100003);
      expect(routed.owner).toBeNull();
      expect(routed.players).toEqual([100001, 100002]);
      expect(findPlayer(routed.data, 100001)!.import!.events).toEqual([eventForPlayer(event, 100001)]);
      expect(findPlayer(routed.data, 100002)!.import!.events).toEqual([eventForPlayer(event, 100002)]);
      expect(findPlayer(routed.data, 100003)!.import).toBeNull();
    });

    it('go to the selected player when no stored player has a row', () => {
      const unrated = rawEvent({}, [rawEventRow('100007', ['950'])]);
      const routed = routeImport(data([player(100003), player(100004)], 100003), { events: [unrated] }, AT, null, 100004);
      expect(routed.players).toEqual([100004]);
      expect(findPlayer(routed.data, 100004)!.import!.events).toEqual([{ ...unrated, divisions: [] }]);
    });

    it('cannot go anywhere without a stored player', () => {
      expect(routeImport(EMPTY_DATA, { events: [event] }, AT, null, null)).toEqual({
        data: EMPTY_DATA,
        owner: null,
        players: [],
        noPlayer: true,
      });
    });
  });
});

describe('left-out events', () => {
  const withEvent: StoredImport = { ...IMPORT, events: [rawEvent()] };

  it('are stored per player, and counted again', () => {
    const before = data([player(100001, { import: withEvent }), player(100002)]);
    const left = setLeftOut(before, 100001, 'e:900002', true);
    expect(findPlayer(left, 100001)!.leftOut).toEqual(['e:900002']);
    expect(findPlayer(left, 100002)!.leftOut).toEqual([]);
    expect(setLeftOut(left, 100001, 'e:900002', true)).toBe(left);
    expect(findPlayer(setLeftOut(left, 100001, 'e:900002', false), 100001)!.leftOut).toEqual([]);
    expect(setLeftOut(before, 100009, 'e:900002', true)).toBe(before);
  });

  it('are kept by an import that still has the event, and forgotten once the details include it', () => {
    const before = data([player(100001, { import: withEvent, leftOut: ['e:900002'] })]);
    const profile = routeImport(before, { player: rawPlayer({ currentRating: '960' }) }, LATER, null, 100001);
    expect(findPlayer(profile.data, 100001)!.leftOut).toEqual(['e:900002']);
    const official = { details: [rawDetailsRow({ eventId: '900002', date: '6-Sep-2026' })] };
    const routed = routeImport(profile.data, official, LATER, 100001, 100001);
    expect(findPlayer(routed.data, 100001)!.import!.events).toEqual([]);
    expect(findPlayer(routed.data, 100001)!.leftOut).toEqual([]);
  });

  it('stay with a player saved as a favorite', () => {
    const before = data([player(100001), player(100003, { favorite: false, leftOut: ['e:900002'] })]);
    expect(findPlayer(addFavorite(before, 100003), 100003)!.leftOut).toEqual(['e:900002']);
  });
});

describe('manual rounds', () => {
  const round = { rating: 985, date: '2026-10-16', eventName: '', holes: null, example: false };
  const roundsOf = (next: AppData, pdgaNumber: number) => findPlayer(next, pdgaNumber)!.manualRounds;

  it('adds rounds with ids that stay unique after a delete', () => {
    let next = addManualRound(data([player(100001)]), 100001, round).data;
    next = addManualRound(next, 100001, { ...round, rating: 950 }).data;
    expect(roundsOf(next, 100001).map(({ id, rating }) => [id, rating])).toEqual([
      ['m1', 985],
      ['m2', 950],
    ]);
    next = removeManualRound(next, 100001, 'm1');
    next = addManualRound(next, 100001, round).data;
    expect(roundsOf(next, 100001).map(({ id }) => id)).toEqual(['m2', 'm3']);
  });

  it('saves the unsaved player as a favorite, so its rounds are kept', () => {
    const added = addManualRound(data([player(100001), player(100009, { favorite: false, import: IMPORT })]), 100009, round);
    expect(added.error).toBeNull();
    expect(added.savedFavorite).toBe(true);
    expect(findPlayer(added.data, 100009)).toMatchObject({ favorite: true, import: IMPORT });
    expect(roundsOf(added.data, 100009)).toHaveLength(1);
  });

  it('leaves the data unchanged when the favorites or the rounds are full', () => {
    const favorites = Array.from({ length: MAX_FAVORITES }, (_, i) => player(100001 + i));
    const full = data([...favorites, player(200000, { favorite: false })]);
    expect(addManualRound(full, 200000, round)).toEqual({ data: full, error: 'favorites-full', savedFavorite: false });
    const many = Array.from({ length: MAX_MANUAL_ROUNDS }, (_, i) => ({ ...round, id: `m${i + 1}` }));
    const busy = data([player(100001, { manualRounds: many })]);
    expect(addManualRound(busy, 100001, round)).toEqual({ data: busy, error: 'rounds-full', savedFavorite: false });
  });

  it('restores a deleted round in its old place, with its id', () => {
    const rounds = ['m1', 'm2', 'm3'].map((id, i) => ({ ...round, id, rating: 950 + i }));
    const before = data([player(100001, { manualRounds: rounds })]);
    const deleted = removeManualRound(before, 100001, 'm2');
    expect(restoreManualRound(deleted, 100001, rounds[1]!, 1)).toEqual(before);
    // Out of range puts it last.
    expect(roundsOf(restoreManualRound(deleted, 100001, rounds[1]!, 9), 100001).map(({ id }) => id)).toEqual([
      'm1',
      'm3',
      'm2',
    ]);
  });

  it('does not restore over a taken id, into full rounds or for a removed player', () => {
    const rounds = [{ ...round, id: 'm1' }];
    const taken = data([player(100001, { manualRounds: rounds })]);
    expect(restoreManualRound(taken, 100001, { ...round, id: 'm1', rating: 900 }, 0)).toBe(taken);
    const many = Array.from({ length: MAX_MANUAL_ROUNDS }, (_, i) => ({ ...round, id: `m${i + 2}` }));
    const full = data([player(100001, { manualRounds: many })]);
    expect(restoreManualRound(full, 100001, rounds[0]!, 0)).toBe(full);
    const gone = data([player(100002)]);
    expect(restoreManualRound(gone, 100001, rounds[0]!, 0)).toBe(gone);
  });

  it('updates a round in its place, with its id, for one player only', () => {
    const rounds = ['m1', 'm2', 'm3'].map((id, i) => ({ ...round, id, rating: 950 + i }));
    const before = data([player(100001, { manualRounds: rounds }), player(100002, { manualRounds: rounds })]);
    const edited = { rating: 1001, date: '2026-10-20', eventName: 'Club night', holes: 9, example: false };
    const next = updateManualRound(before, 100001, 'm2', edited);
    expect(roundsOf(next, 100001)).toEqual([rounds[0], { id: 'm2', ...edited }, rounds[2]]);
    expect(roundsOf(next, 100002)).toEqual(rounds);
  });

  it('does not update a round that is gone, or for a removed player', () => {
    const before = data([player(100001, { manualRounds: [{ ...round, id: 'm1' }] })]);
    expect(updateManualRound(before, 100001, 'm2', round)).toBe(before);
    expect(updateManualRound(before, 100002, 'm1', round)).toBe(before);
  });

  it('replaces example rounds instead of adding more, after the ordinary ones with new ids', () => {
    const ordinary = [{ ...round, id: 'm1' }];
    const examples = [1010, 990].map((rating) => ({ ...round, rating }));
    let next = replaceExampleRounds(data([player(100001, { manualRounds: ordinary })]), 100001, examples).data;
    expect(roundsOf(next, 100001).map(({ id, rating, example }) => [id, rating, example])).toEqual([
      ['m1', 985, false],
      ['m2', 1010, true],
      ['m3', 990, true],
    ]);
    next = replaceExampleRounds(next, 100001, [{ ...round, rating: 1001 }]).data;
    expect(roundsOf(next, 100001).map(({ id, rating, example }) => [id, rating, example])).toEqual([
      ['m1', 985, false],
      ['m4', 1001, true],
    ]);
  });

  it('removes the example rounds only', () => {
    const rounds = [
      { ...round, id: 'm1' },
      { ...round, id: 'm2', example: true },
    ];
    const before = data([player(100001, { manualRounds: rounds })]);
    expect(roundsOf(removeExampleRounds(before, 100001), 100001)).toEqual([rounds[0]]);
    const none = data([player(100001, { manualRounds: [rounds[0]!] })]);
    expect(removeExampleRounds(none, 100001)).toBe(none);
  });

  it('saves the unsaved player for example rounds, within the limits', () => {
    const saved = replaceExampleRounds(data([player(100009, { favorite: false })]), 100009, [round]);
    expect(saved).toMatchObject({ error: null, savedFavorite: true });
    expect(findPlayer(saved.data, 100009)!.favorite).toBe(true);
    const favorites = Array.from({ length: MAX_FAVORITES }, (_, i) => player(100001 + i));
    const full = data([...favorites, player(200000, { favorite: false })]);
    expect(replaceExampleRounds(full, 200000, [round])).toEqual({ data: full, error: 'favorites-full', savedFavorite: false });
    // Earlier examples make room, since they are replaced.
    const many = Array.from({ length: MAX_MANUAL_ROUNDS }, (_, i) => ({ ...round, id: `m${i + 1}`, example: i >= 197 }));
    const busy = data([player(100001, { manualRounds: many })]);
    expect(replaceExampleRounds(busy, 100001, [round, round, round]).error).toBeNull();
    expect(replaceExampleRounds(busy, 100001, [round, round, round, round])).toEqual({
      data: busy,
      error: 'rounds-full',
      savedFavorite: false,
    });
  });

  it('clears one player only', () => {
    const rounds = [{ ...round, id: 'm1' }];
    const next = clearManualRounds(data([player(100001, { manualRounds: rounds }), player(100002, { manualRounds: rounds })]), 100001);
    expect(roundsOf(next, 100001)).toEqual([]);
    expect(roundsOf(next, 100002)).toEqual(rounds);
  });

  it('keeps them when the player is saved as a favorite or gets an import', () => {
    const rounds = [{ ...round, id: 'm1' }];
    const saved = addFavorite(data([player(100001, { favorite: false, manualRounds: rounds })]), 100001);
    expect(roundsOf(saved, 100001)).toEqual(rounds);
    const routed = routeImport(saved, { player: rawPlayer(), details: [rawDetailsRow()] }, LATER, null, 100001);
    expect(roundsOf(routed.data, 100001)).toEqual(rounds);
  });
});
