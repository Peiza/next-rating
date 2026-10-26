import { describe, expect, it, vi } from 'vitest';
import {
  API_CACHE_KEY,
  API_CACHE_MS,
  API_URL,
  createApiCache,
  lookupPlayer,
  MAX_ANSWER,
  newerOfficial,
  validateApiPlayer,
  type ApiPlayer,
} from '../../src/app/api';
import { createStore, STORAGE_KEY } from '../../src/app/storage';

/* Invented data only. */

const URL = 'https://api.example';

function player(extra: Partial<ApiPlayer> = {}): ApiPlayer {
  return {
    pdgaNumber: 99999,
    name: 'Test Player',
    rating: 950,
    ratingDate: '2026-10-14',
    membership: 'current',
    membershipExpires: '2026-12-31',
    classification: 'amateur',
    fetchedAt: '2026-10-26T12:00:00.000Z',
    ...extra,
  };
}

/** A minimal in-memory Storage. */
class MemoryStorage implements Storage {
  items = new Map<string, string>();
  failWrites = false;
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
    if (this.failWrites) throw new Error('full');
    this.items.set(key, value);
  }
}

function answer(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;
}

const ON = { url: URL, enabled: true, online: true };

describe('the build setting', () => {
  it('is off in tests', () => {
    expect(API_URL).toBe('');
  });
});

describe('validateApiPlayer', () => {
  it('accepts the Worker answer for the asked number', () => {
    expect(validateApiPlayer(player(), 99999)).toEqual(player());
    expect(validateApiPlayer(player({ rating: null, ratingDate: null, membership: 'expired', name: null, classification: null }), 99999)).toMatchObject({
      rating: null,
      membership: 'expired',
    });
  });

  it('drops the date of a missing rating', () => {
    expect(validateApiPlayer(player({ rating: null }), 99999)?.ratingDate).toBeNull();
  });

  it.each([
    ['another number', player(), 1],
    ['a string rating', { ...player(), rating: '950' }, 99999],
    ['a rating out of range', player({ rating: 2001 }), 99999],
    ['a bad date', { ...player(), ratingDate: '14-Oct-2026' }, 99999],
    ['an unknown membership', { ...player(), membership: 'gold' }, 99999],
    ['an unknown classification', { ...player(), classification: 'P' }, 99999],
    ['a long name', player({ name: 'x'.repeat(101) }), 99999],
    ['an empty name', player({ name: '' }), 99999],
    ['a bad time', player({ fetchedAt: 'yesterday' }), 99999],
    ['a list', [player()], 99999],
    ['an error', { error: 'not-found' }, 99999],
  ])('rejects %s', (_, value, pdgaNumber) => {
    expect(validateApiPlayer(value, pdgaNumber)).toBeNull();
  });
});

describe('lookupPlayer', () => {
  it('asks the Worker for the player, without cookies or referrer', async () => {
    const fetchFn = answer(player());
    expect(await lookupPlayer(99999, { ...ON, fetch: fetchFn })).toEqual({ ok: true, player: player() });
    const [url, init] = vi.mocked(fetchFn).mock.calls[0]!;
    expect(url).toBe(`${URL}/v1/player/99999`);
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer' });
  });

  it.each([
    ['without an address', { ...ON, url: '' }],
    ['with the switch off', { ...ON, enabled: false }],
    ['offline', { ...ON, online: false }],
  ])('makes no request %s', async (_, options) => {
    const fetchFn = answer(player());
    expect(await lookupPlayer(99999, { ...options, fetch: fetchFn })).toEqual({ ok: false, code: 'off' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('says not-found for a 404', async () => {
    expect(await lookupPlayer(99999, { ...ON, fetch: answer({ error: 'not-found' }, 404) })).toEqual({ ok: false, code: 'not-found' });
  });

  it.each([
    ['an error status', answer({ error: 'unavailable' }, 503), 'unavailable'],
    ['a rate limit', answer({ error: 'rate-limited' }, 429), 'rate-limited'],
    ['an answer that fails the schema', answer({ ...player(), rating: 'high' }), 'invalid-answer'],
    ['an answer over the size limit', answer({ ...player(), padding: 'x'.repeat(MAX_ANSWER) }), 'too-large'],
    ['text that is not JSON', answer('<html>'), 'invalid-answer'],
    ['a network failure', vi.fn(async () => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch, 'network'],
  ])('says unavailable for %s, with a code', async (_, fetchFn, detail) => {
    expect(await lookupPlayer(99999, { ...ON, fetch: fetchFn })).toEqual({ ok: false, code: 'unavailable', detail });
  });

  it('gives up after the timeout', async () => {
    const fetchFn = vi.fn(
      (_: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))),
    ) as unknown as typeof fetch;
    expect(await lookupPlayer(99999, { ...ON, fetch: fetchFn, timeoutMs: 10 })).toEqual({ ok: false, code: 'unavailable', detail: 'timeout' });
  });
});

describe('newerOfficial', () => {
  it('is true only when PDGA has a later rating date than the import', () => {
    expect(newerOfficial(player({ ratingDate: '2026-10-14' }), '2026-09-09')).toBe(true);
    expect(newerOfficial(player({ ratingDate: '2026-10-14' }), null)).toBe(true);
    expect(newerOfficial(player({ ratingDate: '2026-10-14' }), '2026-10-14')).toBe(false);
    expect(newerOfficial(player({ ratingDate: '2026-09-09' }), '2026-10-14')).toBe(false);
    expect(newerOfficial(player({ rating: null, ratingDate: null }), '2026-09-09')).toBe(false);
    expect(newerOfficial(null, '2026-09-09')).toBe(false);
  });
});

describe('the temporary cache', () => {
  it('keeps an answer for 12 hours under its own key', () => {
    const storage = new MemoryStorage();
    let now = 1_000_000;
    const cache = createApiCache(storage, () => now);
    cache.set(player());
    expect(storage.items.has(API_CACHE_KEY)).toBe(true);
    now += API_CACHE_MS - 1;
    expect(cache.get(99999)).toEqual(player());
    now += 1;
    expect(cache.get(99999)).toBeNull();
    // Expired entries are deleted on read, and an empty cache leaves no key.
    expect(storage.items.has(API_CACHE_KEY)).toBe(false);
  });

  it('purges expired entries, as on app start', () => {
    const storage = new MemoryStorage();
    let now = 1_000_000;
    createApiCache(storage, () => now).set(player());
    createApiCache(storage, () => now).set(player({ pdgaNumber: 1 }));
    now += API_CACHE_MS;
    createApiCache(storage, () => now).purge();
    expect(storage.items.has(API_CACHE_KEY)).toBe(false);
  });

  it('deletes one player, or everything', () => {
    const storage = new MemoryStorage();
    const cache = createApiCache(storage, () => 1_000_000);
    cache.set(player());
    cache.set(player({ pdgaNumber: 1 }));
    cache.delete(99999);
    expect(cache.get(99999)).toBeNull();
    expect(cache.get(1)).not.toBeNull();
    cache.clear();
    expect(storage.items.has(API_CACHE_KEY)).toBe(false);
  });

  it('ignores stored entries that fail the schema or come from the future', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      API_CACHE_KEY,
      JSON.stringify({ 99999: { storedAt: 1_000_000, player: { ...player(), rating: 'x' } }, 1: { storedAt: 9e15, player: player({ pdgaNumber: 1 }) } }),
    );
    const cache = createApiCache(storage, () => 1_000_000);
    expect(cache.get(99999)).toBeNull();
    expect(cache.get(1)).toBeNull();
  });

  it('keeps at most 40 players, dropping the oldest', () => {
    let now = 1;
    const cache = createApiCache(new MemoryStorage(), () => now);
    for (let n = 1; n <= 41; n++) {
      now = n;
      cache.set(player({ pdgaNumber: n }));
    }
    expect(cache.get(1)).toBeNull();
    expect(cache.get(2)).not.toBeNull();
    expect(cache.get(41)).not.toBeNull();
  });

  it('never ends up in the app data', () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    createApiCache(storage, () => 1_000_000).set(player());
    store.update({ theme: 'dark' });
    expect(storage.items.get(STORAGE_KEY)).not.toContain('Test Player');
    expect(JSON.stringify(store.get())).not.toContain('Test Player');
  });

  it('works in memory without storage', () => {
    const cache = createApiCache(null, () => 1_000_000);
    cache.set(player());
    expect(cache.get(99999)).toEqual(player());
  });

  it('returns nothing when storage cannot keep it', () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    const cache = createApiCache(storage, () => 1_000_000);
    cache.set(player());
    expect(cache.get(99999)).toBeNull();
  });
});
