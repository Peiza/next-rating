// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from '../../src/app/storage';
import { encodeHandoff } from '../../src/handoff';
import { envelope, handoffPage } from '../handoff/raw';
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

  it('asks whose rounds a pasted table holds before importing it', async () => {
    const tsv = [
      'Tournament\tTier\tDate\tDivision\tRound\tScore\tRating\tEvaluated\tIncluded',
      'Example Open\tC\t2-Aug-2026\tMA1\t1\t54\t950\tYes\tYes',
      'Example Open\tC\t2-Aug-2026\tMA1\t2\t52\t970\tYes\tYes',
    ].join('\n');
    await start('/next-rating/');
    document.getElementById('tab-import')!.click();
    const paste = new Event('paste', { cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: (type: string) => (type === 'text/plain' ? tsv : '') },
    });
    document.getElementById('paste-target')!.dispatchEvent(paste);

    const owner = document.getElementById('paste-owner') as HTMLInputElement;
    expect(document.activeElement).toBe(owner);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    owner.value = '100003';
    owner.form!.dispatchEvent(new Event('submit', { cancelable: true }));

    expect(document.getElementById('import-banner')!.textContent).toContain('Imported 2 rounds');
    expect(stored().players).toMatchObject([{ pdgaNumber: 100003, favorite: false }]);
    document.getElementById('add-favorite')!.click();
    expect(stored().players).toMatchObject([{ pdgaNumber: 100003, favorite: true }]);
    expect(document.getElementById('add-favorite')).toBeNull();
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
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('shows what another tab stored', async () => {
    await start('/next-rating/');
    expect(predicted()).toBeUndefined();
    const other = JSON.stringify({ me: 100001, players: [{ pdgaNumber: 100001, favorite: true, import: null }] });
    localStorage.setItem(STORAGE_KEY, other);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect((document.getElementById('pdga-number') as HTMLInputElement).value).toBe('100001');
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
    expect(document.getElementById('open-import')).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
