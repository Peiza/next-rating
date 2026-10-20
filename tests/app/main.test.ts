// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from '../../src/app/storage';
import { encodeHandoff } from '../../src/handoff';
import { envelope, handoffPage, rawDetailsRow, rawPlayer } from '../handoff/raw';
import { LIVE_V1 } from './live-v1';
import { detailsRow, detailsTable, eventDivision, eventPage, eventRow, playerHeader } from '../parsers/html';

/** Loads the app as a fresh page load would. */
async function start(url: string): Promise<void> {
  history.replaceState(null, '', url);
  document.body.replaceChildren(Object.assign(document.createElement('div'), { id: 'app' }));
  vi.resetModules();
  await import('../../src/app/main');
}

const detailsHtml = playerHeader() + detailsTable([detailsRow({ round: '1', rating: '950' }), detailsRow({ round: '2', rating: '970' })]);
const otherHtml = playerHeader('Other Player', '100002', '990') + detailsTable([detailsRow({ rating: '1000' })]);

const EVENT_URL = 'https://www.pdga.com/tour/event/900005';
/** Unofficial results with rows for 100001 and 100002. */
const eventHtml = eventPage({
  eventId: '900005',
  mode: 'live',
  body: eventDivision(
    'MA1',
    [''],
    [
      eventRow({ pdgaNumber: '100001', rounds: [['54', '990']] }),
      eventRow({ name: 'Other Player', pdgaNumber: '100002', rounds: [['56', '970']] }),
    ],
  ),
});

function stored() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!);
}

/**
 * Opens the app with a hand-off, as the bookmarklet does, and waits for it to
 * be read. A fresh page load, since earlier loads in this file still listen
 * for hashchange.
 */
async function handOff(...pages: [html: string, url?: string][]): Promise<void> {
  const payload = await encodeHandoff(envelope({ pages: pages.map(([html, url]) => handoffPage(html, url)) }));
  await start(`/next-rating/#d=${payload}`);
  await vi.waitFor(() => expect(document.getElementById('import-banner')).not.toBeNull());
}

function bannerText(): string {
  return document.getElementById('import-banner')?.textContent ?? '';
}

function predicted(): string | null | undefined {
  return document.getElementById('predicted')?.textContent;
}

describe('app start', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('imports a hand-off, removes the fragment and keeps the data after a reload', async () => {
    const payload = await encodeHandoff(envelope({ pages: [handoffPage(detailsHtml)] }));
    await start(`/next-rating/#d=${payload}`);
    expect(location.hash).toBe('');
    await vi.waitFor(() => expect(document.getElementById('import-banner')).not.toBeNull());
    expect(document.activeElement?.id).toBe('import-banner');
    expect(document.getElementById('predicted')!.textContent).toBe('960');
    expect(stored().players[0].import.details).toHaveLength(2);

    await start('/next-rating/');
    expect(document.getElementById('import-banner')).toBeNull();
    expect(document.getElementById('predicted')!.textContent).toBe('960');
  });

  it('has only the Rating and Settings tabs', async () => {
    await start('/next-rating/');
    expect([...document.querySelectorAll('.tab')].map((tab) => tab.id)).toEqual(['tab-rating', 'tab-settings']);
  });

  it('opens the bookmarklet setup over the current tab and goes back to where it was opened', async () => {
    await start('/next-rating/');
    const open = document.getElementById('open-setup') as HTMLButtonElement;
    open.focus();
    open.click();
    expect(document.activeElement?.id).toBe('setup-title');
    const code = document.getElementById('bookmarklet-code') as HTMLTextAreaElement;
    expect(code.value.startsWith('javascript:')).toBe(true);
    document.getElementById('setup-back')!.click();
    expect(document.getElementById('bookmarklet-code')).toBeNull();
    expect(document.activeElement?.id).toBe('open-setup');
  });

  it('applies the theme from Settings and keeps it after a reload', async () => {
    const meta = document.head.appendChild(
      Object.assign(document.createElement('meta'), { name: 'theme-color', content: '#ffffff' }),
    );
    await start('/next-rating/');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    document.getElementById('tab-settings')!.click();
    document.getElementById('theme-dark')!.click();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(meta.content).toBe('#000000');
    expect(document.activeElement?.id).toBe('theme-dark');

    await start('/next-rating/');
    expect(document.documentElement.dataset.theme).toBe('dark');
    document.getElementById('tab-settings')!.click();
    document.getElementById('theme-device')!.click();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(meta.content).toBe('#ffffff');
    meta.remove();
  });

  it('keeps each player apart and opens on "me" after a reload', async () => {
    await start('/next-rating/');
    (document.getElementById('pdga-number') as HTMLInputElement).value = '100001';
    (document.getElementById('pdga-number') as HTMLInputElement).form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await handOff([detailsHtml]);
    expect(predicted()).toBe('960');
    expect(document.getElementById('add-favorite')).toBeNull();

    await handOff([otherHtml, 'https://www.pdga.com/player/100002/details']);
    expect(predicted()).toBe('1000');
    expect(document.getElementById('add-favorite')!.textContent).toBe('Add #100002 to favorites');
    expect(stored().me).toBe(100001);
    expect(stored().players.map((player: { pdgaNumber: number }) => player.pdgaNumber)).toEqual([100001, 100002]);

    await start('/next-rating/');
    expect(predicted()).toBe('960');
  });

  it('gives event results to every stored player in them', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        players: [
          { pdgaNumber: 100001, favorite: true, import: null },
          { pdgaNumber: 100002, favorite: true, import: null },
          { pdgaNumber: 100003, favorite: true, import: null },
        ],
      }),
    );
    await start('/next-rating/');
    await handOff([eventHtml, EVENT_URL]);
    expect(bannerText()).toContain('Event added for #100001, #100002.');
    expect(predicted()).toBe('990');
    const [first, second, third] = stored().players;
    expect(first.import.events[0].divisions[0].rows).toHaveLength(1);
    expect(second.import.events[0].divisions[0].rows[0].pdgaNumber).toBe('100002');
    expect(third.import).toBeNull();
  });

  it('asks for a player first when event results arrive with nobody stored', async () => {
    await start('/next-rating/');
    await handOff([eventHtml, EVENT_URL]);
    expect(document.getElementById('import-banner')!.getAttribute('role')).toBe('alert');
    expect(bannerText()).toContain('Enter your PDGA number');
    expect(document.querySelector<HTMLAnchorElement>('#import-banner a')!.href).toBe(EVENT_URL);
    // No player is stored, only which bookmarklet this browser has.
    expect(stored().players).toEqual([]);
    expect(stored().bookmarklet).toBe(envelope().bookmarklet);
  });

  it('switches players from the menu, and removes one after asking', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    const other = rawPlayer({ pdgaNumber: '100002', name: 'Other Player' });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        players: [
          { pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } },
          { pdgaNumber: 100002, favorite: true, import: { at, player: other, details: [rawDetailsRow({ rating: '1000' })], events: [] } },
        ],
      }),
    );
    await start('/next-rating/');
    expect(predicted()).toBe('950');
    const menu = () => document.getElementById('players-menu')!;
    expect(menu().textContent).toContain('Players');

    menu().click();
    expect(menu().getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.shell')!.classList.contains('menu-open')).toBe(true);
    expect(document.activeElement?.id).toBe('favorites-title');
    document.getElementById('player-100002')!.click();
    expect(predicted()).toBe('1000');
    expect(menu().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu());

    menu().click();
    document.getElementById('players-edit')!.click();
    document.getElementById('remove-100002')!.click();
    expect(document.activeElement?.id).toBe('remove-cancel-100002');
    document.getElementById('remove-confirm-100002')!.click();
    expect(stored().players.map((player: { pdgaNumber: number }) => player.pdgaNumber)).toEqual([100001]);
    menu().click();
    expect(predicted()).toBe('950');
  });

  it('adds a manual round, keeps the form open for the next one, and deletes it again', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ me: 100001, players: [{ pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } }] }),
    );
    await start('/next-rating/');
    document.getElementById('manual-toggle')!.click();
    // Focus stays on the card's header, so no keyboard pops up.
    expect(document.activeElement?.id).toBe('manual-toggle');
    const rating = () => document.querySelector<HTMLInputElement>('#manual-rating')!;
    rating().value = '1010';
    document.querySelector('#manual-panel')!.dispatchEvent(new Event('submit', { cancelable: true }));

    const [round] = stored().players[0].manualRounds;
    expect(round).toMatchObject({ id: 'm1', rating: 1010, eventName: '', holes: null });
    expect(document.getElementById('manual-status')!.textContent).toBe('Added 1010.');
    expect(document.activeElement).toBe(rating());
    expect(rating().value).toBe('');
    expect([...document.querySelectorAll('.round-meta')].some((meta) => meta.textContent!.includes('Manual'))).toBe(true);

    // Typed but not added: a re-render, as when another tab stores data, keeps it.
    rating().value = '99';
    rating().dispatchEvent(new Event('input'));
    const before = rating();
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(rating()).not.toBe(before);
    expect(rating().value).toBe('99');

    // A single delete does not ask: it happens at once, and Undo gets focus.
    document.getElementById('manual-delete-m1')!.click();
    expect(stored().players[0].manualRounds).toEqual([]);
    expect(document.getElementById('manual-status')!.textContent).toBe('Removed 1010');
    expect(document.activeElement?.id).toBe('manual-undo');

    // Undo lasts through a re-render, and puts the round back as it was.
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    document.getElementById('manual-undo')!.click();
    expect(stored().players[0].manualRounds).toEqual([round]);
    expect(document.getElementById('manual-status')!.textContent).toBe('Restored 1010.');
    expect(document.activeElement?.id).toBe('manual-delete-m1');
    expect(document.getElementById('manual-undo')).toBeNull();

    // Delete all still asks first.
    document.getElementById('manual-clear')!.click();
    expect(stored().players[0].manualRounds).toEqual([round]);
    expect(document.activeElement?.id).toBe('manual-clear-cancel');
    document.getElementById('manual-clear-confirm')!.click();
    expect(stored().players[0].manualRounds).toEqual([]);
    expect(document.getElementById('manual-undo')).toBeNull();
  });

  it('calculates a target, keeps the answer through a re-render, and starts empty for another player', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    const other = rawPlayer({ pdgaNumber: '100002', name: 'Other Player' });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        players: [
          { pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } },
          { pdgaNumber: 100002, favorite: true, import: { at, player: other, details: [rawDetailsRow({ rating: '1000' })], events: [] } },
        ],
      }),
    );
    await start('/next-rating/');
    const toggle = () => document.getElementById('target-toggle')!;
    toggle().click();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.id).toBe('target-toggle');
    expect(document.querySelector<HTMLInputElement>('#target-rating')!.value).toBe('960');

    document.querySelector('#target-panel')!.dispatchEvent(new Event('submit', { cancelable: true }));
    const status = () => document.getElementById('target-status')!;
    expect(status().textContent).toMatch(/^Average at least \d+ in the next 3 rounds to reach 960 at the .+ update\.$/);
    expect(document.activeElement).toBe(status());

    const answer = status().textContent;
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(status().textContent).toBe(answer);

    document.getElementById('players-menu')!.click();
    document.getElementById('player-100002')!.click();
    // The card stays open, with a fresh draft for this player.
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector<HTMLInputElement>('#target-rating')!.value).toBe('1010');
    expect(status().textContent).toBe('');
  });

  it('remembers open cards across launches, with only Rounds open on the first', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        players: [{ pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } }],
      }),
    );
    await start('/next-rating/');
    const expanded = (id: string) => document.getElementById(`${id}-toggle`)!.getAttribute('aria-expanded');
    expect(['top8', 'stats', 'rounds'].map(expanded)).toEqual(['false', 'false', 'true']);

    for (const id of ['top8', 'stats', 'rounds']) document.getElementById(`${id}-toggle`)!.click();
    expect(document.activeElement?.id).toBe('rounds-toggle');
    expect(stored().cards).toMatchObject({ top8: true, stats: true, rounds: false });

    await start('/next-rating/');
    expect(['top8', 'stats', 'rounds'].map(expanded)).toEqual(['true', 'true', 'false']);
  });

  it('remembers the Top 8 period across launches', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        cards: { top8: true },
        players: [{ pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } }],
      }),
    );
    await start('/next-rating/');
    const select = () => document.querySelector<HTMLSelectElement>('#top8-period')!;
    expect(select().value).toBe(`year:${new Date().getFullYear()}`);
    select().focus();
    select().value = 'window';
    select().dispatchEvent(new Event('change'));
    expect(document.activeElement).toBe(select());
    expect(stored().top8Period).toEqual({ kind: 'window' });

    await start('/next-rating/');
    expect(select().value).toBe('window');
  });

  it('shows what another tab stored', async () => {
    await start('/next-rating/');
    expect(predicted()).toBeUndefined();
    const other = JSON.stringify({ me: 100001, players: [{ pdgaNumber: 100001, favorite: true, import: null }] });
    localStorage.setItem(STORAGE_KEY, other);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(document.getElementById('player-100001')!.textContent).toContain('#100001');
    expect(document.querySelector('h1')!.textContent).toBe('#100001');
  });

  it('opens on your number after converting an import of another player, which stays one tap away', async () => {
    localStorage.setItem('next-rating:v1', LIVE_V1);
    await start('/next-rating/');
    expect(localStorage.getItem('next-rating:v1')).toBeNull();
    // You have no import yet, so the app shows the steps to get one for you.
    expect(document.querySelector('h1')!.textContent).toBe('#100001');
    expect(document.querySelector<HTMLAnchorElement>('#details-link')!.href).toBe('https://www.pdga.com/player/100001/details');

    document.getElementById('players-menu')!.click();
    document.getElementById('player-100002')!.click();
    expect(document.querySelector('h1')!.textContent).toBe('Other Player #100002');
    expect(predicted()).toBe('1010');
    expect(document.getElementById('add-favorite')!.textContent).toBe('Add #100002 to favorites');
  });

  it('migrates data stored by the previous version', async () => {
    localStorage.setItem('next-rating:v1', JSON.stringify({ pdgaNumber: 100001, language: 'sv' }));
    await start('/next-rating/');
    expect(stored()).toMatchObject({ language: 'sv', me: 100001 });
    expect(localStorage.getItem('next-rating:v1')).toBeNull();
    expect(document.documentElement.lang).toBe('sv');
  });

  it('shows an error for a broken hand-off and stores nothing', async () => {
    await start('/next-rating/#d=not-a-hand-off');
    expect(location.hash).toBe('');
    await vi.waitFor(() => expect(document.getElementById('import-banner')).not.toBeNull());
    expect(document.getElementById('import-banner')!.getAttribute('role')).toBe('alert');
    expect(document.getElementById('open-setup')).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
