import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script, createContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServiceWorker, cacheName, fillTemplate, precacheList } from '../../scripts/service-worker';

const TEMPLATE = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'sw.js'), 'utf8');
const SCOPE = 'https://example.github.io/next-rating/';

describe('precacheList', () => {
  it('caches every built file but the service worker and source maps', () => {
    expect(
      precacheList(['sw.js', 'index.html', 'assets/index-abc.js', 'assets/index-abc.js.map', 'manifest.webmanifest', 'icons/icon-192.png']),
    ).toEqual(['assets/index-abc.js', 'icons/icon-192.png', 'index.html', 'manifest.webmanifest']);
  });
});

describe('cacheName', () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it('changes when a file changes, and only then', () => {
    const name = cacheName([['index.html', bytes('a')]]);
    expect(name).toMatch(/^next-rating-[0-9a-f]{16}$/);
    expect(cacheName([['index.html', bytes('a')]])).toBe(name);
    expect(cacheName([['index.html', bytes('b')]])).not.toBe(name);
    expect(cacheName([['other.html', bytes('a')]])).not.toBe(name);
  });
});

describe('buildServiceWorker', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('lists the files in the build folder and fills in every placeholder', () => {
    dir = mkdtempSync(join(tmpdir(), 'sw-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    writeFileSync(join(dir, 'assets', 'index-abc.js'), '');
    writeFileSync(join(dir, 'assets', 'index-abc.js.map'), '');
    writeFileSync(join(dir, 'sw.js'), 'old');
    const source = buildServiceWorker(dir, TEMPLATE);
    expect(source).not.toContain('__');
    expect(source).toContain('const FILES = ["assets/index-abc.js","index.html"];');
    expect(source).toMatch(/const CACHE = "next-rating-[0-9a-f]{16}";/);
  });

  it('refuses a template that has lost a placeholder', () => {
    expect(() => fillTemplate('const FILES = [];', [], 'next-rating-x')).toThrow(/placeholder/);
  });
});

/** Runs the filled service worker with a stand-in for the browser's service worker scope. */
function runWorker(cached: Record<string, string>) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const stored = new Map(Object.entries(cached).map(([path, body]) => [new URL(path, SCOPE).href, body]));
  const deleted: string[] = [];
  let skipped = false;
  const fetched: string[] = [];
  const cache = {
    match: async (request: string | { url: string }, options?: { ignoreSearch?: boolean }) => {
      const url = new URL(typeof request === 'string' ? request : request.url);
      if (options?.ignoreSearch) url.search = '';
      return stored.get(url.href) ?? undefined;
    },
    addAll: async (requests: { url: string; cache: string }[]) => {
      for (const request of requests) stored.set(request.url, `fetched with cache: ${request.cache}`);
    },
  };
  const context = createContext({
    URL,
    Promise,
    Request: class {
      constructor(
        public url: string,
        public init: { cache: string },
      ) {}
      get cache() {
        return this.init.cache;
      }
    },
    caches: {
      open: async () => cache,
      keys: async () => ['next-rating-old', 'next-rating-new', 'other-app'],
      delete: async (name: string) => deleted.push(name),
    },
    fetch: async (request: { url: string }) => {
      fetched.push(request.url);
      return 'network';
    },
    self: {
      registration: { scope: SCOPE },
      addEventListener: (type: string, listener: (event: unknown) => void) => (listeners[type] = listener),
      skipWaiting: () => (skipped = true),
    },
  });
  new Script(fillTemplate(TEMPLATE, ['index.html', 'assets/app.js'], 'next-rating-new')).runInContext(context);

  async function request(url: string, mode = 'no-cors', method = 'GET'): Promise<unknown> {
    let response: Promise<unknown> | undefined;
    listeners.fetch!({ request: { url, mode, method }, respondWith: (value: Promise<unknown>) => (response = value) });
    return response === undefined ? 'not handled' : await response;
  }
  async function lifecycle(type: 'install' | 'activate'): Promise<void> {
    let done: Promise<unknown> | undefined;
    listeners[type]!({ waitUntil: (value: Promise<unknown>) => (done = value) });
    await done;
  }
  return { request, lifecycle, listeners, stored, deleted, fetched, skipped: () => skipped };
}

describe('the service worker', () => {
  it('caches every file on install, past the HTTP cache', async () => {
    const worker = runWorker({});
    await worker.lifecycle('install');
    expect(worker.stored.get(`${SCOPE}assets/app.js`)).toBe('fetched with cache: reload');
    expect(worker.stored.has(`${SCOPE}index.html`)).toBe(true);
  });

  it('deletes the caches of older versions only', async () => {
    const worker = runWorker({});
    await worker.lifecycle('activate');
    expect(worker.deleted).toEqual(['next-rating-old']);
  });

  it('serves cached files, and the app for any page in its scope', async () => {
    const worker = runWorker({ 'index.html': 'app', 'assets/app.js': 'script' });
    expect(await worker.request(`${SCOPE}assets/app.js`)).toBe('script');
    expect(await worker.request(SCOPE, 'navigate')).toBe('app');
    expect(await worker.request(`${SCOPE}?utm=x`, 'navigate')).toBe('app');
    expect(worker.fetched).toEqual([]);
  });

  it('goes to the network for files it does not have', async () => {
    const worker = runWorker({ 'index.html': 'app' });
    expect(await worker.request(`${SCOPE}missing.png`)).toBe('network');
  });

  it('leaves other sites and other methods alone', async () => {
    const worker = runWorker({ 'index.html': 'app' });
    expect(await worker.request('https://www.pdga.com/player/1/details', 'navigate')).toBe('not handled');
    expect(await worker.request('https://example.github.io/other/', 'navigate')).toBe('not handled');
    expect(await worker.request(SCOPE, 'navigate', 'POST')).toBe('not handled');
  });

  it('takes over only when the app asks', () => {
    const worker = runWorker({});
    worker.listeners.message!({ data: 'other' });
    expect(worker.skipped()).toBe(false);
    worker.listeners.message!({ data: 'skip-waiting' });
    expect(worker.skipped()).toBe(true);
  });
});
