/*
 * The Next Rating API Worker: one narrow route that looks up a player's
 * official rating and membership on api.pdga.com with the owner's account
 * and answers a trimmed object. Everything it needs from outside (fetch,
 * the caches, the clock, the session state) is passed in, so tests run it
 * without Cloudflare or pdga.com.
 */

import { mapPlayer, type ApiPlayer } from './player';

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
/** Players kept in isolate memory, so the cache stays small and temporary. */
const MEMORY_CACHE_SIZE = 500;
const BROWSER_MAX_AGE_S = 3600;

export type ErrorCode = 'bad-request' | 'forbidden' | 'not-found' | 'rate-limited' | 'unavailable';

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
  memory: Map<number, { expires: number; body: string; status: number }>;
}

export interface Deps {
  fetch: typeof fetch;
  now: () => number;
  state: WorkerState;
  edgeCache?: EdgeCache | null;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export function createState(): WorkerState {
  return { cookie: null, login: null, loginBlockedUntil: 0, memory: new Map() };
}

class UpstreamError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
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

function error(code: ErrorCode, origin: string | null): Response {
  return respond(JSON.stringify({ error: code }), STATUS[code], origin, 'no-store');
}

/** The PDGA number in /v1/player/:n, or null for anything else. */
export function parseRoute(pathname: string): number | null {
  const match = /^\/v1\/player\/([1-9][0-9]{0,7})$/.exec(pathname);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return n >= ID_RANGE[0] && n <= ID_RANGE[1] ? n : null;
}

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
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

  const pdgaNumber = parseRoute(new URL(request.url).pathname);
  if (pdgaNumber === null) return error('bad-request', origin);

  if (env.RATE_LIMITER) {
    const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key });
    if (!success) return error('rate-limited', origin);
  }

  const cached = await readCache(pdgaNumber, deps);
  if (cached) return respond(cached.body, cached.status, origin, 'store');

  try {
    const player = await lookup(pdgaNumber, env, deps);
    const found = player !== null;
    const body = JSON.stringify(found ? player : { error: 'not-found' });
    const status = found ? 200 : STATUS['not-found'];
    writeCache(pdgaNumber, body, status, found ? FOUND_TTL_MS : NOT_FOUND_TTL_MS, deps);
    return respond(body, status, origin, 'store');
  } catch (e) {
    // Upstream text is never forwarded, and nothing is logged.
    return error(e instanceof UpstreamError ? e.code : 'unavailable', origin);
  }
}

/* The cache: isolate memory first, then the Cloudflare edge cache (which
 * only works on a custom domain, not on workers.dev). Both expire. */

function cacheKey(pdgaNumber: number): Request {
  return new Request(`https://next-rating-api.cache/v1/player/${pdgaNumber}`);
}

async function readCache(pdgaNumber: number, deps: Deps): Promise<{ body: string; status: number } | null> {
  const now = deps.now();
  for (const [key, entry] of deps.state.memory) {
    if (entry.expires <= now) deps.state.memory.delete(key);
  }
  const entry = deps.state.memory.get(pdgaNumber);
  if (entry) return entry;
  if (!deps.edgeCache) return null;
  try {
    const hit = await deps.edgeCache.match(cacheKey(pdgaNumber));
    if (!hit) return null;
    return { body: await hit.text(), status: hit.status };
  } catch {
    return null;
  }
}

function writeCache(pdgaNumber: number, body: string, status: number, ttl: number, deps: Deps): void {
  const memory = deps.state.memory;
  memory.delete(pdgaNumber);
  if (memory.size >= MEMORY_CACHE_SIZE) {
    const oldest = memory.keys().next();
    if (!oldest.done) memory.delete(oldest.value);
  }
  memory.set(pdgaNumber, { expires: deps.now() + ttl, body, status });
  if (!deps.edgeCache) return;
  const response = new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${Math.round(ttl / 1000)}` },
  });
  const put = deps.edgeCache.put(cacheKey(pdgaNumber), response).catch(() => undefined);
  if (deps.waitUntil) deps.waitUntil(put);
}

/* pdga.com */

async function upstream(url: string, init: RequestInit, deps: Deps): Promise<{ status: number; json: unknown }> {
  let response: Response;
  try {
    response = await deps.fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch {
    throw new UpstreamError('unavailable');
  }
  if (!response.ok) return { status: response.status, json: null };
  const text = await response.text().catch(() => '');
  if (text.length > UPSTREAM_MAX_LENGTH) throw new UpstreamError('unavailable');
  try {
    return { status: response.status, json: JSON.parse(text) as unknown };
  } catch {
    throw new UpstreamError('unavailable');
  }
}

const SESSION_PART = /^[A-Za-z0-9_,-]{1,200}$/;

async function login(env: Env, deps: Deps): Promise<string | null> {
  const { PDGA_USERNAME: username, PDGA_PASSWORD: password } = env;
  if (!username || !password) return null;
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
    if (status !== 200 || typeof json !== 'object' || json === null) return null;
    const { session_name: name, sessid } = json as Record<string, unknown>;
    if (typeof name !== 'string' || typeof sessid !== 'string') return null;
    if (!SESSION_PART.test(name) || !SESSION_PART.test(sessid)) return null;
    return `${name}=${sessid}`;
  } catch {
    return null;
  }
}

/** The session cookie, logging in when there is none. One login at a time. */
async function session(env: Env, deps: Deps): Promise<string> {
  const state = deps.state;
  if (state.cookie) return state.cookie;
  if (!state.login) {
    if (deps.now() < state.loginBlockedUntil) throw new UpstreamError('unavailable');
    state.login = login(env, deps).then((cookie) => {
      state.login = null;
      state.cookie = cookie;
      if (!cookie) state.loginBlockedUntil = deps.now() + LOGIN_BACKOFF_MS;
      return cookie;
    });
  }
  const cookie = await state.login;
  if (!cookie) throw new UpstreamError('unavailable');
  return cookie;
}

/** The player, or null when PDGA has no player with that number. */
async function lookup(pdgaNumber: number, env: Env, deps: Deps): Promise<ApiPlayer | null> {
  const url = `${PDGA_API}/players?pdga_number=${pdgaNumber}&limit=1`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const cookie = await session(env, deps);
    const { status, json } = await upstream(url, { headers: { Cookie: cookie, Accept: 'application/json' } }, deps);
    if (status === 401 || status === 403) {
      // The session expired: log in again, once.
      if (deps.state.cookie === cookie) deps.state.cookie = null;
      continue;
    }
    if (status === 429) throw new UpstreamError('rate-limited');
    if (status !== 200) throw new UpstreamError('unavailable');
    const result = mapPlayer(json, pdgaNumber, new Date(deps.now()));
    if (result === 'malformed') throw new UpstreamError('unavailable');
    return result;
  }
  // A fresh login was turned away too, so the account cannot use the API
  // now: wait before the next login.
  deps.state.loginBlockedUntil = deps.now() + LOGIN_BACKOFF_MS;
  throw new UpstreamError('unavailable');
}
