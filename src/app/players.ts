import type { ImportParts } from '../handoff';
import { normalizePlayer } from '../parsers';
import { applyImport, hasPlayerRow, playerNumber } from './import';
import { MAX_FAVORITES, type AppData, type StoredPlayer } from './storage';

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
  const player: StoredPlayer = { pdgaNumber, favorite: true, import: existing?.import ?? null };
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

export interface Routed {
  data: AppData;
  /** The player the import was for, or null for event pages without a player. */
  owner: number | null;
  /** The players that received data, in list order. */
  players: number[];
  /** Event pages that could not go anywhere, since no player is stored. */
  noPlayer: boolean;
}

function withImport(data: AppData, player: StoredPlayer): AppData {
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
 * (its page header, or `owner`: the player page's URL or the number the
 * user confirmed for a pasted table) goes to that player, who becomes the
 * unsaved player when not stored yet. Event pages without a player go to
 * every stored player with a row in them, or else to the selected player.
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
    const player: StoredPlayer = { pdgaNumber, favorite: existing?.favorite ?? false, import: next };
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
