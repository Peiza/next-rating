// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiPlayerOf,
  MAX_SEARCH_ANSWER,
  readSearch,
  SEARCH_LIMIT,
  searchPlayers,
  validateSearch,
  type SearchPlayer,
} from '../../src/app/api';
import { playersPanel, type PlayersProps } from '../../src/app/views/players';
import { pdgaFallbackUrl, playerSearchForm, type PlayerSearchProps, type SearchStatus } from '../../src/app/views/search';
import { startView } from '../../src/app/views/start';
import { setLanguage } from '../../src/i18n';

/* Invented data only. */

const URL = 'https://api.example';
const ON = { url: URL, enabled: true, online: true };

function found(extra: Partial<SearchPlayer> = {}): SearchPlayer {
  return {
    pdgaNumber: 99999,
    name: 'Test Player',
    rating: 950,
    ratingDate: '2026-10-14',
    membership: 'current',
    membershipExpires: '2026-12-31',
    classification: 'amateur',
    fetchedAt: '2026-10-26T12:00:00.000Z',
    location: 'Test City, SE',
    ...extra,
  };
}

function answer(body: unknown, status = 200) {
  return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
}

function submit(form: HTMLFormElement) {
  form.dispatchEvent(new Event('submit', { cancelable: true }));
}

afterEach(() => setLanguage('en'));

describe('readSearch', () => {
  it('reads a PDGA number, with spaces or "#"', () => {
    expect(readSearch('99999')).toEqual({ pdgaNumber: 99999 });
    expect(readSearch(' #99 999 ')).toEqual({ pdgaNumber: 99999 });
    expect(readSearch('0123')).toBeNull();
    expect(readSearch('123456789')).toBeNull();
  });

  it('searches one word as the last name and more as first and last name, as on pdga.com', () => {
    expect(readSearch('Player')).toEqual({ firstName: null, lastName: 'Player' });
    expect(readSearch('  Test   Player ')).toEqual({ firstName: 'Test', lastName: 'Player' });
    expect(readSearch('Åsa af Klint')).toEqual({ firstName: 'Åsa', lastName: 'af Klint' });
    expect(readSearch("Test O'Player-Smith")).toEqual({ firstName: 'Test', lastName: "O'Player-Smith" });
  });

  it('turns away an empty field and what is not a name', () => {
    for (const text of ['', '   ', 'a&b', '<b>', 'Test 12', '*', 'x'.repeat(41)]) expect(readSearch(text), text).toBeNull();
  });
});

describe('validateSearch', () => {
  it('accepts the Worker answer, also an empty list', () => {
    expect(validateSearch({ players: [found(), found({ pdgaNumber: 1, rating: null, ratingDate: null, location: null })] })).toHaveLength(2);
    expect(validateSearch({ players: [] })).toEqual([]);
  });

  it('turns away the whole answer when one player is not valid', () => {
    const bad = [
      { players: [found(), { ...found(), pdgaNumber: 0 }] },
      { players: [{ ...found(), location: 7 }] },
      { players: [{ ...found(), location: 'x'.repeat(101) }] },
      { players: [{ ...found(), rating: '950' }] },
      { players: Array.from({ length: SEARCH_LIMIT + 1 }, (_, i) => found({ pdgaNumber: i + 1 })) },
      { players: 'x' },
      [],
      null,
    ];
    for (const value of bad) expect(validateSearch(value)).toBeNull();
  });

  it('keeps each player once', () => {
    expect(validateSearch({ players: [found(), found()] })).toHaveLength(1);
  });
});

describe('searchPlayers', () => {
  it('asks the Worker with the names, without cookies or referrer', async () => {
    const fetch = answer({ players: [found()] });
    const result = await searchPlayers({ firstName: 'Åsa', lastName: 'af Klint' }, { ...ON, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(result).toEqual({ ok: true, players: [found()] });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${URL}/v1/players?first_name=%C3%85sa&last_name=af+Klint`);
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer' });
  });

  it('looks a number up as one player, and an unknown number as no players', async () => {
    const { location: _location, ...player } = found();
    const one = await searchPlayers({ pdgaNumber: 99999 }, { ...ON, fetch: answer(player) as unknown as typeof fetch });
    expect(one).toEqual({ ok: true, players: [{ ...player, location: null }] });
    const none = await searchPlayers({ pdgaNumber: 99999 }, { ...ON, fetch: answer({ error: 'not-found' }, 404) as unknown as typeof fetch });
    expect(none).toEqual({ ok: true, players: [] });
  });

  it('makes no request when off, offline or without a URL', async () => {
    const fetch = answer({ players: [] });
    for (const options of [{ ...ON, enabled: false }, { ...ON, online: false }, { ...ON, url: '' }]) {
      expect(await searchPlayers({ firstName: null, lastName: 'Player' }, { ...options, fetch: fetch as unknown as typeof globalThis.fetch })).toEqual({
        ok: false,
        code: 'off',
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says unavailable for errors, oversized and invalid answers and a network failure', async () => {
    const answers = [
      answer({ error: 'rate-limited' }, 429),
      answer({ error: 'unavailable' }, 503),
      answer(`{"players":[],"pad":"${'x'.repeat(MAX_SEARCH_ANSWER)}"}`),
      answer('<html>'),
      answer({ players: [{ name: 'x' }] }),
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    ];
    for (const fetch of answers) {
      const result = await searchPlayers({ firstName: null, lastName: 'Player' }, { ...ON, fetch: fetch as unknown as typeof globalThis.fetch });
      expect(result).toEqual({ ok: false, code: 'unavailable' });
    }
  });

  it('gives the picked player to the lookup without the location', () => {
    expect(apiPlayerOf(found())).not.toHaveProperty('location');
  });
});

describe('the search form', () => {
  function form(status: SearchStatus, extra: Partial<PlayerSearchProps> = {}): HTMLElement {
    return playerSearchForm({
      id: 'player-search',
      label: 'players.searchLabelApi',
      hint: 'players.searchHintApi',
      state: { text: 'Test Player', status },
      onText: vi.fn(),
      onSearch: vi.fn(),
      onPick: vi.fn(),
      onPdga: vi.fn(),
      ...extra,
    });
  }

  it('runs a search on submit, never while typing', () => {
    const onSearch = vi.fn();
    const onText = vi.fn();
    const view = form({ kind: 'idle' }, { onSearch, onText });
    const input = view.querySelector<HTMLInputElement>('#player-search')!;
    expect(input.value).toBe('Test Player');
    input.value = 'Test Play';
    input.dispatchEvent(new Event('input'));
    expect(onText).toHaveBeenCalledWith('Test Play');
    expect(onSearch).not.toHaveBeenCalled();
    submit(input.form!);
    expect(onSearch).toHaveBeenCalledWith({ firstName: 'Test', lastName: 'Play' });
    input.value = 'a&b';
    submit(input.form!);
    expect(onSearch).toHaveBeenLastCalledWith(null);
  });

  it('says what the search is doing', () => {
    expect(form({ kind: 'loading' }).querySelector('#player-search-status')!.textContent).toBe('Searching…');
    const invalid = form({ kind: 'invalid' });
    expect(invalid.querySelector('#player-search-status')!.textContent).toBe('Enter a first or last name, or a PDGA number.');
    expect(invalid.querySelector('#player-search')!.getAttribute('aria-invalid')).toBe('true');
    const none = form({ kind: 'ok', players: [] });
    expect(none.querySelector('#player-search-status')!.textContent).toMatch(/PDGA found no player/);
    expect(none.querySelector('#player-search-results')).toBeNull();
  });

  it('lists the players found as buttons without links, and picks one', () => {
    const onPick = vi.fn();
    const players = [found(), found({ pdgaNumber: 1, rating: null, ratingDate: null, membership: 'expired', location: null })];
    const view = form({ kind: 'ok', players }, { onPick });
    expect(view.querySelector('#player-search-status')!.textContent).toBe('Players found: 2.');
    const buttons = [...view.querySelectorAll<HTMLButtonElement>('#player-search-results button')];
    expect(buttons.map((button) => button.id)).toEqual(['player-search-pick-99999', 'player-search-pick-1']);
    expect(buttons[0]!.textContent).toBe('Test Player#99999 · Test City, SERating 950950');
    expect(buttons[1]!.textContent).toBe('Test Player#1No current rating');
    expect(view.querySelector('a')).toBeNull();
    buttons[1]!.click();
    expect(onPick).toHaveBeenCalledWith(players[1]);
  });

  it('says when only the first players show', () => {
    const players = Array.from({ length: SEARCH_LIMIT }, (_, i) => found({ pdgaNumber: i + 1 }));
    expect(form({ kind: 'ok', players }).querySelector('#player-search-status')!.textContent).toMatch(/first 10 players/);
  });

  it('offers pdga.com when the search could not be done', () => {
    const onPdga = vi.fn();
    const view = form({ kind: 'unavailable', query: { firstName: 'Test', lastName: 'Player' } }, { onPdga });
    expect(view.querySelector('#player-search-status')!.textContent).toBe('Could not search right now.');
    view.querySelector<HTMLButtonElement>('#player-search-pdga')!.click();
    expect(onPdga).toHaveBeenCalledWith('https://www.pdga.com/players?FirstName=Test&LastName=Player');
    expect(pdgaFallbackUrl({ pdgaNumber: 99999 })).toBe('https://www.pdga.com/player/99999');
    expect(form({ kind: 'ok', players: [] }).querySelector('#player-search-pdga')).toBeNull();
  });

  it('shows in Swedish', () => {
    setLanguage('sv');
    expect(form({ kind: 'unavailable', query: { pdgaNumber: 1 } }).querySelector('#player-search-pdga')!.textContent).toBe('Sök på pdga.com i stället');
  });
});

describe('the views', () => {
  const search = { state: { text: '', status: { kind: 'idle' } as const }, onText: vi.fn(), onSearch: vi.fn(), onPick: vi.fn(), onPdga: vi.fn() };

  it('searches in the app in the start view when it can, and on pdga.com otherwise', () => {
    const props = {
      pdgaNumber: null,
      player: null,
      flash: null,
      tab: 'name' as const,
      onTab: vi.fn(),
      onSavePdgaNumber: vi.fn(),
      onSearch: vi.fn(),
      onOpenSetup: vi.fn(),
    };
    const inApp = startView({ ...props, search });
    expect(inApp.querySelector('label[for="start-search"]')!.textContent).toBe('Your name or PDGA number');
    expect(inApp.querySelector('#start-search-hint')!.textContent).not.toMatch(/pdga\.com/);
    const onPdga = startView({ ...props, search: null });
    expect(onPdga.querySelector('label[for="start-search"]')!.textContent).toBe('Your name');
  });

  it('searches in the app in the players panel when it can', () => {
    const props: PlayersProps = {
      players: [],
      me: null,
      selected: null,
      editing: false,
      confirmRemove: null,
      flash: null,
      order: 'name',
      now: new Date('2026-10-26T12:00:00.000Z'),
      predictions: new Map(),
      onOrder: vi.fn(),
      onSearch: vi.fn(),
      search,
      onSelect: vi.fn(),
      onClose: vi.fn(),
      onToggleEdit: vi.fn(),
      onSetMe: vi.fn(),
      onAskRemove: vi.fn(),
      onRemove: vi.fn(),
      onSave: vi.fn(),
      onAdd: vi.fn(),
    };
    expect(playersPanel(props).querySelector('label[for="player-search"]')!.textContent).toBe('Find a player by name or PDGA number');
    expect(playersPanel({ ...props, search: null }).querySelector('label[for="player-search"]')!.textContent).toBe(
      'Find a player on pdga.com by name',
    );
  });
});
