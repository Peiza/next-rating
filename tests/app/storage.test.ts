import { describe, expect, it } from 'vitest';
import { createStore, EMPTY_DATA, STORAGE_KEY, validateData } from '../../src/app/storage';

/** A minimal in-memory Storage. */
class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

class FullStorage extends MemoryStorage {
  override setItem(): void {
    throw new DOMException('Quota exceeded', 'QuotaExceededError');
  }
}

class BrokenStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new DOMException('Denied', 'SecurityError');
  }
}

describe('store', () => {
  it('starts empty', () => {
    expect(createStore(new MemoryStorage()).get()).toEqual(EMPTY_DATA);
  });

  it('keeps data across page loads', () => {
    const storage = new MemoryStorage();
    createStore(storage).update({ pdgaNumber: 100001, language: 'sv' });
    expect(createStore(storage).get()).toEqual({ pdgaNumber: 100001, language: 'sv' });
  });

  it('starts over when the stored data is corrupt', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(createStore(storage).get()).toEqual(EMPTY_DATA);
  });

  it('keeps working in memory when storage is full', () => {
    const store = createStore(new FullStorage());
    expect(store.persistent).toBe(true);
    expect(store.update({ pdgaNumber: 100001 }).pdgaNumber).toBe(100001);
    expect(store.get().pdgaNumber).toBe(100001);
    expect(store.persistent).toBe(false);
  });

  it('keeps working without storage', () => {
    const store = createStore(null);
    expect(store.persistent).toBe(false);
    expect(store.update({ language: 'en' }).language).toBe('en');
  });

  it('survives storage that throws on read', () => {
    expect(createStore(new BrokenStorage()).get()).toEqual(EMPTY_DATA);
  });
});

describe('validateData', () => {
  it('drops invalid fields and keeps the valid ones', () => {
    expect(validateData({ pdgaNumber: 100001, language: '<b>' })).toEqual({ pdgaNumber: 100001, language: null });
    expect(validateData({ pdgaNumber: -5, language: 'sv' })).toEqual({ pdgaNumber: null, language: 'sv' });
    expect(validateData({ pdgaNumber: 1.5 })).toEqual(EMPTY_DATA);
    expect(validateData({ pdgaNumber: '100001' })).toEqual(EMPTY_DATA);
  });

  it('ignores anything that is not an object', () => {
    expect(validateData(null)).toEqual(EMPTY_DATA);
    expect(validateData([1, 2])).toEqual(EMPTY_DATA);
    expect(validateData('x')).toEqual(EMPTY_DATA);
  });
});
