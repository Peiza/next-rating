import { compareDates, isPlainDate, type PlainDate } from '../engine/dates';
import { isBookmarkletVersion } from '../handoff/envelope';
import { normalizePlayer } from '../parsers';
import { parseInteger, RANGES } from '../parsers/values';
import { applyImport, playerNumber, validateStoredImport, type StoredImport } from './import';

/*
 * Everything the app keeps is stored under one versioned key in
 * localStorage, and only in this browser. Stored data is validated like an
 * import when it is read back. When storage is unavailable or full, as in
 * some private windows, the app keeps working with an in-memory copy.
 */

export const STORAGE_KEY = 'next-rating:v2';
/** The format with one player, migrated to v2 on first load. */
export const V1_KEY = 'next-rating:v1';

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** How dates read when Settings overrides the automatic format: 2026-10-21, 21/10/2026 or 10/21/2026. */
export const DATE_ORDERS = ['year', 'day', 'month'] as const;
export type DateOrder = (typeof DATE_ORDERS)[number];

/** How the players panel orders favorites after "me": by name, or newest import first. */
export const PLAYER_ORDERS = ['name', 'updated'] as const;
export type PlayerOrder = (typeof PLAYER_ORDERS)[number];

/** Who the app opens on: "me" (the default), or the player shown last. */
export const OPEN_WITH = ['me', 'last'] as const;
export type OpenWith = (typeof OPEN_WITH)[number];

/** The collapsible cards on the Rating tab, in the order they show. */
export const CARDS = ['why', 'chart', 'manual', 'target', 'top8', 'stats', 'rounds'] as const;
export type CardName = (typeof CARDS)[number];
export type CardState = Readonly<Record<CardName, boolean>>;

/** Only Rounds starts open. */
export const DEFAULT_CARDS: CardState = {
  why: false,
  chart: false,
  manual: false,
  target: false,
  top8: false,
  stats: false,
  rounds: true,
};

/**
 * The Top 8 period: a calendar year (null follows today's year, the
 * default), the window the prediction uses, or dates of the user's choice,
 * both inclusive.
 */
export type TopPeriod =
  | { kind: 'year'; year: number | null }
  | { kind: 'window' }
  | { kind: 'custom'; from: PlainDate; to: PlainDate };

export const DEFAULT_TOP_PERIOD: TopPeriod = { kind: 'year', year: null };

/** The chart's period: the last 24 months (the default), or a period as in the Top 8. */
export type ChartPeriod = { kind: 'recent' } | TopPeriod;

export const DEFAULT_CHART_PERIOD: ChartPeriod = { kind: 'recent' };

/** The chart's x-axis: by date (the default), or the same width for every round. */
export const CHART_AXES = ['time', 'even'] as const;
export type ChartAxis = (typeof CHART_AXES)[number];
/** The years a stored Top 8 period can name. */
const TOP_YEARS = [1970, 2200] as const;

export const MAX_FAVORITES = 30;
export const MAX_MANUAL_ROUNDS = 200;
export const MAX_EVENT_NAME = 100;
/** Events a player can have left out; the stored events are fewer (MAX_EVENTS). */
export const MAX_LEFT_OUT = 50;

/** A round the user typed in. Its date may lie ahead, for a round at an upcoming event. */
export interface StoredManualRound {
  /** "m1", "m2" and so on, unique within the player. */
  id: string;
  rating: number;
  date: PlainDate;
  /** '' when not given. Rounds with the same name and date form one event. */
  eventName: string;
  /** Null when not given, which counts as 18. */
  holes: number | null;
}

export interface StoredPlayer {
  pdgaNumber: number;
  /** False only for the one player kept without being saved as a favorite. */
  favorite: boolean;
  /** The imported pdga.com data, or null before the first import. */
  import: StoredImport | null;
  /** Rounds typed in by the user, in the order they were added. */
  manualRounds: StoredManualRound[];
  /**
   * Event keys of the unofficial events the user left out of the
   * prediction, such as X-tier events that may not count. Only keys of
   * stored events are kept (players.ts prunes the rest on import).
   */
  leftOut: string[];
}

export interface AppData {
  /** The language picked in Settings; null follows the device. */
  language: string | null;
  /** The theme picked in Settings; null follows the device. */
  theme: Theme | null;
  /** The date format picked in Settings; null follows the app's language and the device's region. */
  dateOrder: DateOrder | null;
  /** The order picked in the players panel. */
  playerOrder: PlayerOrder;
  /** Which Rating tab cards are open, the same for every player. */
  cards: CardState;
  /** The Top 8 period, the same for every player. */
  top8Period: TopPeriod;
  /** The chart period, the same for every player. */
  chartPeriod: ChartPeriod;
  /** The chart's x-axis, the same for every player. */
  chartAxis: ChartAxis;
  /** Whether the chart's "Show as table" is open, the same for every player. */
  chartTable: boolean;
  /** Whether the Top 8 counts manual rounds too, the same for every player. */
  top8Own: boolean;
  /** The bookmarklet version of the last hand-off in this browser, or null before one. */
  bookmarklet: string | null;
  /** The favorite the app opens on. */
  me: number | null;
  /** Whether the app opens on "me" or on the player shown last. */
  openWith: OpenWith;
  /** The player shown last, kept only while `openWith` is 'last'; null when unknown. */
  lastViewed: number | null;
  /** Favorites in the order they were added, and at most one unsaved player. */
  players: StoredPlayer[];
}

export const EMPTY_DATA: AppData = {
  language: null,
  theme: null,
  dateOrder: null,
  playerOrder: 'name',
  cards: DEFAULT_CARDS,
  top8Period: DEFAULT_TOP_PERIOD,
  top8Own: false,
  chartPeriod: DEFAULT_CHART_PERIOD,
  chartAxis: 'time',
  chartTable: false,
  bookmarklet: null,
  me: null,
  openWith: 'me',
  lastViewed: null,
  players: [],
};

const LANGUAGE_CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

function pdgaNumberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? parseInteger(String(value), RANGES.id) : null;
}

function wholeIn(value: unknown, [min, max]: readonly [number, number]): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** An import is kept only under its own player's number. */
function importOf(value: unknown, pdgaNumber: number): StoredImport | null {
  const stored = validateStoredImport(value);
  if (!stored?.player) return stored;
  return normalizePlayer(stored.player).pdgaNumber === pdgaNumber ? stored : null;
}

const MANUAL_ID = /^m\d{1,9}$/;

/** Reads one manual round, or null when any field is not valid. Dates are not checked against today. */
export function validateManualRound(value: unknown): StoredManualRound | null {
  const fields = record(value);
  if (!fields) return null;
  const { id, rating, date, eventName, holes } = fields;
  if (typeof id !== 'string' || !MANUAL_ID.test(id)) return null;
  if (!wholeIn(rating, RANGES.rating) || !isPlainDate(date)) return null;
  if (typeof eventName !== 'string' || eventName.length > MAX_EVENT_NAME) return null;
  if (holes !== null && !wholeIn(holes, RANGES.holes)) return null;
  return { id, rating, date, eventName, holes };
}

/** Manual rounds one at a time, so a bad one costs only itself. Data saved before they existed has none. */
function validateManualRounds(value: unknown): StoredManualRound[] {
  if (!Array.isArray(value)) return [];
  const rounds: StoredManualRound[] = [];
  for (const item of value) {
    const round = validateManualRound(item);
    if (!round || rounds.some((other) => other.id === round.id)) continue;
    if (rounds.length >= MAX_MANUAL_ROUNDS) break;
    rounds.push(round);
  }
  return rounds;
}

/** An event key as the parsers make it: "e:" and a pdga.com event id, or "n:" and the event's name and date. */
const EVENT_KEY = /^(?:e:\d{1,9}|n:.{1,300})$/s;

/** Left-out events one at a time, so a bad key costs only itself. Data saved before they existed has none. */
function validateLeftOut(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const keys = value.filter((key): key is string => typeof key === 'string' && EVENT_KEY.test(key));
  return [...new Set(keys)].slice(0, MAX_LEFT_OUT);
}

/** Each card on its own, so a bad value costs only that card. */
function validateCards(value: unknown): CardState {
  const fields = record(value) ?? {};
  return Object.fromEntries(
    CARDS.map((name) => [name, typeof fields[name] === 'boolean' ? fields[name] : DEFAULT_CARDS[name]]),
  ) as Record<CardName, boolean>;
}

/** A stored year, window or custom range, or null when not valid. */
function topPeriodOf(value: unknown): TopPeriod | null {
  const fields = record(value);
  if (fields?.kind === 'window') return { kind: 'window' };
  if (fields?.kind === 'year') {
    if (fields.year === null) return { kind: 'year', year: null };
    if (wholeIn(fields.year, TOP_YEARS)) return { kind: 'year', year: fields.year };
  }
  if (fields?.kind === 'custom') {
    const { from, to } = fields;
    if (isPlainDate(from) && isPlainDate(to) && compareDates(from, to) <= 0) return { kind: 'custom', from, to };
  }
  return null;
}

/** Reads a stored Top 8 period; anything not valid is the current year. */
export function validateTopPeriod(value: unknown): TopPeriod {
  return topPeriodOf(value) ?? DEFAULT_TOP_PERIOD;
}

/** Reads a stored chart period; anything not valid is the last 24 months. */
export function validateChartPeriod(value: unknown): ChartPeriod {
  return topPeriodOf(value) ?? DEFAULT_CHART_PERIOD;
}

/** Reads one stored player, or null without a valid number. A bad import loses only the import. */
export function validatePlayer(value: unknown): StoredPlayer | null {
  const fields = record(value);
  const pdgaNumber = pdgaNumberOf(fields?.pdgaNumber);
  if (!fields || pdgaNumber === null || typeof fields.favorite !== 'boolean') return null;
  return {
    pdgaNumber,
    favorite: fields.favorite,
    import: importOf(fields.import, pdgaNumber),
    manualRounds: validateManualRounds(fields.manualRounds),
    leftOut: validateLeftOut(fields.leftOut),
  };
}

function validatePlayers(value: unknown): StoredPlayer[] {
  if (!Array.isArray(value)) return [];
  const players: StoredPlayer[] = [];
  let favorites = 0;
  let unsaved = 0;
  for (const item of value) {
    const player = validatePlayer(item);
    if (!player || players.some((other) => other.pdgaNumber === player.pdgaNumber)) continue;
    if (player.favorite ? favorites++ >= MAX_FAVORITES : unsaved++ >= 1) continue;
    players.push(player);
  }
  return players;
}

/**
 * Reads stored data field by field, so one bad field does not lose the
 * others, and data saved before a field existed loads with its default.
 */
export function validateData(value: unknown): AppData {
  const fields = record(value);
  if (!fields) return { ...EMPTY_DATA };
  const { language, theme, playerOrder } = fields;
  const players = validatePlayers(fields.players);
  const me = pdgaNumberOf(fields.me);
  const lastViewed = pdgaNumberOf(fields.lastViewed);
  return {
    language: typeof language === 'string' && LANGUAGE_CODE.test(language) ? language : null,
    theme: THEMES.find((name) => name === theme) ?? null,
    dateOrder: DATE_ORDERS.find((name) => name === fields.dateOrder) ?? null,
    playerOrder: PLAYER_ORDERS.find((name) => name === playerOrder) ?? 'name',
    cards: validateCards(fields.cards),
    top8Period: validateTopPeriod(fields.top8Period),
    top8Own: fields.top8Own === true,
    chartPeriod: validateChartPeriod(fields.chartPeriod),
    chartAxis: CHART_AXES.find((name) => name === fields.chartAxis) ?? 'time',
    chartTable: fields.chartTable === true,
    bookmarklet: isBookmarkletVersion(fields.bookmarklet) ? fields.bookmarklet : null,
    me: players.some((player) => player.favorite && player.pdgaNumber === me) ? me : null,
    openWith: OPEN_WITH.find((name) => name === fields.openWith) ?? 'me',
    lastViewed: players.some((player) => player.pdgaNumber === lastViewed) ? lastViewed : null,
    players,
  };
}

/**
 * Turns v1 data (one default player and one import) into v2. The default
 * player becomes a favorite and "me"; without one, the imported player does.
 * An import of another player than the default one becomes the unsaved
 * player. `complete` is false when part of the v1 data could not be placed,
 * so the caller keeps the v1 copy.
 */
export function migrateV1(value: unknown): { data: AppData; complete: boolean } {
  const fields = record(value) ?? {};
  const base = validateData({ language: fields.language, theme: fields.theme });
  const stored = validateStoredImport(fields.lastImport);
  const me = pdgaNumberOf(fields.pdgaNumber) ?? playerNumber(stored?.player);
  const owner = playerNumber(stored?.player) ?? me;
  let migrated: StoredImport | null = null;
  if (stored && owner !== null) {
    const { at, ...parts } = stored;
    migrated = applyImport(null, parts, at, owner);
  }

  const players: StoredPlayer[] = [];
  if (me !== null) {
    players.push({ pdgaNumber: me, favorite: true, import: owner === me ? migrated : null, manualRounds: [], leftOut: [] });
  }
  if (owner !== null && owner !== me && migrated) {
    players.push({ pdgaNumber: owner, favorite: false, import: migrated, manualRounds: [], leftOut: [] });
  }
  const lost = fields.lastImport !== undefined && fields.lastImport !== null && migrated === null;
  return { data: validateData({ ...base, me, players }), complete: !lost };
}

export interface Store {
  /** False when the latest change only lasts until the page is closed. */
  readonly persistent: boolean;
  get(): AppData;
  update(changes: Partial<AppData>): AppData;
  /** Reads storage again, after another tab changed it. */
  reload(): AppData;
}

export function createStore(storage: Storage | null): Store {
  let persistent = storage !== null;
  let data: AppData = { ...EMPTY_DATA };

  function write(next: AppData): void {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
      persistent = true;
    } catch {
      persistent = false;
    }
  }

  function load(): AppData {
    if (!storage) return data;
    try {
      const text = storage.getItem(STORAGE_KEY);
      if (text !== null) return validateData(JSON.parse(text));
      const old = storage.getItem(V1_KEY);
      if (old === null) return { ...EMPTY_DATA };
      const { data: migrated, complete } = migrateV1(JSON.parse(old));
      write(migrated);
      // Never silently dropped: the v1 copy stays unless everything moved over.
      if (persistent && complete) storage.removeItem(V1_KEY);
      return migrated;
    } catch {
      // Unreadable or corrupt data: start over, leaving what is stored alone.
      return { ...EMPTY_DATA };
    }
  }

  data = load();
  return {
    get persistent() {
      return persistent;
    },
    get: () => data,
    update(changes) {
      data = validateData({ ...data, ...changes });
      write(data);
      return data;
    },
    reload() {
      data = load();
      return data;
    },
  };
}

/** localStorage, or null when the browser blocks it. Merely reading the property can throw. */
export function browserStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    const probe = `${STORAGE_KEY}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}
