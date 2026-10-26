import { RANGES } from '../parsers/values';
import { findPlayer } from './players';
import { MAX_FAVORITES, type AppData, type StoredPlayer } from './storage';

/*
 * Syncing the favorites list between devices through the Worker (worker/src/
 * sync.ts), with no accounts: one list on the server that every device with
 * the secret token reads and writes. Only the favorites' PDGA numbers and
 * which of them is "me" are sent; imports, manual rounds and settings stay
 * on each device. The token travels as <app>#sync=<token>, in the fragment
 * that browsers never send to a server, and is kept in this browser's
 * storage under its own key.
 *
 * The whole list is sent on every change and the last write wins. Changes
 * from other devices come in when the app starts, when it comes back to the
 * foreground (at most every 20 seconds) and on Sync now; nothing polls.
 */

export const SYNC_PREFIX = '#sync=';
export const SYNC_KEY = 'next-rating:sync';
/** Changes made within this long are sent as one. */
export const PUSH_DELAY_MS = 1200;
/** Coming back to the foreground asks the server at most this often. */
export const PULL_INTERVAL_MS = 20_000;
export const SYNC_TIMEOUT_MS = 10_000;
/** Characters of an answer; a list of 200 players is about 2,000. */
const MAX_ANSWER = 8192;
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** What is synced: the favorites in the order they were added, and "me". */
export interface SyncList {
  players: number[];
  me: number | null;
}

export interface RemoteList extends SyncList {
  /** When the server last wrote it, in ms. */
  updatedAt: number;
}

/** What this browser keeps: the token, and the list as it was last sent or received. */
export interface SyncState {
  token: string;
  updatedAt: number;
  /** syncKey() of the list last sent or received. */
  sent: string;
}

export function syncList(data: AppData): SyncList {
  return { players: data.players.filter((player) => player.favorite).map((player) => player.pdgaNumber), me: data.me };
}

/** The same text for the same list, to tell whether anything changed. */
export function syncKey(list: SyncList): string {
  return JSON.stringify({ players: list.players, me: list.me });
}

export function isToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN.test(value);
}

function isPdgaNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= RANGES.id[0] && value <= RANGES.id[1];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Reads a list from the server, or null when anything in it is not valid. */
export function validateRemote(value: unknown): RemoteList | null {
  const fields = record(value);
  if (!fields || !Array.isArray(fields.players) || !isTime(fields.updatedAt)) return null;
  if (!fields.players.every(isPdgaNumber)) return null;
  const players = [...new Set(fields.players)];
  const me = isPdgaNumber(fields.me) && players.includes(fields.me) ? fields.me : null;
  return { players, me, updatedAt: fields.updatedAt };
}

export function validateState(value: unknown): SyncState | null {
  const fields = record(value);
  if (!fields || !isToken(fields.token) || !isTime(fields.updatedAt) || typeof fields.sent !== 'string') return null;
  return { token: fields.token, updatedAt: fields.updatedAt, sent: fields.sent };
}

/** The sync link, from the app's address without its fragment. */
export function syncLink(appUrl: string, token: string): string {
  const url = new URL(appUrl);
  url.hash = '';
  return `${url.href}${SYNC_PREFIX}${token}`;
}

/**
 * Takes a sync link's token out of the address, removing it at once, valid
 * or not, so the token does not stay in the address bar or the history.
 * Null without #sync=; '' when the token is not valid.
 */
export function takeSyncToken(): string | null {
  if (!location.hash.startsWith(SYNC_PREFIX)) return null;
  const token = location.hash.slice(SYNC_PREFIX.length);
  history.replaceState(history.state, '', location.pathname + location.search);
  return isToken(token) ? token : '';
}

/**
 * The favorites as the synced list has them: in its order, at most
 * MAX_FAVORITES. A player already stored keeps its import and manual
 * rounds; favorites not in the list are removed with their data, as on the
 * device that removed them. The unsaved player stays unless the list makes
 * it a favorite.
 */
export function applyRemote(data: AppData, remote: SyncList): AppData {
  const numbers = remote.players.slice(0, MAX_FAVORITES);
  const favorites: StoredPlayer[] = numbers.map((pdgaNumber) => {
    const existing = findPlayer(data, pdgaNumber);
    return existing
      ? { ...existing, favorite: true }
      : { pdgaNumber, favorite: true, import: null, manualRounds: [], leftOut: [] };
  });
  const unsaved = data.players.filter((player) => !player.favorite && !numbers.includes(player.pdgaNumber));
  const me = remote.me !== null && numbers.includes(remote.me) ? remote.me : null;
  return { ...data, me, players: [...favorites, ...unsaved] };
}

/** The synced list with this device's own extra favorites after it; "me" from the list, else this device's. */
export function mergeRemote(data: AppData, remote: SyncList): AppData {
  const local = syncList(data);
  const players = [...remote.players, ...local.players.filter((n) => !remote.players.includes(n))];
  return applyRemote(data, { players, me: remote.me ?? local.me });
}

/** This device's favorites that the synced list does not have. */
export function extraFavorites(data: AppData, remote: SyncList): number[] {
  return syncList(data).players.filter((n) => !remote.players.includes(n));
}

/* The Worker. */

export type SyncCall<T> = { ok: true; value: T } | { ok: false; code: 'not-found' | 'unavailable' };

export interface SyncOptions {
  /** The Worker's origin. */
  url: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

async function call<T>(
  method: string,
  path: string,
  body: SyncList | null,
  read: (value: unknown) => T | null,
  options: SyncOptions,
): Promise<SyncCall<T>> {
  const { url, fetch: fetchFn = fetch, timeoutMs = SYNC_TIMEOUT_MS } = options;
  try {
    const init: RequestInit = {
      method,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    };
    if (body) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = syncKey(body);
    }
    const response = await fetchFn(`${url}${path}`, init);
    if (response.status === 404) return { ok: false, code: 'not-found' };
    if (!response.ok) return { ok: false, code: 'unavailable' };
    const text = await response.text();
    const value = text.length <= MAX_ANSWER ? read(JSON.parse(text)) : null;
    return value === null ? { ok: false, code: 'unavailable' } : { ok: true, value };
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}

const readUpdatedAt = (value: unknown): number | null => {
  const updatedAt = record(value)?.updatedAt;
  return isTime(updatedAt) ? updatedAt : null;
};

export function createRemote(list: SyncList, options: SyncOptions): Promise<SyncCall<{ token: string; updatedAt: number }>> {
  return call('POST', '/v1/sync', list, (value) => {
    const token = record(value)?.token;
    const updatedAt = readUpdatedAt(value);
    return isToken(token) && updatedAt !== null ? { token, updatedAt } : null;
  }, options);
}

export function getRemote(token: string, options: SyncOptions): Promise<SyncCall<RemoteList>> {
  return call('GET', `/v1/sync/${token}`, null, validateRemote, options);
}

export function putRemote(token: string, list: SyncList, options: SyncOptions): Promise<SyncCall<number>> {
  return call('PUT', `/v1/sync/${token}`, list, readUpdatedAt, options);
}

export function deleteRemote(token: string, options: SyncOptions): Promise<SyncCall<true>> {
  return call('DELETE', `/v1/sync/${token}`, null, () => true, options);
}

/* What the app does with it. */

/** What Settings says about syncing; `gone` means another device deleted the list. */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'unavailable' | 'gone';

/** A sync link was opened on a device with favorites the list does not have: Merge or Replace. */
export interface JoinChoice {
  token: string;
  remote: RemoteList;
  extra: number[];
}

export interface SyncDeps extends SyncOptions {
  storage: Storage | null;
  now: () => number;
  getData: () => AppData;
  /** Stores data that came from the synced list. */
  setData: (data: AppData) => void;
  /** Something Settings shows changed. */
  onChange: () => void;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

export interface SyncController {
  state(): SyncState | null;
  status(): SyncStatus;
  /** When this device last heard from the server, in ms; null before. */
  lastSynced(): number | null;
  create(): Promise<void>;
  /** Opens a sync link: joins at once when nothing would be lost, else answers the choice. */
  join(token: string): Promise<JoinChoice | null>;
  finishJoin(choice: JoinChoice, mode: 'merge' | 'replace'): void;
  /** Called after every change of the data: sends the list when it differs from the last one sent. */
  changed(): void;
  /** Asks the server for changes; at most every PULL_INTERVAL_MS unless forced. */
  pull(force?: boolean): Promise<void>;
  syncNow(): Promise<void>;
  /** This device stops syncing; the list stays for the others. */
  stop(): void;
  /** Deletes the list on the server, for every device. */
  remove(): Promise<boolean>;
}

export function createSyncController(deps: SyncDeps): SyncController {
  const setTimer = deps.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  let memory: SyncState | null = null;
  let status: SyncStatus = 'idle';
  let lastSynced: number | null = null;
  let lastPull = -Infinity;
  let timer: unknown = null;
  let pushing = false;

  function read(): SyncState | null {
    if (!deps.storage) return memory;
    try {
      return validateState(JSON.parse(deps.storage.getItem(SYNC_KEY) ?? 'null'));
    } catch {
      return null;
    }
  }

  function write(state: SyncState | null): void {
    memory = state;
    if (!deps.storage) return;
    try {
      if (state) deps.storage.setItem(SYNC_KEY, JSON.stringify(state));
      else deps.storage.removeItem(SYNC_KEY);
    } catch {
      // Blocked storage: syncing lasts until the page is closed.
    }
  }

  function setStatus(next: SyncStatus): void {
    status = next;
    deps.onChange();
  }

  function heard(): void {
    lastSynced = deps.now();
  }

  function forget(next: SyncStatus): void {
    if (timer !== null) clearTimer(timer);
    timer = null;
    write(null);
    setStatus(next);
  }

  async function push(): Promise<void> {
    timer = null;
    const state = read();
    if (!state) return;
    const list = syncList(deps.getData());
    const key = syncKey(list);
    if (key === state.sent) return;
    pushing = true;
    setStatus('syncing');
    const result = await putRemote(state.token, list, deps);
    pushing = false;
    if (read()?.token !== state.token) return;
    if (result.ok) {
      write({ token: state.token, updatedAt: result.value, sent: key });
      heard();
      setStatus('synced');
      // Changed again while it was sent.
      controller.changed();
    } else if (result.code === 'not-found') {
      forget('gone');
    } else {
      setStatus('unavailable');
    }
  }

  function receive(token: string, remote: RemoteList): void {
    write({ token, updatedAt: remote.updatedAt, sent: syncKey(remote) });
    heard();
    deps.setData(applyRemote(deps.getData(), remote));
  }

  const controller: SyncController = {
    state: read,
    status: () => status,
    lastSynced: () => lastSynced,

    async create() {
      const list = syncList(deps.getData());
      setStatus('syncing');
      const result = await createRemote(list, deps);
      if (!result.ok) {
        setStatus('unavailable');
        return;
      }
      write({ token: result.value.token, updatedAt: result.value.updatedAt, sent: syncKey(list) });
      heard();
      lastPull = deps.now();
      setStatus('synced');
    },

    async join(token) {
      setStatus('syncing');
      const result = await getRemote(token, deps);
      if (!result.ok) {
        setStatus(result.code === 'not-found' ? 'gone' : 'unavailable');
        return null;
      }
      const extra = extraFavorites(deps.getData(), result.value);
      const choice = { token, remote: result.value, extra };
      if (extra.length > 0) {
        status = 'idle';
        return choice;
      }
      controller.finishJoin(choice, 'replace');
      return null;
    },

    finishJoin({ token, remote }, mode) {
      if (timer !== null) clearTimer(timer);
      timer = null;
      lastPull = deps.now();
      if (mode === 'replace') {
        receive(token, remote);
      } else {
        write({ token, updatedAt: remote.updatedAt, sent: syncKey(remote) });
        heard();
        deps.setData(mergeRemote(deps.getData(), remote));
      }
      setStatus('synced');
      controller.changed();
    },

    changed() {
      const state = read();
      if (!state || pushing) return;
      if (syncKey(syncList(deps.getData())) === state.sent) return;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => void push(), PUSH_DELAY_MS);
    },

    async pull(force = false) {
      const state = read();
      // A change of this device's own waits to be sent: it is not overwritten.
      if (!state || timer !== null || pushing) return;
      if (!force && deps.now() - lastPull < PULL_INTERVAL_MS) return;
      lastPull = deps.now();
      // A change that could not be sent before goes first, and wins.
      if (syncKey(syncList(deps.getData())) !== state.sent) {
        await push();
        return;
      }
      setStatus('syncing');
      const result = await getRemote(state.token, deps);
      const now = read();
      if (now?.token !== state.token) return;
      if (!result.ok) {
        if (result.code === 'not-found') forget('gone');
        else setStatus('unavailable');
        return;
      }
      if (result.value.updatedAt > now.updatedAt && timer === null && !pushing) receive(state.token, result.value);
      else heard();
      setStatus('synced');
    },

    async syncNow() {
      if (timer !== null) {
        clearTimer(timer);
        await push();
      }
      await controller.pull(true);
    },

    stop() {
      forget('idle');
    },

    async remove() {
      const state = read();
      if (!state) return true;
      setStatus('syncing');
      const result = await deleteRemote(state.token, deps);
      if (!result.ok && result.code !== 'not-found') {
        setStatus('unavailable');
        return false;
      }
      forget('idle');
      return true;
    },
  };
  return controller;
}
