import { describe, expect, it } from 'vitest';
import { eventForPlayer, type StoredImport } from '../../src/app/import';
import {
  createStore,
  DEFAULT_CARDS,
  DEFAULT_TOP_PERIOD,
  EMPTY_DATA,
  MAX_EVENT_NAME,
  MAX_FAVORITES,
  MAX_LEFT_OUT,
  MAX_MANUAL_ROUNDS,
  migrateV1,
  STORAGE_KEY,
  V1_KEY,
  validateData,
  validateTopPeriod,
  type StoredPlayer,
} from '../../src/app/storage';
import { rawDetailsRow, rawEvent, rawPlayer } from '../handoff/raw';
import { LIVE_V1 } from './live-v1';

const IMPORT: StoredImport = {
  at: '2026-10-01T10:00:00.000Z',
  player: rawPlayer(),
  details: [rawDetailsRow()],
  events: [],
};

/** IMPORT after migration from v1, which records when the details were imported. */
const MIGRATED: StoredImport = { ...IMPORT, detailsAt: IMPORT.at };

function player(pdgaNumber: number, extra: Partial<StoredPlayer> = {}): StoredPlayer {
  return { pdgaNumber, favorite: true, import: null, manualRounds: [], leftOut: [], ...extra };
}

/** A minimal in-memory Storage. */
class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

class FullStorage extends MemoryStorage {
  full = true;
  override setItem(key: string, value: string): void {
    if (this.full) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    super.setItem(key, value);
  }
}

class BrokenStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new DOMException('Denied', 'SecurityError');
  }
}

describe('store', () => {
  it('starts empty', () => {
    expect(createStore(new MemoryStorage()).get()).toEqual(EMPTY_DATA);
  });

  it('keeps data across page loads', () => {
    const storage = new MemoryStorage();
    const data = { ...EMPTY_DATA, language: 'sv', theme: 'dark' as const, playerOrder: 'updated' as const, me: 100001, players: [player(100001, { import: IMPORT })] };
    createStore(storage).update(data);
    expect(createStore(storage).get()).toEqual(data);
  });

  it('starts over when the stored data is corrupt', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(createStore(storage).get()).toEqual(EMPTY_DATA);
  });

  it('keeps working in memory while storage is full, and saves again once there is room', () => {
    const storage = new FullStorage();
    const store = createStore(storage);
    expect(store.persistent).toBe(true);
    expect(store.update({ language: 'sv' }).language).toBe('sv');
    expect(store.get().language).toBe('sv');
    expect(store.persistent).toBe(false);
    storage.full = false;
    store.update({ theme: 'dark' });
    expect(store.persistent).toBe(true);
    expect(createStore(storage).get()).toMatchObject({ language: 'sv', theme: 'dark' });
  });

  it('keeps working without storage', () => {
    const store = createStore(null);
    expect(store.persistent).toBe(false);
    expect(store.update({ language: 'en' }).language).toBe('en');
    expect(store.reload().language).toBe('en');
  });

  it('survives storage that throws on read', () => {
    expect(createStore(new BrokenStorage()).get()).toEqual(EMPTY_DATA);
  });

  it('reads what another tab stored', () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    createStore(storage).update({ me: 100001, players: [player(100001)] });
    expect(store.get().players).toEqual([]);
    expect(store.reload().players).toEqual([player(100001)]);
  });
});

describe('validateData', () => {
  it('drops invalid fields and keeps the valid ones', () => {
    expect(validateData({ language: '<b>', theme: 'light' })).toEqual({ ...EMPTY_DATA, theme: 'light' });
    expect(validateData({ theme: 'sepia' })).toEqual(EMPTY_DATA);
    expect(validateData({ players: 'x' })).toEqual(EMPTY_DATA);
  });

  it('keeps the players order, sorting by name when it is missing or unknown', () => {
    expect(validateData({ playerOrder: 'updated' }).playerOrder).toBe('updated');
    expect(validateData({}).playerOrder).toBe('name');
    expect(validateData({ playerOrder: 'rating' }).playerOrder).toBe('name');
  });

  it('drops invalid and repeated players and keeps the others', () => {
    const players = [
      player(100001),
      { pdgaNumber: -5, favorite: true, import: null },
      { pdgaNumber: '100002', favorite: true, import: null },
      { pdgaNumber: 100003, import: null },
      player(100001, { favorite: false }),
      player(100004, { favorite: false }),
    ];
    expect(validateData({ players }).players).toEqual([player(100001), player(100004, { favorite: false })]);
  });

  it('keeps one unsaved player', () => {
    const players = [player(100001, { favorite: false }), player(100002, { favorite: false })];
    expect(validateData({ players }).players).toEqual([player(100001, { favorite: false })]);
  });

  it(`keeps at most ${MAX_FAVORITES} favorites`, () => {
    const players = Array.from({ length: MAX_FAVORITES + 2 }, (_, i) => player(100001 + i));
    expect(validateData({ players }).players).toHaveLength(MAX_FAVORITES);
  });

  it('keeps "me" only when it is a favorite', () => {
    const players = [player(100001), player(100002, { favorite: false })];
    expect(validateData({ me: 100001, players }).me).toBe(100001);
    expect(validateData({ me: 100002, players }).me).toBeNull();
    expect(validateData({ me: 100009, players }).me).toBeNull();
  });

  it('drops a corrupt import or one stored under another number, and keeps the player', () => {
    const corrupt = { ...IMPORT, details: [{ rating: 950 }] };
    expect(validateData({ players: [player(100001, { import: corrupt as never })] }).players).toEqual([player(100001)]);
    expect(validateData({ players: [player(100002, { import: IMPORT })] }).players).toEqual([player(100002)]);
    // IMPORT has no detailsAt, like data stored before it was added.
    expect(validateData({ players: [player(100001, { import: IMPORT })] }).players[0]!.import).toEqual(IMPORT);
    expect(validateData({ players: [player(100001, { import: MIGRATED })] }).players[0]!.import).toEqual(MIGRATED);
  });

  it('ignores anything that is not an object', () => {
    expect(validateData(null)).toEqual(EMPTY_DATA);
    expect(validateData([1, 2])).toEqual(EMPTY_DATA);
    expect(validateData('x')).toEqual(EMPTY_DATA);
  });
});

describe('migration from v1', () => {
  it('makes the default player a favorite and "me", with its import', () => {
    const { data, complete } = migrateV1({ pdgaNumber: 100001, language: 'sv', theme: 'dark', lastImport: IMPORT });
    expect(complete).toBe(true);
    expect(data).toEqual({ ...EMPTY_DATA, language: 'sv', theme: 'dark', me: 100001, players: [player(100001, { import: MIGRATED })] });
  });

  it('keeps a default player without an import', () => {
    expect(migrateV1({ pdgaNumber: 100001 }).data).toEqual({ ...EMPTY_DATA, me: 100001, players: [player(100001)] });
  });

  it('makes the imported player "me" when there was no default player', () => {
    expect(migrateV1({ lastImport: IMPORT }).data).toEqual({ ...EMPTY_DATA, me: 100001, players: [player(100001, { import: MIGRATED })] });
  });

  it("stores another player's import as the unsaved player", () => {
    const { data } = migrateV1({ pdgaNumber: 100009, lastImport: IMPORT });
    expect(data.me).toBe(100009);
    expect(data.players).toEqual([player(100009), player(100001, { favorite: false, import: MIGRATED })]);
  });

  it("trims stored events to the player's rows", () => {
    const { data } = migrateV1({ pdgaNumber: 100001, lastImport: { ...IMPORT, details: undefined, events: [rawEvent()] } });
    expect(data.players[0]!.import!.events).toEqual([eventForPlayer(rawEvent(), 100001)]);
  });

  it('reports an import it cannot place: event pages without any player number', () => {
    const { data, complete } = migrateV1({ lastImport: { at: IMPORT.at, events: [rawEvent()] } });
    expect(complete).toBe(false);
    expect(data.players).toEqual([]);
  });

  it('converts what the single-player version saved: your number plus an import of another player', () => {
    const storage = new MemoryStorage();
    storage.setItem(V1_KEY, LIVE_V1);
    const lastImport = JSON.parse(LIVE_V1).lastImport;
    const store = createStore(storage);
    expect(store.get()).toEqual({
      ...EMPTY_DATA,
      language: null,
      theme: null,
      playerOrder: 'name',
      me: 100001,
      players: [
        player(100001),
        player(100002, {
          favorite: false,
          // Everything is kept, but the event page only with the player's own row.
          import: { ...lastImport, detailsAt: lastImport.at, events: [eventForPlayer(lastImport.events[0], 100002)] },
        }),
      ],
    });
    expect(store.get().players[1]!.import!.events[0]!.divisions[0]!.rows.map((row) => row.pdgaNumber)).toEqual(['100002']);
    expect(store.persistent).toBe(true);
    expect(storage.getItem(V1_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(store.get());
  });

  it('runs on first load and removes the v1 copy once saved', () => {
    const storage = new MemoryStorage();
    storage.setItem(V1_KEY, JSON.stringify({ pdgaNumber: 100001, language: 'sv', lastImport: IMPORT }));
    const store = createStore(storage);
    expect(store.get().players).toEqual([player(100001, { import: MIGRATED })]);
    expect(storage.getItem(V1_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(store.get());
  });

  it('keeps the v1 copy when the migrated data cannot be saved', () => {
    const storage = new FullStorage();
    storage.full = false;
    storage.setItem(V1_KEY, JSON.stringify({ pdgaNumber: 100001, lastImport: IMPORT }));
    storage.full = true;
    const store = createStore(storage);
    expect(store.get().me).toBe(100001);
    expect(store.persistent).toBe(false);
    expect(storage.getItem(V1_KEY)).not.toBeNull();
  });

  it('keeps the v1 copy when part of it could not be migrated', () => {
    const storage = new MemoryStorage();
    storage.setItem(V1_KEY, JSON.stringify({ lastImport: { at: IMPORT.at, events: [rawEvent()] } }));
    createStore(storage);
    expect(storage.getItem(V1_KEY)).not.toBeNull();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('ignores v1 once v2 exists', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...EMPTY_DATA, language: 'en' }));
    storage.setItem(V1_KEY, JSON.stringify({ pdgaNumber: 100001 }));
    expect(createStore(storage).get()).toEqual({ ...EMPTY_DATA, language: 'en' });
  });
});

describe('manual rounds', () => {
  const round = { id: 'm1', rating: 985, date: '2026-10-16', eventName: 'Club night', holes: 9 };

  it('load as none for players stored before they existed', () => {
    const { manualRounds, ...old } = player(100001);
    expect(manualRounds).toEqual([]);
    expect(validateData({ players: [old] }).players).toEqual([player(100001)]);
  });

  it('keep valid rounds, also ones dated ahead, and drop bad ones one at a time', () => {
    const later = { ...round, id: 'm2', date: '2027-06-01', eventName: '', holes: null };
    const bad = [
      { ...round, id: 'x1' },
      { ...round, id: 'm3', rating: 2001 },
      { ...round, id: 'm4', rating: 9.5 },
      { ...round, id: 'm5', date: '2026-02-30' },
      { ...round, id: 'm6', eventName: 'x'.repeat(MAX_EVENT_NAME + 1) },
      { ...round, id: 'm7', holes: 0 },
      { ...round, id: 'm8', holes: undefined },
      { ...round, id: 'm1', rating: 900 },
      'm9',
    ];
    const stored = validateData({ players: [player(100001, { manualRounds: [round, ...bad, later] as never })] });
    expect(stored.players[0]!.manualRounds).toEqual([round, later]);
  });

  it(`keep at most ${MAX_MANUAL_ROUNDS} per player`, () => {
    const many = Array.from({ length: MAX_MANUAL_ROUNDS + 5 }, (_, i) => ({ ...round, id: `m${i + 1}` }));
    expect(validateData({ players: [player(100001, { manualRounds: many })] }).players[0]!.manualRounds).toHaveLength(
      MAX_MANUAL_ROUNDS,
    );
  });

  it('survive a round trip through storage', () => {
    const storage = new MemoryStorage();
    createStore(storage).update({ players: [player(100001, { manualRounds: [round] })] });
    expect(createStore(storage).get().players[0]!.manualRounds).toEqual([round]);
  });
});

describe('left-out events', () => {
  it('load as none for players stored before they existed', () => {
    const { leftOut, ...old } = player(100001);
    expect(leftOut).toEqual([]);
    expect(validateData({ players: [old] }).players).toEqual([player(100001)]);
  });

  it('keep event keys and drop bad ones and repeats one at a time', () => {
    const keys = ['e:900003', 'n:Club night|2026-10-16', 'e:900003', 'e:abc', 'x:1', 'n:', 7, null, `n:${'x'.repeat(301)}`];
    const stored = validateData({ players: [player(100001, { leftOut: keys as never })] });
    expect(stored.players[0]!.leftOut).toEqual(['e:900003', 'n:Club night|2026-10-16']);
    expect(validateData({ players: [player(100001, { leftOut: 'e:1' as never })] }).players[0]!.leftOut).toEqual([]);
  });

  it(`keep at most ${MAX_LEFT_OUT} per player`, () => {
    const many = Array.from({ length: MAX_LEFT_OUT + 5 }, (_, i) => `e:${900000 + i}`);
    expect(validateData({ players: [player(100001, { leftOut: many })] }).players[0]!.leftOut).toHaveLength(MAX_LEFT_OUT);
  });

  it('survive a round trip through storage', () => {
    const storage = new MemoryStorage();
    createStore(storage).update({ players: [player(100001, { leftOut: ['e:900003'] })] });
    expect(createStore(storage).get().players[0]!.leftOut).toEqual(['e:900003']);
  });
});

describe('Rating tab settings', () => {
  it('start with only Rounds open and the current year for the Top 8', () => {
    expect(DEFAULT_CARDS).toEqual({ why: false, manual: false, target: false, top8: false, stats: false, rounds: true });
    expect(DEFAULT_TOP_PERIOD).toEqual({ kind: 'year', year: null });
    expect(validateData({}).cards).toEqual(DEFAULT_CARDS);
    expect(validateData({}).top8Period).toEqual(DEFAULT_TOP_PERIOD);
  });

  it('keep each card on its own, so one bad value costs only that card', () => {
    const cards = validateData({ cards: { why: true, rounds: false, stats: 'yes', extra: true } }).cards;
    expect(cards).toEqual({ ...DEFAULT_CARDS, why: true, rounds: false });
    expect(validateData({ cards: [true] }).cards).toEqual(DEFAULT_CARDS);
  });

  it('read each kind of Top 8 period and fall back to the current year', () => {
    expect(validateTopPeriod({ kind: 'year', year: null })).toEqual({ kind: 'year', year: null });
    expect(validateTopPeriod({ kind: 'year', year: 2025 })).toEqual({ kind: 'year', year: 2025 });
    expect(validateTopPeriod({ kind: 'window', extra: 1 })).toEqual({ kind: 'window' });
    expect(validateTopPeriod({ kind: 'custom', from: '2025-03-01', to: '2025-03-01' })).toEqual({
      kind: 'custom',
      from: '2025-03-01',
      to: '2025-03-01',
    });
    for (const bad of [
      { kind: 'year', year: 2025.5 },
      { kind: 'year', year: '2025' },
      { kind: 'year' },
      { kind: 'custom', from: '2025-04-01', to: '2025-03-01' },
      { kind: 'custom', from: '2025-02-30', to: '2025-03-01' },
      { kind: 'month' },
      'window',
      null,
    ]) {
      expect(validateTopPeriod(bad)).toEqual(DEFAULT_TOP_PERIOD);
    }
  });

  it('survive a round trip through storage, and load as defaults from data saved before they existed', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ language: 'sv', theme: null, playerOrder: 'name', me: null, players: [] }));
    expect(createStore(storage).get()).toEqual({ ...EMPTY_DATA, language: 'sv' });
    createStore(storage).update({ cards: { ...DEFAULT_CARDS, top8: true }, top8Period: { kind: 'window' } });
    const data = createStore(storage).get();
    expect(data.cards.top8).toBe(true);
    expect(data.top8Period).toEqual({ kind: 'window' });
  });
});

describe('bookmarklet version', () => {
  it('keeps a version as a hand-off carries it, and nothing else', () => {
    expect(validateData({}).bookmarklet).toBeNull();
    expect(validateData({ bookmarklet: '1.0.0' }).bookmarklet).toBe('1.0.0');
    expect(validateData({ bookmarklet: '2' }).bookmarklet).toBe('2');
    for (const bad of ['1.0.0.0', 'v1', '<b>', '1'.repeat(21), 1, null]) {
      expect(validateData({ bookmarklet: bad }).bookmarklet).toBeNull();
    }
  });
});
