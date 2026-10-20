import { describe, expect, it } from 'vitest';
import { eventForPlayer, type StoredImport } from '../../src/app/import';
import {
  createStore,
  EMPTY_DATA,
  MAX_FAVORITES,
  migrateV1,
  STORAGE_KEY,
  V1_KEY,
  validateData,
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
  return { pdgaNumber, favorite: true, import: null, ...extra };
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
    const data = { language: 'sv', theme: 'dark' as const, playerOrder: 'updated' as const, me: 100001, players: [player(100001, { import: IMPORT })] };
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
    expect(data).toEqual({ language: 'sv', theme: 'dark', playerOrder: 'name', me: 100001, players: [player(100001, { import: MIGRATED })] });
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
