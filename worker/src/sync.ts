/*
 * The synced favorites list: one list that several devices read and write
 * through a secret token, with no accounts. The list holds PDGA numbers and
 * which of them is "me", nothing else: no names, ratings or other PDGA data,
 * which the API license does not let anything keep. It is stored in
 * Cloudflare KV under the SHA-256 of the token, so the token itself is never
 * stored, and expires 400 days after its last write.
 */

import { ID_RANGE } from './handler';

/** The KV namespace's methods the sync uses. */
export interface ListStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface SyncedList {
  players: number[];
  me: number | null;
}

/** Players a synced list holds at most; the app keeps 30 favorites. */
export const MAX_SYNC_PLAYERS = 200;
/** Characters of a request body. */
export const MAX_SYNC_BODY = 32 * 1024;
/** A list nobody writes to for this long disappears by itself. */
export const SYNC_TTL_S = 400 * 24 * 60 * 60;
/** 24 random bytes as base64url. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export type SyncRoute = { kind: 'create' } | { kind: 'list'; token: string };

/** /v1/sync, or /v1/sync/<token>; null for anything else. */
export function parseSyncRoute(pathname: string): SyncRoute | null {
  if (pathname === '/v1/sync') return { kind: 'create' };
  const match = /^\/v1\/sync\/([^/]+)$/.exec(pathname);
  return match?.[1] && TOKEN_PATTERN.test(match[1]) ? { kind: 'list', token: match[1] } : null;
}

/**
 * Keeps only what a synced list may hold: whole PDGA numbers in range, each
 * once, at most MAX_SYNC_PLAYERS, and "me" when it is one of them. Every
 * other field is dropped, so names or ratings sent along are never stored.
 * Null when `players` is not a list of PDGA numbers.
 */
export function cleanList(value: unknown): SyncedList | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { players, me } = value as Record<string, unknown>;
  if (!Array.isArray(players) || players.length > MAX_SYNC_PLAYERS) return null;
  const clean: number[] = [];
  for (const n of players) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < ID_RANGE[0] || n > ID_RANGE[1]) return null;
    if (!clean.includes(n)) clean.push(n);
  }
  return { players: clean, me: typeof me === 'number' && clean.includes(me) ? me : null };
}

/** A new token: 24 bytes from the platform's secure random source, as 32 base64url characters. */
export function newToken(random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)): string {
  const bytes = random(new Uint8Array(24));
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_');
}

/** The KV key of a token's list: "list:" and the token's SHA-256 in hex. */
export async function listKey(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return `list:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** What a stored list reads back as, or null when it is not one. */
export function readStored(text: string | null): (SyncedList & { updatedAt: number }) | null {
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    const list = cleanList(value);
    const { updatedAt } = value;
    return list && typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? { ...list, updatedAt } : null;
  } catch {
    return null;
  }
}

export type SyncResult =
  | { status: 200 | 201; body: object }
  | { status: 400 | 404; error: 'bad-request' | 'not-found' };

export interface SyncDeps {
  lists: ListStore;
  now: () => number;
  random?: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array;
}

/** The body as a clean list, or null when it is too large, not JSON or not a list. */
async function bodyList(request: Request): Promise<SyncedList | null> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > MAX_SYNC_BODY) return null;
  const text = await request.text().catch(() => '');
  if (text.length > MAX_SYNC_BODY) return null;
  try {
    return cleanList(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * POST /v1/sync makes a list and answers its token; GET, PUT and DELETE on
 * /v1/sync/<token> read, replace and delete it. PUT replaces the whole list
 * (the last write wins) and never makes one: a deleted list stays deleted.
 */
export async function sync(request: Request, route: SyncRoute, deps: SyncDeps): Promise<SyncResult> {
  const { method } = request;
  if (route.kind === 'create') {
    if (method !== 'POST') return { status: 400, error: 'bad-request' };
    const list = await bodyList(request);
    if (!list) return { status: 400, error: 'bad-request' };
    const token = newToken(deps.random);
    const updatedAt = deps.now();
    await deps.lists.put(await listKey(token), JSON.stringify({ ...list, updatedAt }), { expirationTtl: SYNC_TTL_S });
    return { status: 201, body: { token, updatedAt } };
  }
  const key = await listKey(route.token);
  if (method === 'GET') {
    const stored = readStored(await deps.lists.get(key));
    return stored ? { status: 200, body: stored } : { status: 404, error: 'not-found' };
  }
  if (method === 'PUT') {
    const list = await bodyList(request);
    if (!list) return { status: 400, error: 'bad-request' };
    if (!readStored(await deps.lists.get(key))) return { status: 404, error: 'not-found' };
    const updatedAt = deps.now();
    await deps.lists.put(key, JSON.stringify({ ...list, updatedAt }), { expirationTtl: SYNC_TTL_S });
    return { status: 200, body: { updatedAt } };
  }
  if (method === 'DELETE') {
    await deps.lists.delete(key);
    return { status: 200, body: { deleted: true } };
  }
  return { status: 400, error: 'bad-request' };
}
