import { compareDates, isPlainDate, type PlainDate } from '../engine/dates';
import { RANGES } from '../parsers/values';

/*
 * The official rating lookup: the app's own Worker (worker/) asks the PDGA
 * API for one player's official rating and membership. Only the PDGA
 * number is sent. The answer is untrusted like an import, so it is checked
 * field by field. It is never fed into the engine: the prediction keeps
 * using the imported rounds and rating.
 *
 * The API license allows only temporary caching, so the answers are kept
 * under their own key for at most 12 hours, apart from the app's data.
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

export type LookupResult = { ok: true; player: ApiPlayer } | { ok: false; code: 'not-found' | 'unavailable' | 'off' };

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
    if (!response.ok) return { ok: false, code: 'unavailable' };
    const text = await response.text();
    if (text.length > MAX_ANSWER) return { ok: false, code: 'unavailable' };
    const player = validateApiPlayer(JSON.parse(text), pdgaNumber);
    return player ? { ok: true, player } : { ok: false, code: 'unavailable' };
  } catch {
    return { ok: false, code: 'unavailable' };
  }
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
