import { RANGES } from '../parsers/values';
import { addFavorite, findPlayer } from './players';
import { MAX_FAVORITES, type AppData } from './storage';

/*
 * Sharing the favorites list: a link that carries only PDGA numbers, as
 * #add=1001,1002 after the app's address. No server is involved: the numbers
 * travel in the fragment, which browsers never send to a server, and the
 * receiving app adds them as favorites. The two lists are independent
 * afterwards.
 */

export const SHARE_PREFIX = '#add=';
/** Players a shared link adds at most. */
export const MAX_SHARED = 50;
/** Characters after #add= that are read at most: 50 eight-digit numbers and their commas. */
const MAX_SHARED_TEXT = MAX_SHARED * 9;
const NUMBER = /^[1-9][0-9]{0,7}$/;

/** The favorites a shared link carries: "me" first, then the others in the order they were added. */
export function sharedNumbers(data: AppData): number[] {
  const favorites = data.players.filter((player) => player.favorite).map((player) => player.pdgaNumber);
  return data.me !== null && favorites.includes(data.me) ? [data.me, ...favorites.filter((n) => n !== data.me)] : favorites;
}

/** The link that shares these PDGA numbers, from the app's address without its fragment. */
export function shareLink(appUrl: string, numbers: readonly number[]): string {
  const url = new URL(appUrl);
  url.hash = '';
  return `${url.href}${SHARE_PREFIX}${numbers.join(',')}`;
}

/**
 * The PDGA numbers in a shared link's fragment (after #add=), each once and
 * at most MAX_SHARED, or null when the text is not a list of PDGA numbers.
 */
export function readShared(text: string): number[] | null {
  if (text.length === 0 || text.length > MAX_SHARED_TEXT) return null;
  const numbers: number[] = [];
  for (const part of text.split(',')) {
    if (!NUMBER.test(part)) return null;
    const n = Number(part);
    if (n < RANGES.id[0] || n > RANGES.id[1]) return null;
    if (!numbers.includes(n)) numbers.push(n);
  }
  return numbers.slice(0, MAX_SHARED);
}

/**
 * Takes a shared list out of the address. The fragment is removed straight
 * away, valid or not, so it does not stay in the address bar or the history.
 * Null when the address has no #add=; an empty list when it is not valid.
 */
export function takeShared(): number[] | null {
  if (!location.hash.startsWith(SHARE_PREFIX)) return null;
  const text = location.hash.slice(SHARE_PREFIX.length);
  history.replaceState(history.state, '', location.pathname + location.search);
  return readShared(text) ?? [];
}

/** What a shared list would add: the players not yet favorites, as many as there is room for. */
export interface ShareOffer {
  /** The players to add, in the link's order. */
  numbers: number[];
  /** Players in the link that are favorites already. */
  known: number;
  /** Players left out because the favorites list would be full. */
  overflow: number;
}

export function shareOffer(data: AppData, shared: readonly number[]): ShareOffer {
  const fresh = shared.filter((n) => !findPlayer(data, n)?.favorite);
  const room = Math.max(0, MAX_FAVORITES - data.players.filter((player) => player.favorite).length);
  return { numbers: fresh.slice(0, room), known: shared.length - fresh.length, overflow: Math.max(0, fresh.length - room) };
}

/** Adds the offered players as favorites, without imports, in the link's order. */
export function addShared(data: AppData, numbers: readonly number[]): { data: AppData; added: number[] } {
  let next = data;
  const added: number[] = [];
  for (const n of numbers) {
    const before = next;
    next = addFavorite(next, n);
    if (next !== before) added.push(n);
  }
  return { data: next, added };
}
