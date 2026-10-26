// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addShared, readShared, shareLink, sharedNumbers, shareOffer } from '../../src/app/share';
import { EMPTY_DATA, MAX_FAVORITES, STORAGE_KEY, type AppData, type StoredPlayer } from '../../src/app/storage';

function player(pdgaNumber: number, favorite = true): StoredPlayer {
  return { pdgaNumber, favorite, import: null, manualRounds: [], leftOut: [] };
}

function data(players: StoredPlayer[], me: number | null = null): AppData {
  return { ...EMPTY_DATA, players, me };
}

describe('the shared link', () => {
  it('carries the favorites only, "me" first', () => {
    const list = data([player(100001), player(100002), player(100003, false)], 100002);
    expect(sharedNumbers(list)).toEqual([100002, 100001]);
    expect(shareLink('https://app.example/next-rating/#d=old', sharedNumbers(list))).toBe(
      'https://app.example/next-rating/#add=100002,100001',
    );
  });

  it('reads PDGA numbers, each once, and at most 50', () => {
    expect(readShared('100001,7,100001')).toEqual([100001, 7]);
    const many = Array.from({ length: 60 }, (_, i) => String(1000 + i)).join(',');
    expect(readShared(many)).toHaveLength(50);
  });

  it('turns away anything but a list of PDGA numbers', () => {
    for (const text of ['', ',', '100001,', '0', '012', '123456789', '1e5', '100001,abc', '100001;100002', '-5', ' 1']) {
      expect(readShared(text), text).toBeNull();
    }
    expect(readShared('1,'.repeat(300) + '1')).toBeNull();
  });
});

describe('adding a shared list', () => {
  it('offers the players not yet favorites, as many as fit', () => {
    const favorites = Array.from({ length: MAX_FAVORITES - 2 }, (_, i) => player(200000 + i));
    const offer = shareOffer(data([...favorites, player(100009, false)]), [200000, 100009, 100001, 100002, 100003]);
    // The unsaved player can still become a favorite.
    expect(offer).toEqual({ numbers: [100009, 100001], known: 1, overflow: 2 });
  });

  it('adds them as favorites in the link order, keeping the unsaved player’s import', () => {
    const unsaved = { ...player(100002, false), import: { at: '2026-10-01T00:00:00.000Z', events: [] } };
    const { data: next, added } = addShared(data([player(100001), unsaved]), [100003, 100002]);
    expect(added).toEqual([100003, 100002]);
    expect(next.players.map((one) => [one.pdgaNumber, one.favorite])).toEqual([
      [100001, true],
      [100003, true],
      [100002, true],
    ]);
    expect(next.players[2]!.import).toEqual(unsaved.import);
  });
});

async function start(url: string): Promise<void> {
  history.replaceState(null, '', url);
  document.body.replaceChildren(Object.assign(document.createElement('div'), { id: 'app' }));
  vi.resetModules();
  await import('../../src/app/main');
}

function stored(): AppData {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppData;
}

describe('the app', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('asks before adding the players in a shared link, and removes it from the address', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data([player(100001)], 100001)));
    await start('/next-rating/#add=100001,100002,100003');
    expect(location.hash).toBe('');
    const offer = document.getElementById('share-offer')!;
    expect(document.activeElement).toBe(offer);
    expect(offer.textContent).toContain('2 new players');
    expect(offer.textContent).toContain('#100002, #100003');
    expect(offer.textContent).toContain('1 more is in your list already');
    document.getElementById('share-offer-add')!.click();
    expect(stored().players.map((one) => one.pdgaNumber)).toEqual([100001, 100002, 100003]);
    expect(stored().me).toBe(100001);
    expect(document.getElementById('share-offer')).toBeNull();
    expect(document.getElementById('import-banner')!.textContent).toContain('2 players added');
  });

  it('adds no one on Cancel', async () => {
    await start('/next-rating/#add=100002');
    document.getElementById('share-offer-cancel')!.click();
    expect(document.getElementById('share-offer')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('says so when the link cannot be read or adds no one', async () => {
    await start('/next-rating/#add=12,abc');
    expect(location.hash).toBe('');
    expect(document.getElementById('import-banner')!.textContent).toContain('could not be read');

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data([player(100001)])));
    await start('/next-rating/#add=100001');
    expect(document.getElementById('share-offer')).toBeNull();
    expect(document.getElementById('import-banner')!.textContent).toContain('in your list already');
  });

  it('copies a link with the favorites from the players panel, or shows it to copy by hand', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data([player(100001), player(100002)], 100002)));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await start('/next-rating/');
    document.getElementById('players-menu')!.click();
    document.getElementById('players-share')!.click();
    await vi.waitFor(() => expect(document.querySelector('.players-share .status')).not.toBeNull());
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/next-rating/#add=100002,100001`);

    writeText.mockRejectedValue(new Error('denied'));
    document.getElementById('players-share')!.click();
    await vi.waitFor(() => expect(document.getElementById('players-share-link')).not.toBeNull());
    const field = document.getElementById('players-share-link') as HTMLInputElement;
    expect(field.value).toBe(`${location.origin}/next-rating/#add=100002,100001`);
    expect(document.activeElement).toBe(field);
  });
});
