// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_DATA, type AppData, type StoredPlayer } from '../../src/app/storage';
import {
  applyRemote,
  createSyncController,
  extraFavorites,
  mergeRemote,
  PULL_INTERVAL_MS,
  PUSH_DELAY_MS,
  SYNC_KEY,
  syncLink,
  takeSyncToken,
  validateRemote,
  type SyncList,
} from '../../src/app/sync';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const API = 'https://api.example';

function player(pdgaNumber: number, favorite = true, at: string | null = null): StoredPlayer {
  return { pdgaNumber, favorite, import: at ? { at, events: [] } : null, manualRounds: [], leftOut: [] };
}

function data(players: StoredPlayer[], me: number | null = null): AppData {
  return { ...EMPTY_DATA, players, me };
}

describe('the synced list', () => {
  it('replaces the favorites, keeping stored imports and the unsaved player', () => {
    const local = data([player(1, true, '2026-10-01T00:00:00.000Z'), player(2), player(9, false)], 2);
    const next = applyRemote(local, { players: [3, 1], me: 1 });
    expect(next.players.map((one) => [one.pdgaNumber, one.favorite])).toEqual([
      [3, true],
      [1, true],
      [9, false],
    ]);
    expect(next.players[1]!.import?.at).toBe('2026-10-01T00:00:00.000Z');
    expect(next.me).toBe(1);
    // The unsaved player becomes a favorite when the list has it.
    expect(applyRemote(local, { players: [9], me: null }).players).toEqual([{ ...player(9) }]);
  });

  it('merges this device’s extra favorites after the list', () => {
    const local = data([player(1), player(2)], 2);
    expect(extraFavorites(local, { players: [3, 1], me: null })).toEqual([2]);
    const merged = mergeRemote(local, { players: [3, 1], me: null });
    expect(merged.players.map((one) => one.pdgaNumber)).toEqual([3, 1, 2]);
    expect(merged.me).toBe(2);
  });

  it('checks what the server answers', () => {
    expect(validateRemote({ players: [1, 2, 1], me: 2, updatedAt: 5 })).toEqual({ players: [1, 2], me: 2, updatedAt: 5 });
    expect(validateRemote({ players: [1], me: 7, updatedAt: 5 })).toEqual({ players: [1], me: null, updatedAt: 5 });
    for (const value of [null, { players: [0], updatedAt: 1 }, { players: ['1'], updatedAt: 1 }, { players: [1] }]) {
      expect(validateRemote(value)).toBeNull();
    }
  });

  it('carries the token in the fragment, removed from the address when opened', () => {
    expect(syncLink('https://app.example/next-rating/#add=1', TOKEN)).toBe(`https://app.example/next-rating/#sync=${TOKEN}`);
    history.replaceState(null, '', `/next-rating/#sync=${TOKEN}`);
    expect(takeSyncToken()).toBe(TOKEN);
    expect(location.hash).toBe('');
    history.replaceState(null, '', '/next-rating/#sync=short');
    expect(takeSyncToken()).toBe('');
    expect(takeSyncToken()).toBeNull();
  });
});

/** A fake Worker with one list, and the calls made to it. */
function server(initial: (SyncList & { updatedAt: number }) | null = null) {
  let list = initial;
  let clock = 1000;
  const calls: { method: string; path: string; body: unknown }[] = [];
  let down = false;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).slice(API.length);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    if (down) return new Response('{"error":"unavailable"}', { status: 503 });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (method === 'POST') {
      list = { ...(body as SyncList), updatedAt: ++clock };
      return json({ token: TOKEN, updatedAt: list.updatedAt }, 201);
    }
    if (!list) return json({ error: 'not-found' }, 404);
    if (method === 'GET') return json(list);
    if (method === 'PUT') {
      list = { ...(body as SyncList), updatedAt: ++clock };
      return json({ updatedAt: list.updatedAt });
    }
    list = null;
    return json({ deleted: true });
  });
  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    calls,
    get list() {
      return list;
    },
    /** Another device writes. */
    write(next: SyncList) {
      list = { ...next, updatedAt: ++clock };
    },
    setDown(value: boolean) {
      down = value;
    },
  };
}

function device(fake: ReturnType<typeof server>, start: AppData) {
  let current = start;
  let now = 50_000;
  const timers: (() => void)[] = [];
  const changes = vi.fn();
  const controller = createSyncController({
    url: API,
    fetch: fake.fetch,
    storage: localStorage,
    now: () => now,
    getData: () => current,
    setData: (next) => {
      current = next;
      controller.changed();
    },
    onChange: changes,
    setTimer: (run) => timers.push(run) && timers.length,
    clearTimer: (timer) => {
      timers[(timer as number) - 1] = () => {};
    },
  });
  return {
    controller,
    get data() {
      return current;
    },
    /** A change made in the app, which then renders and calls changed(). */
    edit(next: AppData) {
      current = next;
      controller.changed();
    },
    /** Runs the pending push timer, as PUSH_DELAY_MS passing would. */
    async flush() {
      const run = timers.splice(0).at(-1);
      run?.();
      await vi.waitFor(() => expect(controller.status()).not.toBe('syncing'));
    },
    pending: () => timers.length,
    tick(ms: number) {
      now += ms;
    },
  };
}

describe('the sync controller', () => {
  beforeEach(() => localStorage.clear());

  it('creates a list with PDGA numbers and "me" only, and keeps the token apart from the app data', async () => {
    const fake = server();
    const one = device(fake, data([player(1, true, '2026-10-01T00:00:00.000Z'), player(2), player(9, false)], 1));
    await one.controller.create();
    expect(fake.calls).toEqual([{ method: 'POST', path: '/v1/sync', body: { players: [1, 2], me: 1 } }]);
    expect(one.controller.status()).toBe('synced');
    expect(JSON.parse(localStorage.getItem(SYNC_KEY)!).token).toBe(TOKEN);
  });

  it('sends a change once after a short wait, the whole list, and nothing when nothing changed', async () => {
    const fake = server();
    const one = device(fake, data([player(1)]));
    await one.controller.create();
    one.edit(data([player(1), player(2)]));
    one.edit(data([player(1), player(2), player(3)]));
    expect(PUSH_DELAY_MS).toBeGreaterThan(1000);
    await one.flush();
    const puts = fake.calls.filter((call) => call.method === 'PUT');
    expect(puts).toEqual([{ method: 'PUT', path: `/v1/sync/${TOKEN}`, body: { players: [1, 2, 3], me: null } }]);
    one.controller.changed();
    expect(one.pending()).toBe(0);
  });

  it('takes a newer list on pull, at most every 20 seconds unless forced', async () => {
    const fake = server();
    const one = device(fake, data([player(1)]));
    await one.controller.create();
    fake.write({ players: [1, 4], me: 4 });
    await one.controller.pull();
    expect(one.data.players.map((p) => p.pdgaNumber)).toEqual([1]);
    one.tick(PULL_INTERVAL_MS);
    await one.controller.pull();
    expect(one.data.players.map((p) => p.pdgaNumber)).toEqual([1, 4]);
    expect(one.data.me).toBe(4);
    // Taking it sends nothing back.
    expect(one.pending()).toBe(0);
    fake.write({ players: [4], me: 4 });
    await one.controller.syncNow();
    expect(one.data.players.map((p) => p.pdgaNumber)).toEqual([4]);
  });

  it('does not overwrite a change of its own that waits to be sent', async () => {
    const fake = server();
    const one = device(fake, data([player(1)]));
    await one.controller.create();
    fake.write({ players: [5], me: null });
    one.edit(data([player(1), player(2)]));
    await one.controller.pull(true);
    expect(one.data.players.map((p) => p.pdgaNumber)).toEqual([1, 2]);
    // Sync now sends it first: the last write wins.
    await one.controller.syncNow();
    expect(fake.list?.players).toEqual([1, 2]);
  });

  it('joins at once when nothing would be lost, and asks when this device has other favorites', async () => {
    const fake = server({ players: [1, 2], me: 1, updatedAt: 10 });
    const fresh = device(fake, data([player(1)]));
    expect(await fresh.controller.join(TOKEN)).toBeNull();
    expect(fresh.data.players.map((p) => p.pdgaNumber)).toEqual([1, 2]);

    localStorage.clear();
    const other = device(fake, data([player(1), player(3)]));
    const choice = await other.controller.join(TOKEN);
    expect(choice?.extra).toEqual([3]);
    other.controller.finishJoin(choice!, 'merge');
    expect(other.data.players.map((p) => p.pdgaNumber)).toEqual([1, 2, 3]);
    await other.flush();
    expect(fake.list?.players).toEqual([1, 2, 3]);
  });

  it('replaces this device’s list when asked', async () => {
    const fake = server({ players: [1], me: null, updatedAt: 10 });
    const one = device(fake, data([player(3)], 3));
    const choice = await one.controller.join(TOKEN);
    one.controller.finishJoin(choice!, 'replace');
    expect(one.data.players.map((p) => p.pdgaNumber)).toEqual([1]);
    expect(one.data.me).toBeNull();
    expect(one.pending()).toBe(0);
  });

  it('stops here without touching the server, and deletes the list for every device', async () => {
    const fake = server();
    const one = device(fake, data([player(1)]));
    await one.controller.create();
    one.controller.stop();
    expect(localStorage.getItem(SYNC_KEY)).toBeNull();
    expect(fake.list).not.toBeNull();
    expect(fake.calls.map((call) => call.method)).toEqual(['POST']);

    await one.controller.join(TOKEN);
    expect(await one.controller.remove()).toBe(true);
    expect(fake.list).toBeNull();
    expect(localStorage.getItem(SYNC_KEY)).toBeNull();
  });

  it('stops syncing and keeps the favorites when another device deleted the list', async () => {
    const fake = server();
    const one = device(fake, data([player(1)]));
    await one.controller.create();
    await fake.fetch(`${API}/v1/sync/${TOKEN}`, { method: 'DELETE' });
    await one.controller.pull(true);
    expect(one.controller.status()).toBe('gone');
    expect(one.controller.state()).toBeNull();
    expect(one.data.players.map((p) => p.pdgaNumber)).toEqual([1]);
  });

  it('says so when the Worker cannot answer, and tries again with the next change', async () => {
    const fake = server();
    const one = device(fake, data([player(1)]));
    await one.controller.create();
    fake.setDown(true);
    one.edit(data([player(1), player(2)]));
    await one.flush();
    expect(one.controller.status()).toBe('unavailable');
    fake.setDown(false);
    one.edit(data([player(1), player(2), player(3)]));
    await one.flush();
    expect(fake.list?.players).toEqual([1, 2, 3]);
  });
});

describe('the Settings section', async () => {
  const { qrCode, syncSection, joinView } = await import('../../src/app/views/sync');
  const props = {
    status: 'synced' as const,
    lastSynced: null,
    now: new Date(),
    online: true,
    share: null,
    confirmDelete: false,
    onCreate: () => {},
    onShare: () => {},
    onSyncNow: () => {},
    onStop: () => {},
    onAskDelete: () => {},
    onDelete: () => {},
  };

  it('draws the sync link as a QR code here, dark squares on a light square', () => {
    const code = qrCode(`https://peiza.github.io/next-rating/#sync=${TOKEN}`);
    expect(code.getAttribute('viewBox')).toBe('0 0 45 45');
    expect(code.querySelector('rect')!.getAttribute('fill')).toBe('#ffffff');
    expect(code.querySelector('path')!.getAttribute('d')).toMatch(/^M4 4h1v1h-1z/);
  });

  it('offers a sync link before syncing, and the link, Sync now, Stop and Delete while syncing', () => {
    const before = syncSection({ ...props, link: null });
    expect(before.querySelector('#sync-create')).not.toBeNull();
    expect(before.querySelector('svg')).toBeNull();
    const link = `https://app.example/#sync=${TOKEN}`;
    const during = syncSection({ ...props, link });
    expect((during.querySelector('#sync-link') as HTMLInputElement).value).toBe(link);
    for (const id of ['sync-now', 'sync-share', 'sync-stop', 'sync-delete']) expect(during.querySelector(`#${id}`), id).not.toBeNull();
    expect(syncSection({ ...props, link, confirmDelete: true }).querySelector('#sync-delete-confirm')).not.toBeNull();
    expect(syncSection({ ...props, link: null, online: false }).querySelector('#sync-create')!.hasAttribute('disabled')).toBe(true);
  });

  it('asks Merge or Replace with the favorites the list lacks', () => {
    const view = joinView({ token: TOKEN, remote: { players: [1], me: null, updatedAt: 1 }, extra: [7, 8] }, () => {}, () => {}, () => {});
    expect(view.textContent).toContain('#7, #8');
    expect(view.querySelector('#sync-join-replace')!.textContent).toContain('remove 2 players');
  });
});
