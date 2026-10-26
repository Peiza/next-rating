import { describe, expect, it, vi } from 'vitest';
import { RANGES } from '../../src/parsers/values';
import {
  createState,
  FOUND_TTL_MS,
  handle,
  ID_RANGE,
  LOGIN_BACKOFF_MS,
  NOT_FOUND_TTL_MS,
  parseRoute,
  PDGA_API,
  type Deps,
  type EdgeCache,
  type Env,
} from '../../worker/src/handler';
import { mapPlayer, plainDate } from '../../worker/src/player';

/* Invented data only, shaped like the answers in the PDGA API docs. */

const APP = 'https://app.example';
const NOW = Date.UTC(2026, 9, 26, 12);
const USERNAME = 'test-user';
const PASSWORD = 'secret-password-123';

const ENV: Env = { PDGA_USERNAME: USERNAME, PDGA_PASSWORD: PASSWORD, ALLOWED_ORIGINS: `${APP}, http://localhost:5173` };

function apiPlayer(extra: Record<string, string> = {}): Record<string, string> {
  return {
    first_name: 'Test',
    last_name: 'Player',
    pdga_number: '99999',
    membership_status: 'current',
    membership_expiration_date: '2026-12-31',
    classification: 'A',
    city: 'Test City',
    state_prov: 'TS',
    country: 'SE',
    rating: '950',
    rating_effective_date: '2026-10-14',
    official_status: 'yes',
    official_expiration_date: '2027-01-01',
    last_modified: '2026-10-20',
    ...extra,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const LOGIN_OK = () => json({ sessid: 'abc123', session_name: 'SSESStest', token: 'csrf-token', user: { name: USERNAME } });

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** A fake api.pdga.com: answers are taken in order, per route. */
function upstream(answers: { login?: (() => Response)[]; players?: (() => Response)[] }) {
  const calls: Call[] = [];
  const queues = { login: [...(answers.login ?? [])], players: [...(answers.players ?? [])] };
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const queue = url.startsWith(`${PDGA_API}/user/login`) ? queues.login : queues.players;
    const next = queue.shift();
    if (!next) throw new Error(`unexpected call to ${url}`);
    return next();
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function deps(fetch: typeof globalThis.fetch, extra: Partial<Deps> = {}): Deps {
  return { fetch, now: () => NOW, state: createState(), ...extra };
}

function get(path: string, origin: string | null = APP, method = 'GET'): Request {
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  return new Request(`https://worker.example${path}`, { method, headers });
}

describe('the route', () => {
  it('uses the same PDGA number range as the parsers', () => {
    expect(ID_RANGE).toEqual(RANGES.id);
  });

  it('accepts /v1/player/:n only', () => {
    expect(parseRoute('/v1/player/99999')).toBe(99999);
    expect(parseRoute('/v1/player/1')).toBe(1);
    expect(parseRoute('/v1/player/99999999')).toBe(99_999_999);
    for (const path of ['/v1/player/0', '/v1/player/012', '/v1/player/123456789', '/v1/player/1a', '/v1/player/', '/v1/player/1/x', '/', '/v1/players?pdga_number=1']) {
      expect(parseRoute(path), path).toBeNull();
    }
  });

  it('answers 400 for a bad number without calling PDGA', async () => {
    const { fetch, calls } = upstream({});
    const response = await handle(get('/v1/player/abc'), ENV, deps(fetch));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bad-request' });
    expect(calls).toEqual([]);
  });

  it('answers 400 for other methods', async () => {
    const { fetch } = upstream({});
    const response = await handle(get('/v1/player/99999', APP, 'POST'), ENV, deps(fetch));
    expect(response.status).toBe(400);
  });
});

describe('CORS', () => {
  it('allows the app origin only', async () => {
    const { fetch } = upstream({ login: [LOGIN_OK], players: [() => json({ players: [apiPlayer()] })] });
    const response = await handle(get('/v1/player/99999'), ENV, deps(fetch));
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('turns away other origins and requests without one, without calling PDGA', async () => {
    for (const origin of ['https://other.example', null]) {
      const { fetch, calls } = upstream({});
      const response = await handle(get('/v1/player/99999', origin), ENV, deps(fetch));
      expect(response.status).toBe(403);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(calls).toEqual([]);
    }
  });

  it('answers the preflight with GET and OPTIONS', async () => {
    const { fetch, calls } = upstream({});
    const response = await handle(get('/v1/player/99999', APP, 'OPTIONS'), ENV, deps(fetch));
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(calls).toEqual([]);
  });
});

describe('the lookup', () => {
  it('logs in, then asks for one player with the session cookie', async () => {
    const { fetch, calls } = upstream({ login: [LOGIN_OK], players: [() => json({ sessid: 'abc123', status: 0, players: [apiPlayer()] })] });
    const response = await handle(get('/v1/player/99999'), ENV, deps(fetch));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pdgaNumber: 99999,
      name: 'Test Player',
      rating: 950,
      ratingDate: '2026-10-14',
      membership: 'current',
      membershipExpires: '2026-12-31',
      classification: 'amateur',
      fetchedAt: new Date(NOW).toISOString(),
    });
    expect(calls.map((call) => call.url)).toEqual([`${PDGA_API}/user/login`, `${PDGA_API}/players?pdga_number=99999&limit=1`]);
    const loginInit = calls[0]!.init!;
    expect(loginInit.method).toBe('POST');
    expect(new Headers(loginInit.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(loginInit.body))).toEqual({ username: USERNAME, password: PASSWORD });
    const headers = new Headers(calls[1]!.init!.headers);
    expect(headers.get('Cookie')).toBe('SSESStest=abc123');
    expect(headers.get('X-CSRF-Token')).toBeNull();
  });

  it('reuses the session and never logs out', async () => {
    const { fetch, calls } = upstream({
      login: [LOGIN_OK],
      players: [() => json({ players: [apiPlayer()] }), () => json({ players: [apiPlayer({ pdga_number: '1' })] })],
    });
    const d = deps(fetch);
    await handle(get('/v1/player/99999'), ENV, d);
    await handle(get('/v1/player/1'), ENV, d);
    expect(calls.filter((call) => call.url.includes('/user/login'))).toHaveLength(1);
    expect(calls.some((call) => call.url.includes('logout') || call.url.includes('/system/connect'))).toBe(false);
  });

  it('logs in once when two lookups start together', async () => {
    const { fetch, calls } = upstream({
      login: [LOGIN_OK],
      players: [() => json({ players: [apiPlayer()] }), () => json({ players: [apiPlayer({ pdga_number: '1' })] })],
    });
    const d = deps(fetch);
    await Promise.all([handle(get('/v1/player/99999'), ENV, d), handle(get('/v1/player/1'), ENV, d)]);
    expect(calls.filter((call) => call.url.includes('/user/login'))).toHaveLength(1);
  });

  it.each([401, 403])('logs in again once after a %i and retries once', async (status) => {
    const { fetch, calls } = upstream({
      login: [LOGIN_OK, LOGIN_OK],
      players: [() => json({ players: [apiPlayer()] }), () => json({}, status), () => json({ players: [apiPlayer()] })],
    });
    const d = deps(fetch);
    await handle(get('/v1/player/99999'), ENV, d);
    d.state.memory.clear();
    const response = await handle(get('/v1/player/99999'), ENV, d);
    expect(response.status).toBe(200);
    expect(calls.filter((call) => call.url.includes('/user/login'))).toHaveLength(2);
  });

  it('gives up after one retry and waits before the next login', async () => {
    const { fetch, calls } = upstream({
      login: [LOGIN_OK, LOGIN_OK],
      players: [() => json({}, 403), () => json({}, 403)],
    });
    const d = deps(fetch);
    const response = await handle(get('/v1/player/99999'), ENV, d);
    expect(response.status).toBe(503);
    expect(await handle(get('/v1/player/99999'), ENV, d)).toHaveProperty('status', 503);
    expect(calls).toHaveLength(4);
  });

  it('waits 10 minutes after a failed login', async () => {
    let now = NOW;
    const { fetch, calls } = upstream({
      login: [() => json({}, 401), LOGIN_OK],
      players: [() => json({ players: [apiPlayer()] })],
    });
    const d = deps(fetch, { now: () => now });
    expect((await handle(get('/v1/player/99999'), ENV, d)).status).toBe(503);
    now += LOGIN_BACKOFF_MS - 1;
    expect((await handle(get('/v1/player/99999'), ENV, d)).status).toBe(503);
    expect(calls).toHaveLength(1);
    now += 1;
    expect((await handle(get('/v1/player/99999'), ENV, d)).status).toBe(200);
  });

  it('does not log in without the secrets', async () => {
    const { fetch, calls } = upstream({});
    const response = await handle(get('/v1/player/99999'), { ALLOWED_ORIGINS: APP }, deps(fetch));
    expect(response.status).toBe(503);
    expect(calls).toEqual([]);
  });

  it('answers not-found for an empty players list', async () => {
    const { fetch } = upstream({ login: [LOGIN_OK], players: [() => json({ sessid: 'abc123', status: 0, players: [] })] });
    const response = await handle(get('/v1/player/99999'), ENV, deps(fetch));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not-found' });
  });

  it.each([
    ['a server error', () => new Response('<h1>Internal error at db-host-7</h1>', { status: 500 })],
    ['HTML instead of JSON', () => new Response('<html>Just a moment...</html>', { status: 200 })],
    ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError')) as unknown as Response],
    ['a players value that is not a list', () => json({ players: 'db-host-7' })],
  ])('maps %s to unavailable without upstream text', async (_, answer) => {
    const { fetch } = upstream({ login: [LOGIN_OK], players: [answer] });
    const response = await handle(get('/v1/player/99999'), ENV, deps(fetch));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"error":"unavailable"}');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('maps a 429 to rate-limited', async () => {
    const { fetch } = upstream({ login: [LOGIN_OK], players: [() => json({}, 429)] });
    const response = await handle(get('/v1/player/99999'), ENV, deps(fetch));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'rate-limited' });
  });

  it('answers rate-limited when the per-IP limit is reached, without calling PDGA', async () => {
    const { fetch, calls } = upstream({});
    const limit = vi.fn(async () => ({ success: false }));
    const request = get('/v1/player/99999');
    request.headers.set('CF-Connecting-IP', '192.0.2.1');
    const response = await handle(request, { ...ENV, RATE_LIMITER: { limit } }, deps(fetch));
    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: '192.0.2.1' });
    expect(calls).toEqual([]);
  });

  it('never puts the credentials in a response or a log', async () => {
    const log = vi.spyOn(console, 'log');
    const warn = vi.spyOn(console, 'warn');
    const err = vi.spyOn(console, 'error');
    const answers = [
      () => json({ players: [apiPlayer()] }),
      () => json({ error: PASSWORD }, 500),
      () => json({ players: [apiPlayer({ first_name: USERNAME })] }),
    ];
    for (const answer of answers) {
      const { fetch } = upstream({ login: [LOGIN_OK], players: [answer] });
      const response = await handle(get('/v1/player/99999'), ENV, deps(fetch));
      const text = await response.text();
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain('abc123');
    }
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('the cache', () => {
  it('keeps a found player for 6 hours', async () => {
    let now = NOW;
    const { fetch, calls } = upstream({
      login: [LOGIN_OK],
      players: [() => json({ players: [apiPlayer()] }), () => json({ players: [apiPlayer({ rating: '960' })] })],
    });
    const d = deps(fetch, { now: () => now });
    await handle(get('/v1/player/99999'), ENV, d);
    now += FOUND_TTL_MS - 1;
    const hit = await handle(get('/v1/player/99999'), ENV, d);
    expect(await hit.json()).toHaveProperty('rating', 950);
    expect(hit.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(hit.headers.get('Cache-Control')).toBe('max-age=3600');
    expect(calls).toHaveLength(2);
    now += 1;
    expect(await (await handle(get('/v1/player/99999'), ENV, d)).json()).toHaveProperty('rating', 960);
    expect(calls).toHaveLength(3);
  });

  it('keeps not found for 1 hour', async () => {
    let now = NOW;
    const { fetch, calls } = upstream({
      login: [LOGIN_OK],
      players: [() => json({ players: [] }), () => json({ players: [apiPlayer()] })],
    });
    const d = deps(fetch, { now: () => now });
    await handle(get('/v1/player/99999'), ENV, d);
    now += NOT_FOUND_TTL_MS - 1;
    expect((await handle(get('/v1/player/99999'), ENV, d)).status).toBe(404);
    now += 1;
    expect((await handle(get('/v1/player/99999'), ENV, d)).status).toBe(200);
    expect(calls).toHaveLength(3);
  });

  it('does not keep errors', async () => {
    const { fetch, calls } = upstream({
      login: [LOGIN_OK],
      players: [() => json({}, 500), () => json({ players: [apiPlayer()] })],
    });
    const d = deps(fetch);
    expect((await handle(get('/v1/player/99999'), ENV, d)).status).toBe(503);
    expect((await handle(get('/v1/player/99999'), ENV, d)).status).toBe(200);
    expect(calls).toHaveLength(3);
  });

  it('removes expired entries from memory', async () => {
    let now = NOW;
    const { fetch } = upstream({
      login: [LOGIN_OK],
      players: [() => json({ players: [apiPlayer()] }), () => json({ players: [apiPlayer({ pdga_number: '1' })] })],
    });
    const d = deps(fetch, { now: () => now });
    await handle(get('/v1/player/99999'), ENV, d);
    now += FOUND_TTL_MS;
    await handle(get('/v1/player/1'), ENV, d);
    expect([...d.state.memory.keys()]).toEqual([1]);
  });

  it('writes to and reads from the edge cache with the TTL', async () => {
    const store = new Map<string, Response>();
    const edgeCache: EdgeCache = {
      match: async (request) => store.get(request.url)?.clone(),
      put: async (request, response) => void store.set(request.url, response),
    };
    const waits: Promise<unknown>[] = [];
    const first = upstream({ login: [LOGIN_OK], players: [() => json({ players: [apiPlayer()] })] });
    await handle(get('/v1/player/99999'), ENV, deps(first.fetch, { edgeCache, waitUntil: (p) => waits.push(p) }));
    await Promise.all(waits);
    const [entry] = [...store.values()];
    expect(entry?.headers.get('Cache-Control')).toBe(`max-age=${FOUND_TTL_MS / 1000}`);

    // A new isolate with an empty memory finds it at the edge.
    const second = upstream({});
    const response = await handle(get('/v1/player/99999'), ENV, deps(second.fetch, { edgeCache }));
    expect(await response.json()).toHaveProperty('name', 'Test Player');
    expect(second.calls).toEqual([]);
  });
});

describe('mapPlayer', () => {
  const now = new Date(NOW);

  it('treats a missing list as not found and anything else as malformed', () => {
    expect(mapPlayer({ sessid: 'x', status: 0 }, 99999, now)).toBeNull();
    expect(mapPlayer({ players: [] }, 99999, now)).toBeNull();
    expect(mapPlayer({ players: {} }, 99999, now)).toBe('malformed');
    expect(mapPlayer('nope', 99999, now)).toBe('malformed');
    expect(mapPlayer(null, 99999, now)).toBe('malformed');
  });

  it('only takes the asked player', () => {
    expect(mapPlayer({ players: [apiPlayer({ pdga_number: '1' })] }, 99999, now)).toBeNull();
  });

  it('has no rating or date when PDGA gives none', () => {
    for (const rating of ['', 'n/a', '-5', '2001']) {
      const player = mapPlayer({ players: [apiPlayer({ rating, membership_status: 'expired', membership_expiration_date: '2025-12-31' })] }, 99999, now);
      expect(player).toMatchObject({ rating: null, ratingDate: null, membership: 'expired', membershipExpires: '2025-12-31' });
    }
    const { rating: _rating, rating_effective_date: _date, ...rest } = apiPlayer();
    expect(mapPlayer({ players: [rest] }, 99999, now)).toMatchObject({ rating: null, ratingDate: null });
  });

  it('maps membership without assuming exact strings', () => {
    const membership = (status: string, expires: string) =>
      (mapPlayer({ players: [apiPlayer({ membership_status: status, membership_expiration_date: expires })] }, 99999, now) as { membership: string }).membership;
    expect(membership('Current', '2026-12-31')).toBe('current');
    expect(membership('something new', '2026-01-01')).toBe('expired');
    expect(membership('', '2027-01-01')).toBe('none');
    expect(membership('', '')).toBe('none');
  });

  it('maps the classification', () => {
    const classification = (value: string) =>
      (mapPlayer({ players: [apiPlayer({ classification: value })] }, 99999, now) as { classification: string | null }).classification;
    expect(classification('P')).toBe('pro');
    expect(classification('a')).toBe('amateur');
    expect(classification('X')).toBeNull();
  });

  it('drops the fields the app does not use and trims long or odd text', () => {
    const player = mapPlayer({ players: [apiPlayer({ first_name: `  Te\u0000st${'x'.repeat(200)}`, last_name: '' })] }, 99999, now);
    expect(Object.keys(player as object).sort()).toEqual(
      ['classification', 'fetchedAt', 'membership', 'membershipExpires', 'name', 'pdgaNumber', 'rating', 'ratingDate'],
    );
    expect((player as { name: string }).name).toHaveLength(100);
    expect((player as { name: string }).name.startsWith('Test')).toBe(true);
  });

  it('reads dates with or without a time and rejects impossible ones', () => {
    expect(plainDate('2026-10-14')).toBe('2026-10-14');
    expect(plainDate('2026-10-14 00:00:00')).toBe('2026-10-14');
    expect(plainDate('2026-02-30')).toBeNull();
    expect(plainDate('14-Oct-2026')).toBeNull();
    expect(plainDate(20261014)).toBeNull();
  });
});
