/*
 * The Next Rating API Worker: two narrow routes on api.pdga.com with the
 * owner's account, one that looks up a player's official rating and
 * membership by PDGA number and one that searches players by name, each
 * answering trimmed objects. Everything it needs from outside (fetch,
 * the caches, the clock, the session state) is passed in, so tests run it
 * without Cloudflare or pdga.com.
 */

import { mapPlayer, mapSearch, type ApiPlayer, type SearchPlayer } from './player';

export const PDGA_API = 'https://api.pdga.com/services/json';

/** The same range as RANGES.id in src/parsers/values.ts (a test checks it). */
export const ID_RANGE = [1, 99_999_999] as const;

const UPSTREAM_TIMEOUT_MS = 8000;
/** Characters of an upstream answer; a one-player answer is far smaller. */
const UPSTREAM_MAX_LENGTH = 64_000;
/** After a failed login, no new login for this long. */
export const LOGIN_BACKOFF_MS = 10 * 60 * 1000;
export const FOUND_TTL_MS = 6 * 60 * 60 * 1000;
export const NOT_FOUND_TTL_MS = 60 * 60 * 1000;
export const SEARCH_TTL_MS = 60 * 60 * 1000;
/** Players and searches kept in isolate memory, so the cache stays small and temporary. */
const MEMORY_CACHE_SIZE = 500;
/** Players a name search answers with at most. */
export const SEARCH_LIMIT = 10;
/** Characters of a first or last name in a search. */
export const SEARCH_NAME_LENGTH = 40;
const BROWSER_MAX_AGE_S = 3600;

export type ErrorCode = 'bad-request' | 'forbidden' | 'not-found' | 'rate-limited' | 'unavailable';

/**
 * Why the Worker could not answer, sent with `unavailable` and
 * `rate-limited` so a failure can be told apart from the app. Never PDGA
 * text or a secret: a fixed word, and an HTTP status where there is one.
 */
export type Reason =
  | 'not-configured'
  | 'login-rejected'
  | 'login-malformed'
  | 'session-rejected'
  | 'upstream-status'
  | 'upstream-timeout'
  | 'upstream-network'
  | 'upstream-not-json'
  | 'upstream-too-large'
  | 'upstream-malformed';

interface Failure {
  reason: Reason;
  status?: number;
}

export interface Env {
  PDGA_USERNAME?: string;
  PDGA_PASSWORD?: string;
  /** Comma-separated origins that may call the Worker, such as https://peiza.github.io. */
  ALLOWED_ORIGINS?: string;
  RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/** Kept in isolate memory between requests; never written anywhere else. */
export interface WorkerState {
  /** `session_name=sessid` from the last login. */
  cookie: string | null;
  login: Promise<string | null> | null;
  loginBlockedUntil: number;
  /** Why the last login failed, reported while new logins wait. */
  loginFailure: Failure | null;
  memory: Map<number, CacheEntry>;
  /** Name searches, by their normalized query. */
  searches: Map<string, CacheEntry>;
}

interface CacheEntry {
  expires: number;
  body: string;
  status: number;
}

export interface Deps {
  fetch: typeof fetch;
  now: () => number;
  state: WorkerState;
  edgeCache?: EdgeCache | null;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export function createState(): WorkerState {
  return { cookie: null, login: null, loginBlockedUntil: 0, loginFailure: null, memory: new Map(), searches: new Map() };
}

class UpstreamError extends Error {
  readonly code: ErrorCode;
  readonly failure: Failure;
  constructor(code: ErrorCode, failure: Failure) {
    super(code);
    this.code = code;
    this.failure = failure;
  }
}

const STATUS: Record<ErrorCode, number> = {
  'bad-request': 400,
  forbidden: 403,
  'not-found': 404,
  'rate-limited': 429,
  unavailable: 503,
};

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function respond(body: string, status: number, origin: string | null, cache: 'store' | 'no-store'): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache === 'store' ? `max-age=${BROWSER_MAX_AGE_S}` : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return new Response(body, { status, headers });
}

function error(code: ErrorCode, origin: string | null, failure?: Failure): Response {
  return respond(JSON.stringify({ error: code, ...failure }), STATUS[code], origin, 'no-store');
}

/** The PDGA number in /v1/player/:n, or null for anything else. */
export function parseRoute(pathname: string): number | null {
  const match = /^\/v1\/player\/([1-9][0-9]{0,7})$/.exec(pathname);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return n >= ID_RANGE[0] && n <= ID_RANGE[1] ? n : null;
}

export interface SearchQuery {
  firstName: string | null;
  lastName: string | null;
}

/** Letters (any script), then letters, spaces, apostrophes, dots and hyphens. */
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'\u2019. -]*$/u;

function searchName(value: string | null): string | null | undefined {
  if (value === null) return null;
  const clean = value.trim().replace(/\s+/g, ' ');
  if (clean === '') return null;
  return clean.length <= SEARCH_NAME_LENGTH && NAME_PATTERN.test(clean) ? clean : undefined;
}

/** The names in /v1/players?first_name=&last_name=, at least one; null for anything else. */
export function parseSearch(url: URL): SearchQuery | null {
  if (url.pathname !== '/v1/players') return null;
  for (const key of url.searchParams.keys()) {
    if (key !== 'first_name' && key !== 'last_name') return null;
  }
  if (url.searchParams.getAll('first_name').length > 1 || url.searchParams.getAll('last_name').length > 1) return null;
  const firstName = searchName(url.searchParams.get('first_name'));
  const lastName = searchName(url.searchParams.get('last_name'));
  if (firstName === undefined || lastName === undefined || (firstName === null && lastName === null)) return null;
  return { firstName, lastName };
}

/** The search's query string, the same for the same names in any case. */
function searchParams({ firstName, lastName }: SearchQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (firstName) params.set('first_name', firstName.toLowerCase());
  if (lastName) params.set('last_name', lastName.toLowerCase());
  return params;
}

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
  if (new URL(request.url).pathname === '/health' && request.method === 'GET') return health(request, env, deps);
  const origin = allowedOrigin(request, env);
  // Only the app may call it. Browsers enforce CORS too; this also turns
  // away callers that send no Origin at all.
  if (!origin) return error('forbidden', null);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }
  if (request.method !== 'GET') return error('bad-request', origin);

  const url = new URL(request.url);
  const pdgaNumber = url.search === '' ? parseRoute(url.pathname) : null;
  const search = pdgaNumber === null ? parseSearch(url) : null;
  if (pdgaNumber === null && search === null) return error('bad-request', origin);

  if (env.RATE_LIMITER) {
    const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key });
    if (!success) return error('rate-limited', origin);
  }

  const key: CacheKey =
    pdgaNumber !== null
      ? { map: deps.state.memory, id: pdgaNumber, path: `/v1/player/${pdgaNumber}` }
      : { map: deps.state.searches, id: searchParams(search!).toString(), path: `/v1/players?${searchParams(search!)}` };
  const cached = await readCache(key, deps);
  if (cached) return respond(cached.body, cached.status, origin, 'store');

  try {
    if (search) {
      const players = await searchPlayers(search, env, deps);
      const body = JSON.stringify({ players });
      writeCache(key, body, 200, SEARCH_TTL_MS, deps);
      return respond(body, 200, origin, 'store');
    }
    const player = await lookup(pdgaNumber!, env, deps);
    const found = player !== null;
    const body = JSON.stringify(found ? player : { error: 'not-found' });
    const status = found ? 200 : STATUS['not-found'];
    writeCache(key, body, status, found ? FOUND_TTL_MS : NOT_FOUND_TTL_MS, deps);
    return respond(body, status, origin, 'store');
  } catch (e) {
    // Upstream text is never forwarded, and nothing is logged.
    if (e instanceof UpstreamError) return error(e.code, origin, e.failure);
    return error('unavailable', origin);
  }
}

/* The cache: isolate memory first, then the Cloudflare edge cache (which
 * only works on a custom domain, not on workers.dev). Both expire. */

/** Where an answer is kept: its memory map and key, and its path for the edge cache. */
interface CacheKey {
  map: Map<number, CacheEntry> | Map<string, CacheEntry>;
  id: number | string;
  path: string;
}

function edgeKey(key: CacheKey): Request {
  return new Request(`https://next-rating-api.cache${key.path}`);
}

type AnyMap = Map<number | string, CacheEntry>;

async function readCache(key: CacheKey, deps: Deps): Promise<{ body: string; status: number } | null> {
  const now = deps.now();
  for (const map of [deps.state.memory, deps.state.searches] as AnyMap[]) {
    for (const [id, entry] of map) {
      if (entry.expires <= now) map.delete(id);
    }
  }
  const entry = (key.map as AnyMap).get(key.id);
  if (entry) return entry;
  if (!deps.edgeCache) return null;
  try {
    const hit = await deps.edgeCache.match(edgeKey(key));
    if (!hit) return null;
    return { body: await hit.text(), status: hit.status };
  } catch {
    return null;
  }
}

function writeCache(key: CacheKey, body: string, status: number, ttl: number, deps: Deps): void {
  const memory = key.map as AnyMap;
  memory.delete(key.id);
  if (memory.size >= MEMORY_CACHE_SIZE) {
    const oldest = memory.keys().next();
    if (!oldest.done) memory.delete(oldest.value);
  }
  memory.set(key.id, { expires: deps.now() + ttl, body, status });
  if (!deps.edgeCache) return;
  const response = new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${Math.round(ttl / 1000)}` },
  });
  const put = deps.edgeCache.put(edgeKey(key), response).catch(() => undefined);
  if (deps.waitUntil) deps.waitUntil(put);
}

/* pdga.com */

function unavailable(reason: Reason, status?: number): UpstreamError {
  return new UpstreamError('unavailable', status === undefined ? { reason } : { reason, status });
}

async function upstream(url: string, init: RequestInit, deps: Deps): Promise<{ status: number; json: unknown }> {
  let response: Response;
  try {
    response = await deps.fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError';
    throw unavailable(timeout ? 'upstream-timeout' : 'upstream-network');
  }
  if (!response.ok) return { status: response.status, json: null };
  const text = await response.text().catch(() => '');
  if (text.length > UPSTREAM_MAX_LENGTH) throw unavailable('upstream-too-large', response.status);
  try {
    return { status: response.status, json: JSON.parse(text) as unknown };
  } catch {
    throw unavailable('upstream-not-json', response.status);
  }
}

const SESSION_PART = /^[A-Za-z0-9_,-]{1,200}$/;

/** The session cookie, or why the login failed. */
async function login(env: Env, deps: Deps): Promise<string | Failure> {
  const { PDGA_USERNAME: username, PDGA_PASSWORD: password } = env;
  if (!username || !password) return { reason: 'not-configured' };
  try {
    const { status, json } = await upstream(
      `${PDGA_API}/user/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username, password }),
      },
      deps,
    );
    if (status !== 200) return { reason: 'login-rejected', status };
    if (typeof json !== 'object' || json === null) return { reason: 'login-malformed' };
    const { session_name: name, sessid } = json as Record<string, unknown>;
    if (typeof name !== 'string' || typeof sessid !== 'string') return { reason: 'login-malformed' };
    if (!SESSION_PART.test(name) || !SESSION_PART.test(sessid)) return { reason: 'login-malformed' };
    return `${name}=${sessid}`;
  } catch (e) {
    return e instanceof UpstreamError ? e.failure : { reason: 'upstream-network' };
  }
}

/** The session cookie, logging in when there is none. One login at a time. */
async function session(env: Env, deps: Deps): Promise<string> {
  const state = deps.state;
  if (state.cookie) return state.cookie;
  if (!state.login) {
    if (deps.now() < state.loginBlockedUntil) throw new UpstreamError('unavailable', state.loginFailure ?? { reason: 'login-rejected' });
    state.login = login(env, deps).then((result) => {
      state.login = null;
      if (typeof result === 'string') {
        state.cookie = result;
        state.loginFailure = null;
        return result;
      }
      state.cookie = null;
      state.loginFailure = result;
      state.loginBlockedUntil = deps.now() + LOGIN_BACKOFF_MS;
      return null;
    });
  }
  const cookie = await state.login;
  if (!cookie) throw new UpstreamError('unavailable', state.loginFailure ?? { reason: 'login-rejected' });
  return cookie;
}

/** Asks api.pdga.com with the session, logging in again once when it has expired. */
async function ask(url: string, env: Env, deps: Deps): Promise<unknown> {
  let rejected = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const cookie = await session(env, deps);
    const { status, json } = await upstream(url, { headers: { Cookie: cookie, Accept: 'application/json' } }, deps);
    if (status === 401 || status === 403) {
      // The session expired: log in again, once.
      if (deps.state.cookie === cookie) deps.state.cookie = null;
      rejected = status;
      continue;
    }
    if (status === 429) throw new UpstreamError('rate-limited', { reason: 'upstream-status', status });
    if (status !== 200) throw unavailable('upstream-status', status);
    return json;
  }
  // A fresh login was turned away too, so the account cannot use the API
  // now: wait before the next login.
  deps.state.loginBlockedUntil = deps.now() + LOGIN_BACKOFF_MS;
  deps.state.loginFailure = { reason: 'session-rejected', status: rejected };
  throw unavailable('session-rejected', rejected);
}

/** The player, or null when PDGA has no player with that number. */
async function lookup(pdgaNumber: number, env: Env, deps: Deps): Promise<ApiPlayer | null> {
  const json = await ask(`${PDGA_API}/players?pdga_number=${pdgaNumber}&limit=1`, env, deps);
  const result = mapPlayer(json, pdgaNumber, new Date(deps.now()));
  if (result === 'malformed') throw unavailable('upstream-malformed');
  return result;
}

/** The players PDGA finds for the names, at most SEARCH_LIMIT; an empty list when none. */
async function searchPlayers(query: SearchQuery, env: Env, deps: Deps): Promise<SearchPlayer[]> {
  const params = new URLSearchParams();
  if (query.firstName) params.set('first_name', query.firstName);
  if (query.lastName) params.set('last_name', query.lastName);
  params.set('limit', String(SEARCH_LIMIT));
  const json = await ask(`${PDGA_API}/players?${params}`, env, deps);
  const result = mapSearch(json, new Date(deps.now()), SEARCH_LIMIT);
  if (result === 'malformed') throw unavailable('upstream-malformed');
  return result;
}

/* The health check, for the owner to open in a browser. */

/**
 * GET /health: whether the secrets are set (true or false only), whether a
 * PDGA login works and whether a one-player lookup answers, as fixed words
 * and HTTP statuses. Never PDGA data or a secret. It is a plain page view,
 * so it has no Origin; the per-IP limit still applies.
 */
async function health(request: Request, env: Env, deps: Deps): Promise<Response> {
  if (env.RATE_LIMITER) {
    const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key });
    if (!success) return error('rate-limited', null);
  }
  const report: Record<string, unknown> = {
    routes: ['/v1/player/:n', '/v1/players'],
    secrets: { username: Boolean(env.PDGA_USERNAME), password: Boolean(env.PDGA_PASSWORD) },
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  };
  try {
    const hadSession = deps.state.cookie !== null;
    await session(env, deps);
    report.login = hadSession ? 'ok (session kept)' : 'ok';
  } catch (e) {
    report.login = e instanceof UpstreamError ? e.failure : { reason: 'upstream-network' };
    return respond(JSON.stringify(report, null, 2), 200, null, 'no-store');
  }
  try {
    await ask(`${PDGA_API}/players?pdga_number=1&limit=1`, env, deps);
    report.lookup = 'ok';
  } catch (e) {
    report.lookup = e instanceof UpstreamError ? e.failure : { reason: 'upstream-network' };
  }
  return respond(JSON.stringify(report, null, 2), 200, null, 'no-store');
}
