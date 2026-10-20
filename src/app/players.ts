import type { ImportParts } from '../handoff';
import { normalizePlayer } from '../parsers';
import { applyImport, eventKey, hasPlayerRow, playerNumber } from './import';
import {
  MAX_FAVORITES,
  MAX_LEFT_OUT,
  MAX_MANUAL_ROUNDS,
  type AppData,
  type PlayerOrder,
  type StoredManualRound,
  type StoredPlayer,
} from './storage';

/*
 * The stored players: favorites, "me" (the favorite the app opens on) and at
 * most one unsaved player, the latest one imported without being a favorite.
 * Pure functions from data to data; main.ts stores the result.
 */

export function findPlayer(data: AppData, pdgaNumber: number | null): StoredPlayer | undefined {
  return data.players.find((player) => player.pdgaNumber === pdgaNumber);
}

/** The player's name from the last import, or '' before one. */
export function playerName(player: StoredPlayer): string {
  return player.import?.player ? normalizePlayer(player.import.player).name : '';
}

/** Who the app shows when it opens: me, else the first favorite, else the unsaved player. */
export function initialSelection(data: AppData): number | null {
  return data.me ?? data.players.find((player) => player.favorite)?.pdgaNumber ?? data.players[0]?.pdgaNumber ?? null;
}

/**
 * The order the players panel lists players in: "me" first, then by name in
 * the locale's alphabet (players without a name yet after, by number), or
 * newest import first (never imported last).
 */
export function sortFavorites(
  players: readonly StoredPlayer[],
  me: number | null,
  order: PlayerOrder,
  locale: string,
): StoredPlayer[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const byName = (a: StoredPlayer, b: StoredPlayer): number => {
    const [first, second] = [playerName(a), playerName(b)];
    if (!first !== !second) return first ? -1 : 1;
    return collator.compare(first, second) || a.pdgaNumber - b.pdgaNumber;
  };
  const byUpdated = (a: StoredPlayer, b: StoredPlayer): number => {
    // ISO timestamps sort as strings; no import sorts as the oldest.
    const [first, second] = [a.import?.at ?? '', b.import?.at ?? ''];
    return first === second ? byName(a, b) : first < second ? 1 : -1;
  };
  const isMe = (player: StoredPlayer) => (player.pdgaNumber === me ? 1 : 0);
  return [...players].sort((a, b) => isMe(b) - isMe(a) || (order === 'name' ? byName : byUpdated)(a, b));
}

export function favoriteCount(data: AppData): number {
  return data.players.filter((player) => player.favorite).length;
}

/**
 * Saves a player as a favorite. The unsaved player keeps its import. When
 * the list is full, the data comes back unchanged.
 */
export function addFavorite(data: AppData, pdgaNumber: number): AppData {
  const existing = findPlayer(data, pdgaNumber);
  if (existing?.favorite) return data;
  if (favoriteCount(data) >= MAX_FAVORITES) return data;
  const player: StoredPlayer = {
    pdgaNumber,
    favorite: true,
    import: existing?.import ?? null,
    manualRounds: existing?.manualRounds ?? [],
    leftOut: existing?.leftOut ?? [],
  };
  // Favorites keep the order they were added in, ahead of the unsaved player.
  const others = data.players.filter((other) => other.pdgaNumber !== pdgaNumber);
  return { ...data, players: [...others.filter((other) => other.favorite), player, ...others.filter((other) => !other.favorite)] };
}

/** Removes a player and everything stored for it. */
export function removePlayer(data: AppData, pdgaNumber: number): AppData {
  return {
    ...data,
    me: data.me === pdgaNumber ? null : data.me,
    players: data.players.filter((player) => player.pdgaNumber !== pdgaNumber),
  };
}

/** Makes a player "me", saving it as a favorite first; null clears it. */
export function setMe(data: AppData, pdgaNumber: number | null): AppData {
  if (pdgaNumber === null) return { ...data, me: null };
  const next = addFavorite(data, pdgaNumber);
  return findPlayer(next, pdgaNumber)?.favorite ? { ...next, me: pdgaNumber } : data;
}

/** A manual round as typed in, before it gets an id. */
export type ManualRoundInput = Omit<StoredManualRound, 'id'>;

export interface AddedRound {
  data: AppData;
  /** Why the round was not added; the data then comes back unchanged. */
  error: 'favorites-full' | 'rounds-full' | null;
  /** True when adding the round saved the unsaved player as a favorite. */
  savedFavorite: boolean;
}

function replacePlayer(data: AppData, player: StoredPlayer): AppData {
  return { ...data, players: data.players.map((other) => (other.pdgaNumber === player.pdgaNumber ? player : other)) };
}

/**
 * Adds a manual round to a stored player. The unsaved player is saved as a
 * favorite first, since the next import of another player would replace it
 * and its rounds.
 */
export function addManualRound(data: AppData, pdgaNumber: number, round: ManualRoundInput): AddedRound {
  const existing = findPlayer(data, pdgaNumber);
  if (!existing) return { data, error: null, savedFavorite: false };
  if (existing.manualRounds.length >= MAX_MANUAL_ROUNDS) return { data, error: 'rounds-full', savedFavorite: false };
  const saved = existing.favorite ? data : addFavorite(data, pdgaNumber);
  if (saved === data && !existing.favorite) return { data, error: 'favorites-full', savedFavorite: false };
  const player = findPlayer(saved, pdgaNumber)!;
  const highest = Math.max(0, ...player.manualRounds.map(({ id }) => Number(id.slice(1))));
  const manualRounds = [...player.manualRounds, { id: `m${highest + 1}`, ...round }];
  return { data: replacePlayer(saved, { ...player, manualRounds }), error: null, savedFavorite: !existing.favorite };
}

export function removeManualRound(data: AppData, pdgaNumber: number, id: string): AppData {
  const player = findPlayer(data, pdgaNumber);
  if (!player) return data;
  return replacePlayer(data, { ...player, manualRounds: player.manualRounds.filter((round) => round.id !== id) });
}

/**
 * Undo for a delete: puts the same round (same id) back where it was, so the
 * list order and the prediction are exactly as before. Does nothing when the
 * player is gone, the id is taken again or the rounds are full.
 */
export function restoreManualRound(data: AppData, pdgaNumber: number, round: StoredManualRound, index: number): AppData {
  const player = findPlayer(data, pdgaNumber);
  if (!player || player.manualRounds.length >= MAX_MANUAL_ROUNDS) return data;
  if (player.manualRounds.some(({ id }) => id === round.id)) return data;
  const manualRounds = [...player.manualRounds];
  manualRounds.splice(Math.min(Math.max(index, 0), manualRounds.length), 0, round);
  return replacePlayer(data, { ...player, manualRounds });
}

export function clearManualRounds(data: AppData, pdgaNumber: number): AppData {
  const player = findPlayer(data, pdgaNumber);
  return player ? replacePlayer(data, { ...player, manualRounds: [] }) : data;
}

/**
 * Leaves an unofficial event out of the player's prediction, or counts it
 * again. Stored per player, by event key.
 */
export function setLeftOut(data: AppData, pdgaNumber: number, key: string, leftOut: boolean): AppData {
  const player = findPlayer(data, pdgaNumber);
  if (!player || player.leftOut.includes(key) === leftOut) return data;
  if (leftOut && player.leftOut.length >= MAX_LEFT_OUT) return data;
  const keys = leftOut ? [...player.leftOut, key] : player.leftOut.filter((other) => other !== key);
  return replacePlayer(data, { ...player, leftOut: keys });
}

export interface Routed {
  data: AppData;
  /** The player the import was for, or null for event pages without a player. */
  owner: number | null;
  /** The players that received data, in list order. */
  players: number[];
  /** Event pages that could not go anywhere, since no player is stored. */
  noPlayer: boolean;
}

/**
 * Stores a player's new import. Left-out events that are no longer stored,
 * such as an event now in the ratings details, are forgotten.
 */
function withImport(data: AppData, imported: StoredPlayer): AppData {
  const stored = new Set((imported.import?.events ?? []).map(eventKey));
  const player = { ...imported, leftOut: imported.leftOut.filter((key) => stored.has(key)) };
  const exists = data.players.some((other) => other.pdgaNumber === player.pdgaNumber);
  return {
    ...data,
    players: exists
      ? data.players.map((other) => (other.pdgaNumber === player.pdgaNumber ? player : other))
      : // A new unsaved player replaces the earlier one.
        [...data.players.filter((other) => other.favorite), player],
  };
}

/**
 * Stores an import with the players it belongs to. An import with a player
 * (its page header, or `owner`: the player page's URL) goes to that player,
 * who becomes the unsaved player when not stored yet. Event pages without a
 * player go to every stored player with a row in them, or else to the
 * selected player.
 */
export function routeImport(
  data: AppData,
  parts: ImportParts,
  at: string,
  owner: number | null,
  selected: number | null,
): Routed {
  const pdgaNumber = playerNumber(parts.player) ?? owner;
  if (pdgaNumber !== null) {
    const existing = findPlayer(data, pdgaNumber);
    const before = existing?.import ?? null;
    const next = applyImport(before, parts, at, pdgaNumber);
    if (next === before) return { data, owner: pdgaNumber, players: [], noPlayer: false };
    const player: StoredPlayer = {
      pdgaNumber,
      favorite: existing?.favorite ?? false,
      import: next,
      manualRounds: existing?.manualRounds ?? [],
      leftOut: existing?.leftOut ?? [],
    };
    return { data: withImport(data, player), owner: pdgaNumber, players: [pdgaNumber], noPlayer: false };
  }

  const events = parts.events ?? [];
  if (events.length === 0) return { data, owner: null, players: [], noPlayer: false };
  if (data.players.length === 0) return { data, owner: null, players: [], noPlayer: true };
  let targets = data.players
    .map((player) => ({ player, events: events.filter((event) => hasPlayerRow(event, player.pdgaNumber)) }))
    .filter((target) => target.events.length > 0);
  if (targets.length === 0) {
    const fallback = findPlayer(data, selected) ?? findPlayer(data, initialSelection(data))!;
    targets = [{ player: fallback, events }];
  }
  let next = data;
  for (const { player, events: own } of targets) {
    next = withImport(next, { ...player, import: applyImport(player.import, { events: own }, at, player.pdgaNumber) });
  }
  return { data: next, owner: null, players: targets.map(({ player }) => player.pdgaNumber), noPlayer: false };
}
