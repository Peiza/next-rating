import { describe, expect, it } from 'vitest';
import { createState, handle, type Deps, type Env } from '../../worker/src/handler';
import { cleanList, listKey, MAX_SYNC_BODY, MAX_SYNC_PLAYERS, newToken, parseSyncRoute, SYNC_TTL_S, type ListStore } from '../../worker/src/sync';

const APP = 'https://app.example';
const NOW = Date.UTC(2026, 9, 26, 12);

function memoryStore() {
  const values = new Map<string, string>();
  const ttls: number[] = [];
  const store: ListStore = {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value, { expirationTtl }) => {
      values.set(key, value);
      ttls.push(expirationTtl);
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
  return { store, values, ttls };
}

function setup(now = () => NOW) {
  const memory = memoryStore();
  const env: Env = { ALLOWED_ORIGINS: APP, LISTS: memory.store };
  const deps: Deps = {
    fetch: (() => Promise.reject(new Error('no PDGA calls'))) as unknown as typeof fetch,
    now,
    state: createState(),
  };
  const call = async (method: string, path: string, body?: unknown, origin: string | null = APP) => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (origin) headers.set('Origin', origin);
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
    const response = await handle(new Request(`https://worker.example${path}`, init), env, deps);
    const text = await response.text();
    return { response, status: response.status, json: text ? JSON.parse(text) : null };
  };
  return { ...memory, env, deps, call };
}

describe('the sync route', () => {
  it('accepts /v1/sync and /v1/sync/<32-character token> only', () => {
    expect(parseSyncRoute('/v1/sync')).toEqual({ kind: 'create' });
    const token = 'A'.repeat(31) + '_';
    expect(parseSyncRoute(`/v1/sync/${token}`)).toEqual({ kind: 'list', token });
    for (const path of ['/v1/sync/', '/v1/sync/short', `/v1/sync/${'A'.repeat(33)}`, `/v1/sync/${'A'.repeat(31)}=`, `/v1/sync/${token}/x`]) {
      expect(parseSyncRoute(path), path).toBeNull();
    }
  });

  it('makes tokens of 24 random bytes as base64url', () => {
    const token = newToken((bytes) => bytes.fill(0xfb));
    expect(token).toBe('-_v7'.repeat(8));
    expect(newToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newToken()).not.toBe(newToken());
  });

  it('keeps only PDGA numbers and "me"', () => {
    expect(cleanList({ players: [5, 7, 5], me: 7, names: ['x'], ratings: [950] })).toEqual({ players: [5, 7], me: 7 });
    expect(cleanList({ players: [5], me: 8 })).toEqual({ players: [5], me: null });
    for (const value of [null, [], { players: 'x' }, { players: [0] }, { players: [1.5] }, { players: ['5'] }, { players: [100_000_000] }]) {
      expect(cleanList(value), JSON.stringify(value)).toBeNull();
    }
    expect(cleanList({ players: Array.from({ length: MAX_SYNC_PLAYERS + 1 }, (_, i) => i + 1) })).toBeNull();
  });
});

describe('syncing a list', () => {
  it('stores a new list under the hash of its token, never the token, for 400 days', async () => {
    const { call, values, ttls } = setup();
    const created = await call('POST', '/v1/sync', { players: [100001, 100002], me: 100001, name: 'Someone' });
    expect(created.status).toBe(201);
    expect(created.response.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(created.response.headers.get('Cache-Control')).toBe('no-store');
    const { token, updatedAt } = created.json;
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(updatedAt).toBe(NOW);
    const key = await listKey(token);
    expect(key).toMatch(/^list:[0-9a-f]{64}$/);
    expect([...values.keys()]).toEqual([key]);
    expect(values.get(key)).not.toContain(token);
    expect(JSON.parse(values.get(key)!)).toEqual({ players: [100001, 100002], me: 100001, updatedAt: NOW });
    expect(ttls).toEqual([SYNC_TTL_S]);

    expect((await call('GET', `/v1/sync/${token}`)).json).toEqual({ players: [100001, 100002], me: 100001, updatedAt: NOW });
  });

  it('replaces the whole list on PUT with a new time, and deletes it', async () => {
    let now = NOW;
    const { call } = setup(() => now);
    const { token } = (await call('POST', '/v1/sync', { players: [1], me: null })).json;
    now += 5000;
    const put = await call('PUT', `/v1/sync/${token}`, { players: [2, 3], me: 3 });
    expect(put).toMatchObject({ status: 200, json: { updatedAt: NOW + 5000 } });
    expect((await call('GET', `/v1/sync/${token}`)).json).toEqual({ players: [2, 3], me: 3, updatedAt: NOW + 5000 });

    expect((await call('DELETE', `/v1/sync/${token}`)).status).toBe(200);
    expect((await call('GET', `/v1/sync/${token}`)).status).toBe(404);
    // A deleted list is not made again by a device that still syncs.
    expect((await call('PUT', `/v1/sync/${token}`, { players: [4], me: null })).status).toBe(404);
  });

  it('answers 404 for an unknown token and 400 for a bad body or method', async () => {
    const { call, values } = setup();
    expect((await call('GET', `/v1/sync/${'a'.repeat(32)}`)).json).toEqual({ error: 'not-found' });
    expect((await call('POST', '/v1/sync', 'not json')).status).toBe(400);
    expect((await call('POST', '/v1/sync', { players: ['Name'] })).status).toBe(400);
    expect((await call('POST', '/v1/sync', { players: [1], pad: 'x'.repeat(MAX_SYNC_BODY) })).status).toBe(400);
    expect((await call('GET', '/v1/sync')).status).toBe(400);
    expect((await call('PATCH', `/v1/sync/${'a'.repeat(32)}`, { players: [] })).status).toBe(400);
    expect(values.size).toBe(0);
  });

  it('answers the app origin only', async () => {
    const { call, values } = setup();
    expect((await call('POST', '/v1/sync', { players: [1] }, 'https://other.example')).status).toBe(403);
    expect((await call('POST', '/v1/sync', { players: [1] }, null)).status).toBe(403);
    expect(values.size).toBe(0);
  });

  it('has its own rate limit, and says so when the list store is missing', async () => {
    const { call, env } = setup();
    env.SYNC_LIMITER = { limit: async () => ({ success: false }) };
    expect((await call('GET', `/v1/sync/${'a'.repeat(32)}`)).json).toEqual({ error: 'rate-limited' });
    delete env.SYNC_LIMITER;
    delete env.LISTS;
    expect((await call('POST', '/v1/sync', { players: [1] })).json).toEqual({ error: 'unavailable', reason: 'not-configured' });
  });
});
