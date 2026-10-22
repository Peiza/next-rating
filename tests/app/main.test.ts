// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from '../../src/app/storage';
import { encodeHandoff } from '../../src/handoff';
import { envelope, handoffPage, rawDetailsRow, rawEvent, rawEventRow, rawPlayer } from '../handoff/raw';
import { LIVE_V1 } from './live-v1';
import { detailsRow, detailsTable, eventDivision, eventPage, eventRow, playerHeader } from '../parsers/html';

/** Loads the app as a fresh page load would. */
async function start(url: string, clearState = true): Promise<void> {
  history.replaceState(clearState ? null : history.state, '', url);
  document.body.replaceChildren(Object.assign(document.createElement('div'), { id: 'app' }));
  vi.resetModules();
  await import('../../src/app/main');
}

// Official ratings equal to what the rounds give, since without new rated rounds the prediction keeps the official rating.
const detailsHtml = playerHeader('Test Player', '100001', '960') + detailsTable([detailsRow({ round: '1', rating: '950' }), detailsRow({ round: '2', rating: '970' })]);
const otherHtml = playerHeader('Other Player', '100002', '1000') + detailsTable([detailsRow({ rating: '1000' })]);

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

/**
 * Resolves after the next popstate, once the app has shown it: the app
 * listens from its load, so it runs first.
 */
function popped(): Promise<void> {
  return new Promise((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
}

/** The phone's back gesture. */
async function goBack(): Promise<void> {
  const done = popped();
  history.back();
  await done;
}

/** Clicks a button that closes a layer by going back in history, and waits for it. */
async function clickBack(id: string): Promise<void> {
  const done = popped();
  document.getElementById(id)!.click();
  await done;
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

  it('names the app in the top bar on the start view, and a player without data by number', async () => {
    await start('/next-rating/');
    const barTitle = () => document.getElementById('topbar-title')?.textContent;
    expect(barTitle()).toBe('Next Rating');
    expect(document.getElementById('view-title')!.classList.contains('wide-only')).toBe(true);
    document.getElementById('players-menu')!.click();
    expect(barTitle()).toBe('Switch player');
    // Adding shows the player and closes the panel, back over its history entry.
    const done = popped();
    (document.getElementById('player-add') as HTMLInputElement).value = '100002';
    (document.getElementById('player-add') as HTMLInputElement).form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await done;
    expect(barTitle()).toBe('#100002');
    expect(document.getElementById('view-title')!.textContent).toBe('#100002');
  });

  it('switches the first step between your PDGA number and a search by name', async () => {
    await start('/next-rating/');
    document.getElementById('start-by-name')!.click();
    expect(document.activeElement?.id).toBe('start-by-name');
    expect(document.getElementById('pdga-number')).toBeNull();
    expect(document.getElementById('start-search')).not.toBeNull();
    document.getElementById('start-by-number')!.click();
    expect(document.activeElement?.id).toBe('start-by-number');
    (document.getElementById('pdga-number') as HTMLInputElement).value = '100001';
    (document.getElementById('pdga-number') as HTMLInputElement).form!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(stored().me).toBe(100001);
  });

  it('has only the Rating and Settings tabs', async () => {
    await start('/next-rating/');
    expect([...document.querySelectorAll('.tab')].map((tab) => tab.id)).toEqual(['tab-rating', 'tab-settings']);
  });

  it('shows each tab where it was last scrolled, and the tab already shown at the top', async () => {
    const scrollAt = (y: number) => Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
    const scrolledTo = () => vi.mocked(window.scrollTo).mock.lastCall;
    const tap = (id: string) => document.getElementById(id)!.click();
    try {
      await start('/next-rating/');
      scrollAt(400);
      tap('tab-settings');
      expect(scrolledTo()).toEqual([0, 0]);
      scrollAt(150);
      tap('tab-rating');
      expect(scrolledTo()).toEqual([0, 400]);
      tap('tab-rating');
      expect(scrolledTo()).toEqual([0, 0]);
      tap('tab-settings');
      expect(scrolledTo()).toEqual([0, 150]);

      // A view over the tab, or the players panel, keeps the position from before it opened.
      scrollAt(300);
      tap('open-setup');
      scrollAt(900);
      let done = popped();
      tap('tab-settings');
      await done;
      expect(scrolledTo()).toEqual([0, 300]);
      tap('tab-rating');
      scrollAt(500);
      tap('players-menu');
      scrollAt(0);
      done = popped();
      tap('tab-rating');
      await done;
      expect(scrolledTo()).toEqual([0, 500]);

      // A launch starts every tab at the top.
      await start('/next-rating/');
      tap('tab-settings');
      expect(scrolledTo()).toEqual([0, 0]);
    } finally {
      scrollAt(0);
    }
  });

  it('opens the bookmarklet setup over the current tab and goes back to where it was opened', async () => {
    await start('/next-rating/');
    const open = document.getElementById('open-setup') as HTMLButtonElement;
    open.focus();
    open.click();
    // jsdom is a phone: the top bar holds the heading, and the view's own shows only on wide screens.
    expect(document.activeElement?.id).toBe('topbar-title');
    expect(document.activeElement?.textContent).toBe('Install the bookmarklet');
    expect(document.getElementById('setup-title')!.classList.contains('wide-only')).toBe(true);
    const code = document.getElementById('bookmarklet-code') as HTMLTextAreaElement;
    expect(code.value.startsWith('javascript:')).toBe(true);
    // jsdom is neither a phone nor a touch Mac.
    expect(document.querySelector<HTMLInputElement>('#platform-computer')!.checked).toBe(true);
    document.getElementById('platform-android')!.click();
    expect(document.activeElement?.id).toBe('platform-android');
    expect(document.querySelector('#setup-steps-title')!.textContent).toBe('Android browsers');
    await clickBack('setup-back');
    expect(document.getElementById('bookmarklet-code')).toBeNull();
    expect(document.activeElement?.id).toBe('open-setup');
  });

  it('names the page after the bookmarklet while the setup shows, so a bookmark made there gets that name', async () => {
    await start('/next-rating/');
    expect(document.title).toBe('Next Rating');
    document.getElementById('open-setup')!.click();
    expect(document.title).toBe('Next Rating: get data');
    await clickBack('setup-back');
    expect(document.title).toBe('Next Rating');
    // The back gesture restores it too, and Swedish has its own name.
    document.getElementById('tab-settings')!.click();
    const language = document.getElementById('language') as HTMLSelectElement;
    language.value = 'sv';
    language.dispatchEvent(new Event('change'));
    document.getElementById('open-setup')!.click();
    expect(document.title).toBe('Next Rating: hämta data');
    await goBack();
    expect(document.getElementById('bookmarklet-code')).toBeNull();
    expect(document.title).toBe('Next Rating');
  });

  it('adds a history entry with the same address for each page opened over the tab, which the back gesture closes', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        players: [{ pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } }],
      }),
    );
    await start('/next-rating/');
    const menu = () => document.getElementById('players-menu')!;

    document.getElementById('tab-settings')!.click();
    document.getElementById('open-guide')!.focus();
    document.getElementById('open-guide')!.click();
    // Measured from the first entry the app added, since earlier tests leave entries behind.
    const length = history.length - 1;
    expect(history.state).toEqual({ nextRating: 1, overlay: 'guide', menu: false, depth: 1 });
    expect(location.href).toBe('http://localhost:3000/next-rating/');
    // The players panel over How it works: back closes the panel, then How it works, in that order.
    menu().click();
    expect(history.length).toBe(length + 2);
    await goBack();
    expect(menu().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu());
    expect(document.getElementById('guide-title')).not.toBeNull();
    await goBack();
    expect(document.getElementById('guide-title')).toBeNull();
    expect(document.activeElement?.id).toBe('open-guide');

    // Forward shows it again, and the app's own Back leaves no entry behind.
    const forward = popped();
    history.forward();
    await forward;
    expect(document.getElementById('guide-title')).not.toBeNull();
    await clickBack('guide-back');
    document.getElementById('open-setup')!.click();
    expect(history.length).toBe(length + 1);

    // Picking a player from the panel over the setup closes both and goes back over both entries.
    menu().click();
    const unwound = popped();
    document.getElementById('player-100001')!.click();
    expect(document.getElementById('bookmarklet-code')).toBeNull();
    await unwound;
    expect(history.state).toBeNull();
    expect(document.getElementById('predicted')).not.toBeNull();
    expect(location.href).toBe('http://localhost:3000/next-rating/');
  });

  it('shows the page an entry stands for after a fresh load on it', async () => {
    await start('/next-rating/');
    history.replaceState({ nextRating: 1, overlay: 'setup', menu: false, depth: 1 }, '', '/next-rating/');
    await start('/next-rating/', false);
    expect(document.getElementById('bookmarklet-code')).not.toBeNull();
    // Anything else in the state is not the app's.
    history.replaceState({ nextRating: 1, overlay: 'setup', menu: false, depth: 0 }, '', '/next-rating/');
    await start('/next-rating/', false);
    expect(document.getElementById('bookmarklet-code')).toBeNull();
  });

  it('opens How it works from Settings and from a card at its section, and goes back to where it was opened', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        cards: { stats: true },
        players: [{ pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } }],
      }),
    );
    await start('/next-rating/');
    document.getElementById('stats-guide')!.focus();
    document.getElementById('stats-guide')!.click();
    expect(document.activeElement?.id).toBe('guide-rules');
    expect(document.getElementById('stats')).toBeNull();
    await clickBack('guide-back');
    expect(document.activeElement?.id).toBe('stats-guide');

    document.getElementById('tab-settings')!.click();
    document.getElementById('open-guide')!.focus();
    document.getElementById('open-guide')!.click();
    expect(document.activeElement?.id).toBe('topbar-title');
    expect(document.activeElement?.textContent).toBe('How it works');
    await clickBack('guide-back');
    expect(document.activeElement?.id).toBe('open-guide');
  });

  it('puts focus on the view’s own heading on wide screens, where the top bar is hidden', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    try {
      await start('/next-rating/');
      document.getElementById('open-setup')!.click();
      expect(document.activeElement?.id).toBe('setup-title');
      await clickBack('setup-back');
      document.getElementById('tab-settings')!.click();
      document.getElementById('open-guide')!.click();
      expect(document.activeElement?.id).toBe('guide-title');
      await clickBack('guide-back');
      document.getElementById('players-menu')!.click();
      expect(document.activeElement?.id).toBe('favorites-title');
    } finally {
      vi.unstubAllGlobals();
    }
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

  it('applies the text size from Settings when the slider is let go, and keeps it after a reload', async () => {
    const html = document.documentElement;
    await start('/next-rating/');
    expect(html.style.fontSize).toBe('');
    document.getElementById('tab-settings')!.click();
    const slider = document.getElementById('text-size') as HTMLInputElement;
    slider.focus();
    slider.value = '19';
    slider.dispatchEvent(new Event('input'));
    // While it moves, the page keeps its size and the slider is not rebuilt under the finger.
    expect(html.style.fontSize).toBe('');
    expect(document.getElementById('text-size')).toBe(slider);
    slider.dispatchEvent(new Event('change'));
    expect(html.style.fontSize).toBe('19px');
    // Headings and large numbers change by half as much; jsdom's root size, the device size here, is 16 px.
    expect(Number(html.style.getPropertyValue('--display-scale'))).toBeCloseTo((19 + 16) / 38);
    expect(stored().textSize).toBe(19);
    expect(document.activeElement?.id).toBe('text-size');

    await start('/next-rating/');
    expect(html.style.fontSize).toBe('19px');
    document.getElementById('tab-settings')!.click();
    expect((document.getElementById('text-size') as HTMLInputElement).value).toBe('19');
    document.getElementById('text-size-reset')!.click();
    expect(html.style.fontSize).toBe('');
    expect(html.style.getPropertyValue('--display-scale')).toBe('');
    expect(stored().textSize).toBeNull();
    expect(document.activeElement?.id).toBe('text-size');
  });

  it('stores the How it works text step without drawing the page again, on top of the Settings size', async () => {
    await start('/next-rating/');
    document.getElementById('tab-settings')!.click();
    document.getElementById('open-guide')!.click();
    const page = document.querySelector<HTMLElement>('.guide')!;
    document.getElementById('guide-text-larger')!.click();
    document.getElementById('guide-text-larger')!.click();
    // jsdom's root size, the device size here, is 16 px; the rest of the app keeps it.
    expect(page.style.fontSize).toBe('18px');
    expect(document.querySelector('.guide')).toBe(page);
    expect(document.documentElement.style.fontSize).toBe('');
    expect(stored().guideTextStep).toBe(2);

    await start('/next-rating/');
    document.getElementById('tab-settings')!.click();
    const slider = document.getElementById('text-size') as HTMLInputElement;
    slider.value = '20';
    slider.dispatchEvent(new Event('change'));
    document.getElementById('open-guide')!.click();
    // The step stays when the Settings size changes.
    expect(document.querySelector<HTMLElement>('.guide')!.style.fontSize).toBe('22px');
    expect(document.getElementById('guide-text-value')!.textContent).toBe('22');
  });

  it('applies the date format from Settings and keeps it after a reload', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        players: [{ pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } }],
      }),
    );
    await start('/next-rating/');
    document.getElementById('tab-settings')!.click();
    const select = () => document.querySelector<HTMLSelectElement>('#date-format')!;
    expect(select().value).toBe('');
    select().focus();
    select().value = 'day';
    select().dispatchEvent(new Event('change'));
    expect(stored().dateOrder).toBe('day');
    expect(document.activeElement).toBe(select());
    document.getElementById('tab-rating')!.click();
    expect(document.getElementById('refresh-help')!.textContent).toContain('01/10/2026');

    await start('/next-rating/');
    expect(document.getElementById('refresh-help')!.textContent).toContain('01/10/2026');
    document.getElementById('tab-settings')!.click();
    select().value = 'year';
    select().dispatchEvent(new Event('change'));
    document.getElementById('tab-rating')!.click();
    expect(document.getElementById('refresh-help')!.textContent).toContain('2026-10-01');
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

  it('shows every round after "Show more" through re-renders, until another player is shown', async () => {
    await start('/next-rating/');
    (document.getElementById('pdga-number') as HTMLInputElement).value = '100001';
    (document.getElementById('pdga-number') as HTMLInputElement).form!.dispatchEvent(new Event('submit', { cancelable: true }));
    // Two rounds that count, then two outside the window: the list ends with the first of those.
    const older = [detailsRow({ eventId: '900010', date: '1-Jul-2023', rating: '900' }), detailsRow({ eventId: '900011', date: '1-Jun-2023', rating: '900' })];
    await handOff([playerHeader('Test Player', '100001', '960') + detailsTable([detailsRow({ round: '1', rating: '950' }), detailsRow({ round: '2', rating: '970' }), ...older])]);
    await handOff([otherHtml, 'https://www.pdga.com/player/100002/details']);
    document.getElementById('add-favorite')!.click();
    await start('/next-rating/');
    const rounds = () => document.querySelectorAll('#rounds-body .round').length;
    expect(rounds()).toBe(3);
    const more = document.getElementById('rounds-more')!;
    expect(more.textContent).toBe('Show 1 more round');
    more.click();
    expect(rounds()).toBe(4);
    expect(document.getElementById('rounds-more')).toBeNull();
    expect(document.activeElement?.id).toBe('rounds-next');

    document.getElementById('tab-settings')!.click();
    document.getElementById('tab-rating')!.click();
    expect(rounds()).toBe(4);

    for (const pdgaNumber of [100002, 100001]) {
      document.getElementById('players-menu')!.click();
      const done = popped();
      document.getElementById(`player-${pdgaNumber}`)!.click();
      await done;
    }
    expect(rounds()).toBe(3);
    expect(document.getElementById('rounds-more')).not.toBeNull();
  });

  it('opens on the last viewed player when Settings says so, and on an imported player after a hand-off', async () => {
    await start('/next-rating/');
    (document.getElementById('pdga-number') as HTMLInputElement).value = '100001';
    (document.getElementById('pdga-number') as HTMLInputElement).form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await handOff([detailsHtml]);
    await handOff([otherHtml, 'https://www.pdga.com/player/100002/details']);
    document.getElementById('add-favorite')!.click();
    expect(stored().lastViewed).toBeNull();

    // With "You" a reload opens on you, and switching players writes nothing.
    await start('/next-rating/');
    expect(predicted()).toBe('960');
    document.getElementById('tab-settings')!.click();
    document.getElementById('open-with-last')!.click();
    expect(document.activeElement?.id).toBe('open-with-last');
    expect(stored()).toMatchObject({ openWith: 'last', lastViewed: 100001 });

    document.getElementById('players-menu')!.click();
    document.getElementById('player-100002')!.click();
    expect(stored().lastViewed).toBe(100002);
    await start('/next-rating/');
    expect(predicted()).toBe('1000');

    // A hand-off still opens the imported player, who is then the last viewed.
    await handOff([detailsHtml]);
    expect(predicted()).toBe('960');
    await start('/next-rating/');
    expect(predicted()).toBe('960');

    // A removed player falls back to you.
    const players = stored().players.filter((player: { pdgaNumber: number }) => player.pdgaNumber !== 100002);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored(), lastViewed: 100002, players }));
    await start('/next-rating/');
    expect(predicted()).toBe('960');

    // Back to "You": the last viewed player is forgotten.
    document.getElementById('tab-settings')!.click();
    document.getElementById('open-with-me')!.click();
    expect(stored()).toMatchObject({ openWith: 'me', lastViewed: null });
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
    const other = rawPlayer({ pdgaNumber: '100002', name: 'Other Player', currentRating: '1000' });
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
    const barTitle = () => document.getElementById('topbar-title')?.textContent;
    expect(menu().textContent).toContain('Players');
    expect(barTitle()).toBe('Test Player #100001');

    menu().click();
    expect(menu().getAttribute('aria-expanded')).toBe('true');
    expect(menu().textContent).toBe('Close');
    expect(document.querySelector('.shell')!.classList.contains('menu-open')).toBe(true);
    // jsdom is a phone: the bar shows the panel's heading next to Close, and it gets focus.
    expect(barTitle()).toBe('Switch player');
    expect(document.activeElement?.id).toBe('topbar-title');
    await clickBack('player-100002');
    expect(predicted()).toBe('1000');
    expect(barTitle()).toBe('Other Player #100002');
    expect(menu().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu());

    // Settings shows its heading in the bar, and only on wide screens in the view.
    document.getElementById('tab-settings')!.click();
    expect(barTitle()).toBe('Settings');
    expect(document.getElementById('view-title')!.classList.contains('wide-only')).toBe(true);
    document.getElementById('tab-rating')!.click();

    menu().click();
    document.getElementById('players-edit')!.click();
    document.getElementById('remove-100002')!.click();
    expect(document.activeElement?.id).toBe('remove-cancel-100002');
    document.getElementById('remove-confirm-100002')!.click();
    expect(stored().players.map((player: { pdgaNumber: number }) => player.pdgaNumber)).toEqual([100001]);
    await clickBack('players-menu');
    expect(menu().getAttribute('aria-expanded')).toBe('false');
    expect(predicted()).toBe('950');
  });

  it("shows each player's prediction in the players list, the same as the Rating tab, also after a manual round", async () => {
    const at = '2026-10-01T10:00:00.000Z';
    const other = rawPlayer({ pdgaNumber: '100002', name: 'Other Player', currentRating: '1000' });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        players: [
          { pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } },
          { pdgaNumber: 100002, favorite: true, import: { at, player: other, details: [rawDetailsRow({ rating: '1000' })], events: [] } },
          { pdgaNumber: 100003, favorite: true, import: null },
        ],
      }),
    );
    await start('/next-rating/');
    const listed = (pdgaNumber: number, part: string) => document.querySelector(`#player-${pdgaNumber} .${part}`);
    expect(listed(100001, 'player-rating')!.textContent).toBe(predicted());
    expect(listed(100002, 'player-rating')!.textContent).toBe('1000');
    // No new rounds: the official rating, with no change.
    expect(listed(100002, 'player-change')!.textContent).toBe('→0');
    expect(document.getElementById('player-100003')).not.toBeNull();
    expect(listed(100003, 'player-prediction')).toBeNull();

    document.getElementById('manual-toggle')!.click();
    document.querySelector<HTMLInputElement>('#manual-rating')!.value = '1010';
    document.querySelector('#manual-panel')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(predicted()).not.toBe('950');
    expect(listed(100001, 'player-rating')!.textContent).toBe(predicted());
    expect(listed(100001, 'player-change')!.classList.contains('change-up')).toBe(true);
  });

  it('leaves an unofficial event out with one tap, stored per player, and counts it again', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    const event = rawEvent({ date: '20-Sep-2026' }, [rawEventRow('100001', ['1040', '1030'])]);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        cards: { rounds: true },
        players: [{ pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [event] } }],
      }),
    );
    await start('/next-rating/');
    const counted = predicted();
    const box = () => document.querySelector<HTMLInputElement>('#count-event-0')!;
    box().focus();
    box().click();
    expect(stored().players[0].leftOut).toEqual(['e:900002']);
    expect(predicted()).toBe('950');
    expect(predicted()).not.toBe(counted);
    expect(box().checked).toBe(false);
    expect(document.activeElement).toBe(box());
    box().click();
    expect(stored().players[0].leftOut).toEqual([]);
    expect(predicted()).toBe(counted);
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
    expect(round).toMatchObject({ id: 'm1', rating: 1010, eventName: '', holes: null, example: false });
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

  it('edits a manual round from the Rounds card in place, and ends the edit when the round goes', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    const rounds = [
      { id: 'm1', rating: 950, date: '2026-10-10', eventName: '', holes: null, example: false },
      { id: 'm2', rating: 985, date: '2026-10-12', eventName: 'Club night', holes: 9, example: false },
    ];
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        players: [{ pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] }, manualRounds: rounds }],
      }),
    );
    await start('/next-rating/');
    const rating = () => document.querySelector<HTMLInputElement>('#manual-rating')!;
    // Typed before the edit: the form gets it back afterwards.
    document.getElementById('manual-toggle')!.click();
    rating().value = '777';
    rating().dispatchEvent(new Event('input'));
    document.getElementById('manual-toggle')!.click();

    // The card was closed; a tap on the row opens it with the round, and focus on the form's heading.
    document.querySelector<HTMLElement>('#round-edit-m2')!.closest('li')!.click();
    expect(stored().cards.manual).toBe(true);
    expect(document.activeElement?.id).toBe('manual-edit-title');
    expect(rating().value).toBe('985');
    expect(document.querySelector<HTMLInputElement>('#manual-event')!.value).toBe('Club night');
    rating().value = '990';
    document.querySelector('#manual-panel')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(stored().players[0].manualRounds).toEqual([rounds[0], { ...rounds[1], rating: 990 }]);
    expect(document.getElementById('manual-status')!.textContent).toBe('990 saved.');
    expect(document.activeElement?.id).toBe('manual-edit-m2');
    expect(document.getElementById('manual-add')).not.toBeNull();
    expect(rating().value).toBe('777');

    // Cancel saves nothing, and focus goes back to the button that opened the edit.
    document.getElementById('manual-edit-m1')!.click();
    rating().value = '1';
    document.getElementById('manual-edit-cancel')!.click();
    expect(stored().players[0].manualRounds[0]).toEqual(rounds[0]);
    expect(document.activeElement?.id).toBe('manual-edit-m1');
    expect(rating().value).toBe('777');

    // Deleting the edited round ends the edit, with Undo as after any delete.
    document.getElementById('manual-edit-m1')!.click();
    document.getElementById('manual-delete-m1')!.click();
    expect(document.getElementById('manual-edit-title')).toBeNull();
    expect(document.getElementById('manual-status')!.textContent).toBe('Removed 950');

    // Removed in another tab while edited: the edit ends unsaved and says so.
    document.getElementById('manual-edit-m2')!.click();
    const data = stored();
    data.players[0].manualRounds = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(document.getElementById('manual-edit-title')).toBeNull();
    expect(document.getElementById('manual-status')!.textContent).toBe('That round was removed, so nothing was saved.');
  });

  it('calculates a target, keeps the answer through a re-render, and starts empty for another player', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    const other = rawPlayer({ pdgaNumber: '100002', name: 'Other Player', currentRating: '1000' });
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
    expect(document.querySelector<HTMLInputElement>('#target-date')!.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    document.querySelector('#target-panel')!.dispatchEvent(new Event('submit', { cancelable: true }));
    const status = () => document.getElementById('target-status')!;
    const lines = [...status().querySelectorAll('p')].map((p) => p.textContent);
    expect(lines).toEqual([
      expect.stringMatching(/^\d+$/),
      expect.stringMatching(/^Average round rating needed in your next 3 rounds to reach 960 at the .+ update\.$/),
      expect.stringMatching(/^Last round on .+, report deadline .+\.$/),
      expect.stringMatching(/^No rounds leave the window by .+\.$/),
    ]);
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

  it('remembers the chart period across launches, and draws the chart after Why it changed', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        players: [{ pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } }],
      }),
    );
    await start('/next-rating/');
    expect(document.getElementById('chart-toggle')!.getAttribute('aria-expanded')).toBe('false');
    document.getElementById('chart-toggle')!.click();
    expect(stored().cards.chart).toBe(true);
    const select = () => document.querySelector<HTMLSelectElement>('#chart-period')!;
    expect(select().value).toBe('recent');
    expect(document.querySelector('#chart-plot')).not.toBeNull();
    select().focus();
    select().value = 'window';
    select().dispatchEvent(new Event('change'));
    expect(document.activeElement).toBe(select());
    expect(stored().chartPeriod).toEqual({ kind: 'window' });

    await start('/next-rating/');
    expect(select().value).toBe('window');
  });

  it('keeps the chart table open across views, a language change and launches', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        cards: { chart: true },
        players: [{ pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } }],
      }),
    );
    await start('/next-rating/');
    const table = () => document.querySelector<HTMLDetailsElement>('#chart-table')!;
    expect(table().open).toBe(false);
    table().open = true;
    table().dispatchEvent(new Event('toggle'));
    expect(stored().chartTable).toBe(true);

    document.getElementById('tab-settings')!.click();
    const language = document.querySelector<HTMLSelectElement>('#language')!;
    language.value = 'sv';
    language.dispatchEvent(new Event('change'));
    document.getElementById('tab-rating')!.click();
    expect(table().open).toBe(true);

    await start('/next-rating/');
    expect(table().open).toBe(true);
    table().open = false;
    table().dispatchEvent(new Event('toggle'));
    expect(stored().chartTable).toBe(false);
  });

  it('on a touch screen, puts focus near a select after a choice instead of on it, so iOS does not open it again', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        cards: { chart: true, top8: true },
        players: [{ pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } }],
      }),
    );
    const choose = (id: string, value: string) => {
      const select = document.querySelector<HTMLSelectElement>(`#${id}`)!;
      select.focus();
      select.value = value;
      select.dispatchEvent(new Event('change'));
    };
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
    try {
      await start('/next-rating/');
      choose('chart-period', 'window');
      expect(document.activeElement?.id).toBe('chart-toggle');
      choose('top8-period', 'custom');
      expect(document.activeElement?.id).toBe('top8-toggle');
      // A custom range's dates open a picker too.
      const from = document.querySelector<HTMLInputElement>('#top8-from')!;
      from.focus();
      from.value = '2026-01-01';
      from.dispatchEvent(new Event('change'));
      expect(stored().top8Period).toMatchObject({ kind: 'custom', from: '2026-01-01' });
      expect(document.activeElement?.id).toBe('top8-toggle');
      document.getElementById('tab-settings')!.click();
      choose('language', 'sv');
      expect(document.activeElement?.id).toBe('topbar-title');
      choose('date-format', 'year');
      expect(document.activeElement?.id).toBe('topbar-title');
    } finally {
      vi.unstubAllGlobals();
    }
    // With a mouse or keyboard, focus stays on the select.
    await start('/next-rating/');
    choose('chart-period', 'recent');
    expect(document.activeElement?.id).toBe('chart-period');
  });

  it('opens the chart full screen as a history entry, which Close or back closes', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        cards: { chart: true },
        players: [{ pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } }],
      }),
    );
    await start('/next-rating/');
    // The x-axis is kept with the settings, and focus stays on the choice.
    const even = () => document.querySelector<HTMLInputElement>('#chart-axis-even')!;
    even().focus();
    even().click();
    expect(stored().chartAxis).toBe('even');
    expect(document.activeElement).toBe(even());
    expect(even().checked).toBe(true);

    const button = () => document.getElementById('chart-full-screen')!;
    button().focus();
    button().click();
    expect(history.state).toMatchObject({ overlay: 'chart', depth: 1 });
    expect(document.activeElement?.id).toBe('chart-full-title');
    expect(document.querySelector('[role="dialog"]')!.getAttribute('aria-labelledby')).toBe('chart-full-title');
    expect(document.getElementById('chart-full-plot')).not.toBeNull();
    // The chart is all the page shows, so no ids repeat; only wide and tall screens show its own period select.
    expect(document.querySelector('.tabbar, #chart-plot, #chart-period')).toBeNull();
    expect(document.querySelector('select')!.closest('.chart-full-controls')).not.toBeNull();
    // A period picked there is the card's too, and the chart stays full screen with focus on the select.
    const fullPeriod = document.querySelector<HTMLSelectElement>('#chart-full-period')!;
    fullPeriod.focus();
    fullPeriod.value = 'window';
    fullPeriod.dispatchEvent(new Event('change'));
    expect(stored().chartPeriod).toEqual({ kind: 'window' });
    expect(document.activeElement?.id).toBe('chart-full-period');
    expect(document.getElementById('chart-full-plot')).not.toBeNull();

    await clickBack('chart-full-close');
    expect(document.getElementById('chart-full-plot')).toBeNull();
    expect(document.activeElement).toBe(button());

    button().click();
    await goBack();
    expect(document.getElementById('chart-full-plot')).toBeNull();
    expect(document.activeElement).toBe(button());

    // A fresh load on its entry shows it again, and without a player to chart, the Rating tab.
    history.pushState({ nextRating: 1, overlay: 'chart', menu: false, depth: 1 }, '', '/next-rating/');
    await start('/next-rating/', false);
    expect(document.getElementById('chart-full-plot')).not.toBeNull();
    localStorage.clear();
    await start('/next-rating/', false);
    expect(document.getElementById('chart-full-plot')).toBeNull();
    expect(document.querySelector('.tabbar')).not.toBeNull();
    history.replaceState(null, '', '/next-rating/');
  });

  it('asks for full screen and landscape where the browser allows it, and closes when full screen ends', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        cards: { chart: true },
        players: [{ pdgaNumber: 100001, favorite: true, import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] } }],
      }),
    );
    let fullscreen: Element | null = null;
    const lock = vi.fn(() => Promise.resolve());
    const unlock = vi.fn();
    const exit = vi.fn(() => {
      fullscreen = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    const request = vi.fn(function (this: Element) {
      fullscreen = this;
      return Promise.resolve();
    });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });
    Object.defineProperty(screen, 'orientation', { configurable: true, value: { lock, unlock } });
    try {
      await start('/next-rating/');
      document.getElementById('chart-full-screen')!.click();
      expect(request).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(lock).toHaveBeenCalledWith('landscape'));

      // Close leaves full screen, and closes the chart only once.
      await clickBack('chart-full-close');
      expect(exit).toHaveBeenCalledTimes(1);
      expect(unlock).toHaveBeenCalled();
      expect(history.state).toBeNull();

      // Android's back leaves full screen first: the chart closes with it.
      document.getElementById('chart-full-screen')!.click();
      const closed = popped();
      fullscreen = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      await closed;
      expect(document.getElementById('chart-full-plot')).toBeNull();
      expect(history.state).toBeNull();
    } finally {
      for (const name of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']) delete (document as unknown as Record<string, unknown>)[name];
      delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
      delete (screen as unknown as Record<string, unknown>).orientation;
    }
  });

  it('remembers whether the Top 8 counts manual rounds across launches', async () => {
    const at = '2026-10-01T10:00:00.000Z';
    const date = new Date().toISOString().slice(0, 10);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        me: 100001,
        cards: { top8: true },
        players: [
          {
            pdgaNumber: 100001,
            favorite: true,
            import: { at, player: rawPlayer(), details: [rawDetailsRow()], events: [] },
            manualRounds: [{ id: 'm1', rating: 1111, date, eventName: '', holes: null, example: false }],
          },
        ],
      }),
    );
    await start('/next-rating/');
    const box = () => document.querySelector<HTMLInputElement>('#top8-own')!;
    const high = () => document.querySelector('.top8-rounds')?.textContent ?? '';
    expect(box().checked).toBe(false);
    expect(high()).not.toContain('1111');
    box().focus();
    box().checked = true;
    box().dispatchEvent(new Event('change'));
    expect(document.activeElement).toBe(box());
    expect(stored().top8Own).toBe(true);
    expect(high()).toContain('1111');

    await start('/next-rating/');
    expect(box().checked).toBe(true);
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
