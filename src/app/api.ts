import { compareDates, isPlainDate, type PlainDate } from '../engine/dates';
import { RANGES } from '../parsers/values';

/*
 * The official rating lookup: the app's own Worker (worker/) asks the PDGA
 * API for one player's official rating and membership. Only the PDGA
 * number is sent, or the typed name in a player search. The answer is untrusted like an import, so it is checked
 * field by field. It is never fed into the engine: the prediction keeps
 * using the imported rounds and rating.
 *
 * The API license allows only temporary caching, so the answers are kept
 * under their own key for at most 12 hours, apart from the app's data.
 * Search results are never stored: they live in memory while shown.
 */

/** The Worker's origin, such as https://next-rating-api.example.workers.dev; '' turns every lookup off. */
export const API_URL: string = __API_URL__;

export type Membership = 'current' | 'expired' | 'none';

export interface ApiPlayer {
  pdgaNumber: number;
  name: string | null;
  rating: number | null;
  ratingDate: PlainDate | null;
  membership: Membership;
  membershipExpires: PlainDate | null;
  classification: 'pro' | 'amateur' | null;
  /** When the Worker asked PDGA, an ISO time. */
  fetchedAt: string;
}

/** What the app knows of a player's lookup while it is shown. */
export type ApiState =
  | { kind: 'loading' }
  | { kind: 'ok'; player: ApiPlayer }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

export type LookupResult =
  | { ok: true; player: ApiPlayer }
  | { ok: false; code: 'not-found' | 'unavailable' | 'off'; detail?: string };

/** Characters of an answer; a player is about 300. */
export const MAX_ANSWER = 4096;
export const LOOKUP_TIMEOUT_MS = 10_000;
const MAX_NAME = 100;
const MEMBERSHIPS: readonly Membership[] = ['current', 'expired', 'none'];

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function wholeIn(value: unknown, [min, max]: readonly [number, number]): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function dateOrNull(value: unknown): PlainDate | null | undefined {
  if (value === null) return null;
  return isPlainDate(value) ? value : undefined;
}

/** Reads the Worker's answer for this PDGA number, or null when any field is not valid. */
export function validateApiPlayer(value: unknown, pdgaNumber: number): ApiPlayer | null {
  const fields = record(value);
  if (!fields || fields.pdgaNumber !== pdgaNumber) return null;
  const { name, rating, membership, classification, fetchedAt } = fields;
  if (name !== null && (typeof name !== 'string' || name.length === 0 || name.length > MAX_NAME)) return null;
  if (rating !== null && !wholeIn(rating, RANGES.rating)) return null;
  const ratingDate = dateOrNull(fields.ratingDate);
  const membershipExpires = dateOrNull(fields.membershipExpires);
  if (ratingDate === undefined || membershipExpires === undefined) return null;
  const knownMembership = MEMBERSHIPS.find((one) => one === membership);
  if (!knownMembership) return null;
  if (classification !== null && classification !== 'pro' && classification !== 'amateur') return null;
  if (typeof fetchedAt !== 'string' || fetchedAt.length > 40 || Number.isNaN(Date.parse(fetchedAt))) return null;
  return {
    pdgaNumber,
    name,
    rating,
    ratingDate: rating === null ? null : ratingDate,
    membership: knownMembership,
    membershipExpires,
    classification,
    fetchedAt,
  };
}

export interface LookupOptions {
  /** The Worker's origin; '' makes no request. */
  url: string;
  /** False when Settings turned the lookup off. */
  enabled: boolean;
  /** navigator.onLine: offline makes no request. */
  online: boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Asks the Worker for one player, once. Never throws. */
export async function lookupPlayer(pdgaNumber: number, options: LookupOptions): Promise<LookupResult> {
  const { url, enabled, online, fetch: fetchFn = fetch, timeoutMs = LOOKUP_TIMEOUT_MS } = options;
  if (!url || !enabled || !online) return { ok: false, code: 'off' };
  try {
    const response = await fetchFn(`${url}/v1/player/${pdgaNumber}`, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) return { ok: false, code: 'not-found' };
    if (!response.ok) return { ok: false, code: 'unavailable', detail: await failureDetail(response) };
    const text = await response.text();
    if (text.length > MAX_ANSWER) return { ok: false, code: 'unavailable', detail: 'too-large' };
    let player: ApiPlayer | null = null;
    try {
      player = validateApiPlayer(JSON.parse(text), pdgaNumber);
    } catch {
      // Not JSON: the same as an answer that fails the check.
    }
    return player ? { ok: true, player } : { ok: false, code: 'unavailable', detail: 'invalid-answer' };
  } catch (e) {
    return { ok: false, code: 'unavailable', detail: fetchFailure(e) };
  }
}

/* The player search. */

/** A search result: the player and where they live, so players with the same name can be told apart. */
export interface SearchPlayer extends ApiPlayer {
  location: string | null;
}

export type SearchQuery = { pdgaNumber: number } | { firstName: string | null; lastName: string };

/** A failed search carries a short code that says why, such as "login-rejected 401", shown with the error. */
export type SearchResult = { ok: true; players: SearchPlayer[] } | { ok: false; code: 'unavailable' | 'off'; detail?: string };

/** Players the Worker answers a name search with at most. */
export const SEARCH_LIMIT = 10;
/** Characters of a search answer; ten players are about 3,500. */
export const MAX_SEARCH_ANSWER = 16_384;
/** The Worker's rule for a first or last name: letters (any script), spaces, apostrophes, dots and hyphens. */
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'’. -]*$/u;
const MAX_SEARCH_NAME = 40;

/**
 * What a typed search asks for: a PDGA number (spaces and "#" ignored), or
 * names. One word is the last name; with more, the first word is the first
 * name and the rest the last name, as on pdga.com. Null when it is empty
 * or not a name the Worker accepts.
 */
export function readSearch(text: string): SearchQuery | null {
  const digits = text.replace(/[\s#]/g, '');
  if (/^[0-9]+$/.test(digits)) {
    const pdgaNumber = Number(digits);
    return digits[0] !== '0' && pdgaNumber >= RANGES.id[0] && pdgaNumber <= RANGES.id[1] ? { pdgaNumber } : null;
  }
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const firstName = words.length > 1 ? words.shift()! : null;
  const lastName = words.join(' ');
  for (const name of [firstName, lastName]) {
    if (name !== null && (name.length > MAX_SEARCH_NAME || !NAME_PATTERN.test(name))) return null;
  }
  return { firstName, lastName };
}

/** Reads the Worker's answer to a name search, or null when any player in it is not valid. */
export function validateSearch(value: unknown): SearchPlayer[] | null {
  const players = record(value)?.players;
  if (!Array.isArray(players) || players.length > SEARCH_LIMIT) return null;
  const valid: SearchPlayer[] = [];
  for (const entry of players) {
    const fields = record(entry);
    if (!fields || !wholeIn(fields.pdgaNumber, RANGES.id)) return null;
    const player = validateApiPlayer(fields, fields.pdgaNumber);
    const { location } = fields;
    if (!player || (location !== null && (typeof location !== 'string' || location.length === 0 || location.length > MAX_NAME))) return null;
    if (valid.some((one) => one.pdgaNumber === player.pdgaNumber)) continue;
    valid.push({ ...player, location });
  }
  return valid;
}

/**
 * Why the Worker could not answer, from its error body: the error, its
 * reason and an HTTP status, such as "unavailable login-rejected 401".
 * Only fixed words and numbers get through, never other text.
 */
export async function failureDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const fields = text.length <= 400 ? record(JSON.parse(text)) : null;
    const word = (value: unknown) => (typeof value === 'string' && /^[a-z-]{1,40}$/.test(value) ? value : null);
    const status = wholeIn(fields?.status, [100, 599]) ? String(fields!.status) : null;
    const parts = [word(fields?.error), word(fields?.reason), status].filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
  } catch {
    // Not the Worker's JSON: the HTTP status says what there is.
  }
  return `http ${response.status}`;
}

/** "timeout", or "network" when the Worker could not be reached or the browser blocked its answer. */
function fetchFailure(e: unknown): string {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'TimeoutError' ? 'timeout' : 'network';
}

/** Asks the Worker for the players a search finds, once. Never throws; an empty list when PDGA finds no one. */
export async function searchPlayers(query: SearchQuery, options: LookupOptions): Promise<SearchResult> {
  const { url, enabled, online, fetch: fetchFn = fetch, timeoutMs = LOOKUP_TIMEOUT_MS } = options;
  if (!url || !enabled || !online) return { ok: false, code: 'off' };
  if ('pdgaNumber' in query) {
    const result = await lookupPlayer(query.pdgaNumber, options);
    if (result.ok) return { ok: true, players: [{ ...result.player, location: null }] };
    if (result.code === 'not-found') return { ok: true, players: [] };
    return result.detail ? { ok: false, code: result.code, detail: result.detail } : { ok: false, code: result.code };
  }
  const params = new URLSearchParams();
  if (query.firstName) params.set('first_name', query.firstName);
  params.set('last_name', query.lastName);
  try {
    const response = await fetchFn(`${url}/v1/players?${params}`, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { ok: false, code: 'unavailable', detail: await failureDetail(response) };
    const text = await response.text();
    if (text.length > MAX_SEARCH_ANSWER) return { ok: false, code: 'unavailable', detail: 'too-large' };
    let players: SearchPlayer[] | null = null;
    try {
      players = validateSearch(JSON.parse(text));
    } catch {
      // Not JSON: the same as an answer that fails the check.
    }
    return players ? { ok: true, players } : { ok: false, code: 'unavailable', detail: 'invalid-answer' };
  } catch (e) {
    return { ok: false, code: 'unavailable', detail: fetchFailure(e) };
  }
}

/** The player of a search result as the official rating lookup knows it. */
export function apiPlayerOf({ location: _location, ...player }: SearchPlayer): ApiPlayer {
  return player;
}

/**
 * PDGA published a newer rating than the imported one: its date is later
 * than the imported rating date, so the stored rounds are from before it.
 */
export function newerOfficial(player: ApiPlayer | null, importedDate: PlainDate | null): boolean {
  if (player?.rating == null || player.ratingDate === null) return false;
  return importedDate === null || compareDates(player.ratingDate, importedDate) > 0;
}

/* The temporary cache. */

export const API_CACHE_KEY = 'next-rating:api-cache';
export const API_CACHE_MS = 12 * 60 * 60 * 1000;
/** As many players as the app can keep, and a few more. */
const MAX_ENTRIES = 40;

interface CacheEntry {
  /** When this browser stored it, in ms. */
  storedAt: number;
  player: ApiPlayer;
}

export interface ApiCache {
  /** A fresh entry, or null. */
  get(pdgaNumber: number): ApiPlayer | null;
  set(player: ApiPlayer): void;
  delete(pdgaNumber: number): void;
  clear(): void;
  /** Deletes the expired entries. */
  purge(): void;
}

/** The cache in storage, or in memory only when storage is null. Every read deletes what has expired. */
export function createApiCache(storage: Storage | null, now: () => number = Date.now): ApiCache {
  let memory: Record<string, CacheEntry> = {};

  function read(): Record<string, CacheEntry> {
    if (!storage) return memory;
    try {
      const fields = record(JSON.parse(storage.getItem(API_CACHE_KEY) ?? '{}')) ?? {};
      const entries: Record<string, CacheEntry> = {};
      for (const [key, value] of Object.entries(fields)) {
        const entry = record(value);
        const pdgaNumber = Number(key);
        const player = entry && validateApiPlayer(entry.player, pdgaNumber);
        if (player && typeof entry.storedAt === 'number') entries[key] = { storedAt: entry.storedAt, player };
      }
      return entries;
    } catch {
      return {};
    }
  }

  function write(entries: Record<string, CacheEntry>): void {
    memory = entries;
    if (!storage) return;
    try {
      if (Object.keys(entries).length === 0) storage.removeItem(API_CACHE_KEY);
      else storage.setItem(API_CACHE_KEY, JSON.stringify(entries));
    } catch {
      // Full or blocked storage: the lookup is simply asked again next time.
    }
  }

  /** The fresh entries, written back when some had expired. */
  function fresh(): Record<string, CacheEntry> {
    const all = read();
    const time = now();
    const kept = Object.fromEntries(
      Object.entries(all).filter(([, entry]) => entry.storedAt <= time && time - entry.storedAt < API_CACHE_MS),
    );
    if (Object.keys(kept).length !== Object.keys(all).length) write(kept);
    return kept;
  }

  return {
    get: (pdgaNumber) => fresh()[pdgaNumber]?.player ?? null,
    set(player) {
      const entries: Record<string, CacheEntry> = { ...fresh(), [player.pdgaNumber]: { storedAt: now(), player } };
      const keys = Object.keys(entries).sort((a, b) => entries[a]!.storedAt - entries[b]!.storedAt);
      for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete entries[key];
      write(entries);
    },
    delete(pdgaNumber) {
      const entries = fresh();
      if (!(pdgaNumber in entries)) return;
      delete entries[pdgaNumber];
      write(entries);
    },
    clear: () => write({}),
    purge: () => void fresh(),
  };
}
