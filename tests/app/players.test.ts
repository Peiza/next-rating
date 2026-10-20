import { describe, expect, it } from 'vitest';
import { eventForPlayer, type StoredImport } from '../../src/app/import';
import {
  addFavorite,
  findPlayer,
  initialSelection,
  playerName,
  removePlayer,
  routeImport,
  setMe,
} from '../../src/app/players';
import { EMPTY_DATA, MAX_FAVORITES, type AppData, type StoredPlayer } from '../../src/app/storage';
import { rawDetailsRow, rawEvent, rawEventRow, rawPlayer } from '../handoff/raw';

const AT = '2026-10-01T10:00:00.000Z';
const LATER = '2026-10-02T18:30:00.000Z';

const IMPORT: StoredImport = { at: AT, player: rawPlayer(), details: [rawDetailsRow()], events: [] };

function player(pdgaNumber: number, extra: Partial<StoredPlayer> = {}): StoredPlayer {
  return { pdgaNumber, favorite: true, import: null, ...extra };
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

  it('names a player from the last import', () => {
    expect(playerName(player(100001, { import: IMPORT }))).toBe('Test Player');
    expect(playerName(player(100001))).toBe('');
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
