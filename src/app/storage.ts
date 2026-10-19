import { parseInteger, RANGES } from '../parsers/values';
import { validateStoredImport, type StoredImport } from './import';

/*
 * Everything the app keeps is stored under one versioned key in
 * localStorage, and only in this browser. Stored data is validated like an
 * import when it is read back. When storage is unavailable or full, as in
 * some private windows, the app keeps working with an in-memory copy.
 */

export const STORAGE_KEY = 'next-rating:v1';

export interface AppData {
  /** The default player. */
  pdgaNumber: number | null;
  /** The language picked in Settings; null follows the device. */
  language: string | null;
  /** The imported pdga.com data, or null before the first import. */
  lastImport: StoredImport | null;
}

export const EMPTY_DATA: AppData = { pdgaNumber: null, language: null, lastImport: null };

const LANGUAGE_CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

/** Reads stored data field by field, so one bad field does not lose the others. */
export function validateData(value: unknown): AppData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ...EMPTY_DATA };
  const record = value as Record<string, unknown>;
  const { pdgaNumber, language, lastImport } = record;
  return {
    pdgaNumber:
      typeof pdgaNumber === 'number' && Number.isInteger(pdgaNumber)
        ? parseInteger(String(pdgaNumber), RANGES.id)
        : null,
    language: typeof language === 'string' && LANGUAGE_CODE.test(language) ? language : null,
    lastImport: validateStoredImport(lastImport),
  };
}

export interface Store {
  /** False when changes only last until the page is closed. */
  readonly persistent: boolean;
  get(): AppData;
  update(changes: Partial<AppData>): AppData;
}

export function createStore(storage: Storage | null): Store {
  let persistent = storage !== null;
  let data: AppData = { ...EMPTY_DATA };
  if (storage) {
    try {
      const text = storage.getItem(STORAGE_KEY);
      if (text !== null) data = validateData(JSON.parse(text));
    } catch {
      // Unreadable or corrupt data: start over.
    }
  }
  return {
    get persistent() {
      return persistent;
    },
    get: () => data,
    update(changes) {
      data = validateData({ ...data, ...changes });
      if (storage) {
        try {
          storage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch {
          persistent = false;
        }
      }
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
