// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { el, textWithNodes } from '../../src/app/dom';
import { formatCount, formatDate, setDateOrder } from '../../src/app/format';
import type { StoredImport } from '../../src/app/import';
import { buildModel, manualToRounds } from '../../src/app/model';
import { bannerView, updateNotice } from '../../src/app/views/banner';
import { GUIDE_SECTIONS, guideSectionId, guideView, type GuideProps } from '../../src/app/views/guide';
import { ratingView, shownRounds } from '../../src/app/views/rating';
import { arrowAngle, slopeArrow, strength } from '../../src/app/views/change';
import type { ListedResult } from '../../src/app/model';
import type { RoundStatus } from '../../src/engine';
import { chartData } from '../../src/app/chart';
import { topEight, type TopPeriod } from '../../src/app/top8';
import type { Top8Props } from '../../src/app/views/top8';
import { settingsView, versionText, type SettingsProps } from '../../src/app/views/settings';
import { KOFI_URL } from '../../src/app/views/support';
import { bookmarkletStatus, guessPlatform, isOlderVersion, setupView, type SetupProps } from '../../src/app/views/setup';
import { BOOKMARKLET_VERSION } from '../../src/bookmarklet/version';
import { startView, type StartProps } from '../../src/app/views/start';
import { playersPanel, topBar, type PlayersProps } from '../../src/app/views/players';
import { CARDS, DEFAULT_CARDS, type CardState, type StoredPlayer } from '../../src/app/storage';
import { displayScale } from '../../src/app/text-size';
import { setLanguage } from '../../src/i18n';

/** The angle an arrow drawing is turned, in degrees up from flat, read from its SVG transform. */
function drawnAngle(arrow: Element): number {
  const turn = arrow.querySelector('path')!.getAttribute('transform');
  return turn === null ? 0 : -Number(/^rotate\((-?\d+(?:\.\d+)?) 10 10\)$/.exec(turn)![1]);
}
import { rawDetailsRow, rawEvent, rawEventRow, rawPlayer, rawProfileEvent } from '../handoff/raw';

afterEach(() => setLanguage('en'));

/** Three days after the imports below. */
const NOW = new Date('2026-10-04T10:00:00.000Z');

/** Every Rating tab card open, so their content shows. */
const THIS_YEAR: TopPeriod = { kind: 'year', year: null };

const ALL_OPEN = Object.fromEntries(CARDS.map((name) => [name, true])) as CardState;

/** How it works at a 17 px phone's size, unless the test says otherwise. */
function guidePage(props: Partial<GuideProps> = {}) {
  return guideView({ baseTextSize: 17, deviceTextSize: 17, textStep: 0, onTextStep: vi.fn(), onBack: vi.fn(), ...props });
}

function startPage(pdgaNumber: number | null, onSavePdgaNumber = vi.fn(), props: Partial<StartProps> = {}) {
  return startView({
    pdgaNumber,
    player: null,
    flash: null,
    tab: 'number',
    onTab: vi.fn(),
    onSavePdgaNumber,
    onSearch: vi.fn(),
    onOpenSetup: vi.fn(),
    ...props,
  });
}

function submit(form: HTMLFormElement) {
  form.dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('getting-started view', () => {
  it('disables the pdga.com step until there is a PDGA number', () => {
    const view = startPage(null);
    const button = view.querySelector<HTMLButtonElement>('#details-link')!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.disabled).toBe(true);
    expect(view.querySelector('a[href*="pdga.com/player"]')).toBeNull();
  });

  it("links to the player's ratings details", () => {
    const link = startPage(100001).querySelector<HTMLAnchorElement>('#details-link')!;
    expect(link.getAttribute('href')).toBe('https://www.pdga.com/player/100001/details');
    // Same tab, so the bookmarklet brings the user back here; still no Referer to pdga.com.
    expect(link.hasAttribute('target')).toBe(false);
    expect(link.rel).toBe('noreferrer');
  });

  it('ends with the unofficial notice', () => {
    expect(startPage(null).lastElementChild!.textContent).toMatch(/not affiliated with/);
  });

  it('saves a number typed with a leading # and spaces', () => {
    const onSave = vi.fn();
    const view = startPage(null, onSave);
    view.querySelector<HTMLInputElement>('#pdga-number')!.value = ' #100001 ';
    submit(view.querySelector('form')!);
    expect(onSave).toHaveBeenCalledWith(100001);
  });

  it('rejects a number that is not digits', () => {
    const onSave = vi.fn();
    const view = startPage(null, onSave);
    const input = view.querySelector<HTMLInputElement>('#pdga-number')!;
    input.value = '12a';
    submit(view.querySelector('form')!);
    expect(onSave).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(view.querySelector('#pdga-number-status')!.textContent).not.toBe('');
  });

  it('removes the number when the field is emptied', () => {
    const onSave = vi.fn();
    const view = startPage(100001, onSave);
    view.querySelector<HTMLInputElement>('#pdga-number')!.value = '';
    submit(view.querySelector('form')!);
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('finds your number by PDGA number or by name, in two tabs in the first step', () => {
    const onTab = vi.fn();
    const view = startPage(null, vi.fn(), { onTab });
    const step = view.querySelector('.step')!;
    const tabs = [...step.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(tabs.map((tab) => tab.id)).toEqual(['start-by-number', 'start-by-name']);
    expect(tabs.map((tab) => tab.labels![0]!.textContent)).toEqual(['PDGA number', 'Search by name']);
    expect(tabs[0]!.checked).toBe(true);
    // The step title says what the tabs are for, so their legend is for screen readers.
    expect(step.querySelector('legend')!.classList.contains('visually-hidden')).toBe(true);
    expect(step.querySelector('#pdga-number')).not.toBeNull();
    expect(step.querySelector('#start-search')).toBeNull();
    tabs[1]!.dispatchEvent(new Event('change'));
    expect(onTab).toHaveBeenCalledWith('name');
  });

  it('searches pdga.com by name, and says where the number is there', () => {
    const onSearch = vi.fn();
    const view = startPage(null, vi.fn(), { tab: 'name', onSearch });
    expect(view.querySelector<HTMLInputElement>('#start-by-name')!.checked).toBe(true);
    expect(view.querySelector('#pdga-number')).toBeNull();
    const input = view.querySelector<HTMLInputElement>('#start-search')!;
    expect(view.querySelector('label[for="start-search"]')!.textContent).toBe('Your name');
    expect(view.querySelector('#start-search-hint')!.textContent).toContain('in the PDGA # column there');
    submit(input.form!);
    expect(onSearch).not.toHaveBeenCalled();
    expect(view.querySelector('#start-search-status')!.textContent).toBe('Enter a first or last name.');
    input.value = 'Anna Svensson';
    submit(input.form!);
    expect(onSearch).toHaveBeenCalledWith('https://www.pdga.com/players?FirstName=Anna&LastName=Svensson');
  });

  it('shows in the active language', () => {
    setLanguage('sv');
    expect(startPage(null).querySelector('h2')!.textContent).toBe('Kom igång');
    expect(document.documentElement.lang).toBe('sv');
  });
});

describe('settings view', () => {
  const props: SettingsProps = {
    language: null,
    preferred: ['sv-SE'],
    theme: null,
    textSize: null,
    deviceTextSize: 17,
    dateOrder: null,
    today: '2026-10-21',
    openWith: 'me',
    persistent: true,
    bookmarklet: BOOKMARKLET_VERSION,
    onLanguage: () => {},
    onTheme: () => {},
    onTextSize: () => {},
    onDateOrder: () => {},
    onOpenWith: () => {},
    onOpenSetup: () => {},
    onOpenGuide: () => {},
  };

  it('offers Device, Light and Dark themes, with Device by default', () => {
    const view = settingsView(props);
    expect(view.querySelector('.segmented legend')!.textContent).toBe('Theme');
    const radios = [...view.querySelectorAll<HTMLInputElement>('input[name="theme"]')];
    expect(radios.map((radio) => view.querySelector(`label[for="${radio.id}"]`)!.textContent)).toEqual([
      'Device',
      'Light',
      'Dark',
    ]);
    expect(radios.map((radio) => radio.checked)).toEqual([true, false, false]);
    const dark = settingsView({ ...props, theme: 'dark' });
    expect(dark.querySelector<HTMLInputElement>('#theme-dark')!.checked).toBe(true);
  });

  it('changes the theme', () => {
    const onTheme = vi.fn();
    const view = document.body.appendChild(settingsView({ ...props, theme: 'light', onTheme }));
    view.querySelector<HTMLInputElement>('#theme-dark')!.click();
    expect(onTheme).toHaveBeenLastCalledWith('dark');
    view.querySelector<HTMLInputElement>('#theme-device')!.click();
    expect(onTheme).toHaveBeenLastCalledWith(null);
    view.remove();
  });

  it('offers text sizes from 14 to 22 px in whole pixels, following the device by default', () => {
    const view = settingsView({ ...props, deviceTextSize: 15 });
    const slider = view.querySelector<HTMLInputElement>('#text-size')!;
    expect(view.querySelector('label[for="text-size"]')!.textContent).toBe('Body text size');
    expect([slider.type, slider.min, slider.max, slider.step, slider.value]).toEqual(['range', '14', '22', '1', '15']);
    expect(view.querySelector('#text-size-value')!.textContent).toBe('Automatic (15)');
    expect(slider.getAttribute('aria-valuetext')).toBe('Automatic (15)');
    expect(view.querySelector('#text-size-hint')!.textContent).toBe(
      "The whole app changes when you let go. Reset goes back to the device's size.",
    );
    expect(view.querySelector<HTMLElement>('#text-size-sample')!.style.fontSize).toBe('15px');
    expect(view.querySelector<HTMLButtonElement>('#text-size-reset')!.disabled).toBe(true);

    const picked = settingsView({ ...props, textSize: 20 });
    expect(picked.querySelector<HTMLInputElement>('#text-size')!.value).toBe('20');
    expect(picked.querySelector('#text-size-value')!.textContent).toBe('20');
    expect(picked.querySelector<HTMLButtonElement>('#text-size-reset')!.disabled).toBe(false);
  });

  it('shows the size while the slider moves, and changes it when let go', () => {
    const onTextSize = vi.fn();
    const view = settingsView({ ...props, onTextSize });
    const slider = view.querySelector<HTMLInputElement>('#text-size')!;
    slider.value = '21';
    slider.dispatchEvent(new Event('input'));
    expect(onTextSize).not.toHaveBeenCalled();
    expect(view.querySelector('#text-size-value')!.textContent).toBe('21');
    expect(slider.getAttribute('aria-valuetext')).toBe('21');
    expect(view.querySelector<HTMLElement>('#text-size-sample')!.style.fontSize).toBe('21px');
    slider.dispatchEvent(new Event('change'));
    expect(onTextSize).toHaveBeenLastCalledWith(21);
  });

  it('goes back to the device size with Reset, on the slider’s row', () => {
    const onTextSize = vi.fn();
    const reset = settingsView({ ...props, textSize: 19, onTextSize }).querySelector<HTMLButtonElement>('#text-size-reset')!;
    expect(reset.textContent).toBe('Reset');
    expect(reset.parentElement!.className).toBe('range-row');
    expect(reset.previousElementSibling!.id).toBe('text-size');
    reset.click();
    expect(onTextSize).toHaveBeenLastCalledWith(null);
  });

  it('names the text size in Swedish', () => {
    setLanguage('sv');
    const view = settingsView(props);
    expect(view.querySelector('label[for="text-size"]')!.textContent).toBe('Brödtextstorlek');
    expect(view.querySelector('#text-size-value')!.textContent).toBe('Automatiskt (17)');
    expect(view.querySelector('#text-size-reset')!.textContent).toBe('Återställ');
    expect(view.querySelector('#text-size-hint')!.textContent).toBe(
      'Hela appen ändras när du släpper. Återställ går tillbaka till enhetens storlek.',
    );
  });

  it('opens with you by default, or with the last viewed player', () => {
    const onOpenWith = vi.fn();
    const view = document.body.appendChild(settingsView({ ...props, onOpenWith }));
    const radios = [...view.querySelectorAll<HTMLInputElement>('input[name="open-with"]')];
    expect(view.querySelectorAll('.segmented legend')[1]!.textContent).toBe('When the app opens');
    expect(radios.map((radio) => [view.querySelector(`label[for="${radio.id}"]`)!.textContent, radio.checked])).toEqual([
      ['Show you', true],
      ['Show the last viewed player', false],
    ]);
    view.querySelector<HTMLInputElement>('#open-with-last')!.click();
    expect(onOpenWith).toHaveBeenLastCalledWith('last');
    view.remove();
    expect(settingsView({ ...props, openWith: 'last' }).querySelector<HTMLInputElement>('#open-with-last')!.checked).toBe(true);
  });

  it('offers the device setting and every language', () => {
    const options = [...settingsView(props).querySelectorAll('#language option')];
    expect(options.map((option) => option.getAttribute('value'))).toEqual(['', 'en', 'sv']);
    expect(options[0]!.textContent).toContain('Svenska');
    expect(options[2]!.getAttribute('lang')).toBe('sv');
  });

  it('offers Automatic and each date order, with today as the example', () => {
    const options = [...settingsView(props).querySelectorAll<HTMLOptionElement>('#date-format option')];
    expect(options.map((option) => option.value)).toEqual(['', 'year', 'day', 'month']);
    expect(options.map((option) => option.textContent)).toEqual([
      `Automatic (${formatDate('2026-10-21', undefined, null)})`,
      'Year first (2026-10-21)',
      'Day first (21/10/2026)',
      'Month first (10/21/2026)',
    ]);
    expect(options[0]!.selected).toBe(true);
    const picked = settingsView({ ...props, dateOrder: 'day' });
    expect(picked.querySelector<HTMLSelectElement>('#date-format')!.value).toBe('day');
    expect(picked.querySelector('#date-format-hint')!.textContent).toContain('Date pickers');
  });

  it('changes the date format', () => {
    const onDateOrder = vi.fn();
    const select = settingsView({ ...props, onDateOrder }).querySelector<HTMLSelectElement>('#date-format')!;
    select.value = 'month';
    select.dispatchEvent(new Event('change'));
    expect(onDateOrder).toHaveBeenLastCalledWith('month');
    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(onDateOrder).toHaveBeenLastCalledWith(null);
  });

  it('shows the build id', () => {
    expect(settingsView(props).querySelector('#version')!.textContent).toBe('Version dev');
  });

  it('follows the build id with the build date in the app\'s date format', () => {
    expect(versionText('1a2b3c4', null)).toBe('Version 1a2b3c4');
    expect(versionText('1a2b3c4', '2026-10-26')).toBe(`Version 1a2b3c4 · ${formatDate('2026-10-26')}`);
    try {
      setDateOrder('day');
      expect(versionText('1a2b3c4', '2026-10-26')).toBe('Version 1a2b3c4 · 26/10/2026');
      setLanguage('sv');
      expect(versionText('1a2b3c4', '2026-10-26')).toBe('Version 1a2b3c4 · 26/10/2026');
    } finally {
      setDateOrder(null);
      setLanguage('en');
    }
  });

  it('warns when the browser cannot store data', () => {
    expect(settingsView(props).querySelector('.warning')).toBeNull();
    expect(settingsView({ ...props, persistent: false }).querySelector('.warning')).not.toBeNull();
  });

  it('shows the bookmarklet status and opens the setup', () => {
    const onOpenSetup = vi.fn();
    const view = settingsView({ ...props, onOpenSetup });
    expect(view.querySelector('#bookmarklet-status')!.textContent).toBe(`Your bookmarklet: ${BOOKMARKLET_VERSION}, up to date`);
    view.querySelector<HTMLButtonElement>('#open-setup')!.click();
    expect(onOpenSetup).toHaveBeenCalled();
  });

  it('ends with the unofficial notice', () => {
    expect(settingsView(props).lastElementChild!.textContent).toMatch(/not affiliated with/);
  });

  it('links to Ko-fi in the same tab, just before the unofficial notice', () => {
    const view = settingsView(props);
    const link = view.querySelector<HTMLAnchorElement>(`a[href="${KOFI_URL}"]`)!;
    expect(link.textContent).toBe('Buy me a coffee on Ko-fi');
    expect(link.parentElement!.textContent).toBe('Like Next Rating? Buy me a coffee on Ko-fi');
    expect(link.getAttribute('rel')).toBe('noreferrer');
    expect(link.hasAttribute('target')).toBe(false);
    // The class gives the line the same spacing as in the other views.
    expect(link.parentElement!.className).toBe('support');
    expect(view.querySelectorAll('.support')).toHaveLength(1);
    expect(link.parentElement!.nextElementSibling).toBe(view.lastElementChild);
  });
});

describe('getting-started bookmarklet steps', () => {
  it('installs the bookmarklet before opening pdga.com, and offers nothing to paste', () => {
    const onOpenSetup = vi.fn();
    const view = startPage(null, vi.fn(), { onOpenSetup });
    const steps = [...view.querySelectorAll('.step-title')].map((step) => step.textContent);
    expect(steps).toHaveLength(3);
    expect(steps[1]).toMatch(/Install the bookmarklet/);
    expect(steps[2]).toMatch(/run the bookmarklet there/);
    view.querySelector<HTMLButtonElement>('#open-setup')!.click();
    expect(onOpenSetup).toHaveBeenCalled();
    expect(view.querySelector('#open-import')).toBeNull();
  });

  it('leaves the install step out when the bookmarklet in this browser is up to date', () => {
    const view = startPage(188, vi.fn(), { player: { pdgaNumber: 188, label: 'Player' }, bookmarklet: BOOKMARKLET_VERSION });
    const steps = [...view.querySelectorAll('.step-title')].map((step) => step.textContent);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatch(/run the bookmarklet there/);
    expect(view.querySelector('#open-setup')).toBeNull();
  });

  it('asks to update an outdated bookmarklet', () => {
    const onOpenSetup = vi.fn();
    const view = startPage(null, vi.fn(), { bookmarklet: '0.9.0', onOpenSetup });
    const steps = [...view.querySelectorAll('.step-title')].map((step) => step.textContent);
    expect(steps).toHaveLength(3);
    expect(steps[1]).toBe(`Update the bookmarklet: this browser has version 0.9.0, the app has ${BOOKMARKLET_VERSION}.`);
    const open = view.querySelector<HTMLButtonElement>('#open-setup')!;
    expect(open.textContent).toBe('Update bookmarklet');
    open.click();
    expect(onOpenSetup).toHaveBeenCalled();
  });
});

describe('rating view', () => {
  const stored: StoredImport = {
    at: '2026-10-01T10:00:00.000Z',
    player: rawPlayer({ currentRating: '950' }),
    details: [
      rawDetailsRow({ rating: '970', round: '2', roundLabel: '2' }),
      rawDetailsRow({ rating: '960', round: 'Finals', roundLabel: 'Finals' }),
      rawDetailsRow({ eventId: '900000', date: '1-Jul-2024', rating: '900', evaluated: 'No', included: 'No' }),
    ],
    events: [rawEvent()],
  };

  function ratingPage(favorite = true, onAddFavorite = vi.fn()) {
    return ratingView({ model: buildModel(stored, 100001, NOW), cards: ALL_OPEN, favorite, now: NOW, onAddFavorite });
  }

  it('names the player once, in the heading, then the prediction, the change, the next update and the data age', () => {
    const view = ratingPage();
    expect(view.querySelector('h1')!.textContent).toBe('Test Player #100001');
    expect(view.textContent!.split('Test Player #100001')).toHaveLength(2);
    const summary = view.querySelector('.summary')!;
    expect([...summary.children].map((child) => child.id || child.className)).toEqual([
      'visually-hidden',
      'predicted',
      'change change-up',
      'official',
      'next-update',
      'refresh-box',
    ]);
  });

  it('links to Ko-fi in the same tab at the bottom, just before the unofficial notice, as in Settings', () => {
    const view = ratingPage();
    const links = view.querySelectorAll<HTMLAnchorElement>('a[href*="ko-fi"]');
    expect(links).toHaveLength(1);
    const link = links[0]!;
    expect(link.getAttribute('href')).toBe(KOFI_URL);
    expect(link.parentElement!.textContent).toBe('Like Next Rating? Buy me a coffee on Ko-fi');
    expect(link.getAttribute('rel')).toBe('noreferrer');
    expect(link.hasAttribute('target')).toBe(false);
    expect(link.parentElement!.className).toBe('support');
    expect(view.querySelectorAll('.support')).toHaveLength(1);
    expect(link.parentElement!.nextElementSibling).toBe(view.lastElementChild);
    expect(view.lastElementChild!.className).toBe('notice');
    setLanguage('sv');
    expect(ratingPage().querySelector('a[href*="ko-fi"]')!.parentElement!.textContent).toBe(
      'Gillar du Next Rating? Bjud mig på en kaffe på Ko-fi',
    );
  });

  it('shows the data age with a closed "How to refresh" and the Refresh button under it', () => {
    const box = ratingPage().querySelector('#refresh-box')!;
    expect(box.className).toBe('refresh');
    const help = box.querySelector<HTMLDetailsElement>('details#refresh-help')!;
    expect(help.open).toBe(false);
    expect(help.querySelector('summary')!.textContent).toBe('Updated 3 days agoHow to refresh');
    expect(help.querySelector('p')!.textContent).toBe(
      'Opens your ratings details on pdga.com in this tab. Run your bookmarklet there and you come back here with fresh data.',
    );
    // The exact time is inside.
    expect(help.querySelector('.hint')!.textContent).toMatch(/^Last import: /);
    expect(help.nextElementSibling!.id).toBe('refresh');
    expect(box.querySelector('#refresh')!.className).toBe('button button-block');
  });

  it('keeps "How to refresh" open or closed as main.ts says', () => {
    const onToggle = vi.fn();
    const model = buildModel(stored, 100001, NOW);
    const view = ratingView({ model, refresh: { open: true, onToggle }, favorite: true, now: NOW, onAddFavorite: vi.fn() });
    const help = view.querySelector<HTMLDetailsElement>('#refresh-help')!;
    expect(help.open).toBe(true);
    help.open = false;
    help.dispatchEvent(new Event('toggle'));
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('shows the official lookup under the official line, and the imported rating stays the one used', () => {
    const model = buildModel(stored, 100001, NOW);
    const api = {
      kind: 'ok',
      player: {
        pdgaNumber: 100001,
        name: 'Test Player',
        rating: 999,
        ratingDate: '2099-01-14',
        membership: 'current',
        membershipExpires: '2099-12-31',
        classification: null,
        fetchedAt: '2026-10-04T09:00:00.000Z',
      },
    } as const;
    const view = ratingView({ model, api, favorite: true, now: NOW, onAddFavorite: vi.fn() });
    const newer = view.querySelector('#api-newer')!;
    expect(newer.previousElementSibling!.id).toBe('official');
    expect(newer.textContent).toContain(': 999. The prediction still uses the rounds from before it.');
    expect(view.querySelector('#api-membership')!.textContent).toContain('PDGA membership current until');
    expect(view.querySelector('#official')!.textContent).toContain('950');
    expect(view.querySelector('#predicted')!.textContent).toBe(ratingPage().querySelector('#predicted')!.textContent);
    expect(ratingPage().querySelector('#api-membership')).toBeNull();
  });

  it('gives the predicted number a label for screen readers', () => {
    const label = ratingPage().querySelector('#predicted')!.previousElementSibling!;
    expect(label.className).toBe('visually-hidden');
    expect(label.textContent).toBe('Predicted rating');
  });

  it('turns "How to refresh" into an open warning once the data is more than 7 days old', () => {
    expect(ratingPage().querySelector('#stale')).toBeNull();
    const later = new Date('2026-10-08T10:01:00.000Z');
    const view = ratingView({ model: buildModel(stored, 100001, later), favorite: true, now: later, onAddFavorite: vi.fn() });
    const box = view.querySelector('#refresh-box')!;
    expect(box.className).toBe('refresh refresh-warning');
    const help = box.querySelector<HTMLDetailsElement>('#refresh-help')!;
    expect(help.open).toBe(true);
    const notice = help.querySelector('#stale')!;
    expect(notice.previousElementSibling!.tagName).toBe('SUMMARY');
    expect(notice.textContent).toMatch(/^This data is more than 7 days old\./);
    const refresh = box.querySelector<HTMLAnchorElement>('#refresh')!;
    expect(refresh.className).toBe('button button-primary button-block');
    expect(refresh.getAttribute('href')).toBe('https://www.pdga.com/player/100001/details');
    expect(view.querySelectorAll('#refresh')).toHaveLength(1);
  });

  it('shows the next update and its report deadline briefly, without a link (How it works has it)', () => {
    // On 4 Oct 2026 the next update is Tuesday 13 Oct, for events reported by Sunday 11 Oct.
    const line = ratingPage().querySelector('#next-update')!;
    expect(line.textContent).toMatch(/^Next update \D*13\D*, deadline \D*11\D*$/);
    expect(line.querySelector('a')).toBeNull();
    setLanguage('sv');
    expect(ratingPage().querySelector('#next-update')!.textContent).toMatch(/^Uppdateras \D*13\D*, sista rapportdag \D*11\D*$/);
  });

  it("refreshes from the player's ratings details on pdga.com, in the same tab", () => {
    const refresh = ratingPage().querySelector<HTMLAnchorElement>('#refresh')!;
    expect(refresh.textContent).toBe('Refresh on pdga.com');
    expect(refresh.getAttribute('href')).toBe('https://www.pdga.com/player/100001/details');
    expect(refresh.hasAttribute('target')).toBe(false);
  });

  it('shows the prediction, the change and the official rating', () => {
    const view = ratingPage();
    expect(view.querySelector('#predicted')!.textContent).toBe('962');
    expect(view.querySelector('.change')!.textContent).toBe('+12 vs official rating');
    expect(view.querySelector('.official')!.textContent).toContain('950');
    expect(view.textContent).toContain('Last import:');
  });

  it('shows the calculated official rating only when the engine reproduces it', () => {
    // The official rounds give 965.
    const model = buildModel({ ...stored, player: rawPlayer({ currentRating: '965' }) }, 100001, NOW);
    const official = ratingView({ model, favorite: true, now: NOW, onAddFavorite: vi.fn() }).querySelector('#official')!;
    expect(official.textContent).toMatch(/^Official rating 965 \(calculated 96[45]\.\d\d\), as of \S+$/);
    // 950 is not what the official rounds give, so the decimals would not explain it.
    expect(ratingPage().querySelector('#official')!.textContent).not.toContain('calculated');
  });

  it.each([
    ['950', 'up', 90, '+12'],
    ['957', 'up', 45, '+5'],
    ['970', 'down', -72, '−8'],
    ['962', 'none', 0, '0'],
  ])('marks a change from an official %s with a sloped arrow and a sign', (official, direction, angle, sign) => {
    const model = buildModel({ ...stored, player: rawPlayer({ currentRating: official }) }, 100001, NOW);
    const line = ratingView({ model, favorite: true, now: NOW, onAddFavorite: vi.fn() }).querySelector('.change')!;
    expect(line.classList.contains(`change-${direction}`)).toBe(true);
    const icon = line.querySelector('svg.slope-arrow')!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(drawnAngle(icon)).toBe(angle);
    expect(line.textContent).toBe(`${sign} vs official rating`);
  });

  it('lists rounds newest first with a text label and a symbol for each status', () => {
    const rounds = [...ratingPage().querySelectorAll('.round')];
    expect(rounds.map((round) => round.querySelector('.round-rating')!.textContent)).toEqual([
      '960',
      '955',
      '970',
      '960',
      '900',
    ]);
    const status = rounds[4]!.querySelector('.round-status')!;
    expect(status.textContent).toContain('Outside window');
    expect(status.querySelector('[aria-hidden="true"]')!.textContent).toBe('○');
    expect(rounds[1]!.textContent).toContain('9 holes');
    expect(rounds[1]!.textContent).toContain('Unofficial');
    expect(rounds[0]!.textContent).not.toContain('holes');
    expect(rounds[3]!.querySelector('.round-event')!.textContent).toBe('Example Open, Finals');
  });

  it('marks rounds after the report deadline as counting in the following update', () => {
    // The deadline for the update on 13 Oct is 11 Oct.
    const later = rawEvent({ eventId: '900004', date: '12-Oct-2026' });
    const model = buildModel({ ...stored, events: [rawEvent(), later] }, 100001, NOW);
    const view = ratingView({ model, favorite: true, now: NOW, onAddFavorite: vi.fn() });
    const deferred = [...view.querySelectorAll('.round-after-deadline')];
    expect(deferred).toHaveLength(2);
    const status = deferred[0]!.querySelector('.round-status')!;
    expect(status.textContent).toContain('Counts in the following update');
    expect(status.querySelector('[aria-hidden="true"]')!.textContent).toBe('»');
    expect(view.querySelector('#predicted')!.textContent).toBe(ratingPage().querySelector('#predicted')!.textContent);
  });

  describe('the following update', () => {
    // On 4 Oct 2026 the next update is 13 Oct (deadline 11 Oct), the following one 10 Nov (deadline 8 Nov).
    const manual = (date: string, rating = 1000, id = date) => ({ id, rating, date, eventName: '', holes: null, example: false, leftOut: false });
    const view = (rounds: ReturnType<typeof manual>[], data = stored) => {
      const model = buildModel(data, 100001, NOW, manualToRounds(rounds));
      return { model, view: ratingView({ model, favorite: true, now: NOW, onAddFavorite: vi.fn() }) };
    };

    it('shows nothing when no round waits for it', () => {
      expect(ratingPage().querySelector('#following-update')).toBeNull();
      expect(view([manual('2026-10-10')]).view.querySelector('#following-update')).toBeNull();
    });

    it('shows its prediction under the next update, with the change from the next prediction', () => {
      const { model, view: page } = view([manual('2026-10-20')]);
      const line = page.querySelector('#following-update')!;
      expect(line.previousElementSibling!.id).toBe('next-update');
      const { rating, change } = model.following!;
      // The arrow is a drawing, so the text holds the sign alone.
      expect(line.textContent).toMatch(new RegExp(`^Then \\D*10\\D*: ${rating} \\+${change}$`));
      expect(line.querySelector('.following-rating')!.textContent).toBe(String(rating));
      const shown = line.querySelector('.following-change')!;
      expect(shown.className).toBe(`following-change change-up change-strength-${strength(change!)}`);
      const arrow = shown.querySelector('svg.slope-arrow')!;
      expect(arrow.getAttribute('aria-hidden')).toBe('true');
      expect(drawnAngle(arrow)).toBe(arrowAngle(change!));
      expect(drawnAngle(arrow)).toBeGreaterThan(0);
      // The next update's prediction stays as it was.
      expect(page.querySelector('#predicted')!.textContent).toBe('962');
    });

    it('marks a fall', () => {
      const line = view([manual('2026-10-20', 800), manual('2026-10-21', 800)]).view.querySelector('#following-update')!;
      expect(line.textContent).toMatch(/^Then \D*10\D*: \d+ −\d+$/);
      expect(line.querySelector('.following-change')!.classList.contains('change-down')).toBe(true);
      expect(drawnAngle(line.querySelector('svg.slope-arrow')!)).toBeLessThan(0);
    });

    it('turns the arrow linearly by the size of the change: flat at 0, 45 degrees at 5, straight from 10', () => {
      const sizes = [0, 1, 4, 5, 7, 10, 15];
      expect(sizes.map(arrowAngle)).toEqual([0, 9, 36, 45, 63, 90, 90]);
      expect(sizes.map((size) => arrowAngle(-size))).toEqual([0, -9, -36, -45, -63, -90, -90]);
      expect(sizes.map((size) => drawnAngle(slopeArrow(size)))).toEqual([0, 9, 36, 45, 63, 90, 90]);
      expect(sizes.map((size) => drawnAngle(slopeArrow(-size)))).toEqual([0, -9, -36, -45, -63, -90, -90]);
      // Flat needs no turn at all.
      expect(slopeArrow(0).querySelector('path')!.hasAttribute('transform')).toBe(false);
    });

    it('rounds the size as the text shows it', () => {
      expect([0.4, -0.4, 4.5, -4.5, 4.4, 9.6].map(arrowAngle)).toEqual([0, 0, 45, -45, 36, 90]);
      expect([0.4, 2.5, 9.5].map(strength)).toEqual([0, 2, 3]);
    });

    it('turns the main arrow and the following update arrow alike for the same change', () => {
      // The following update's change is from the next prediction, so a round in it moves only that line.
      const { model, view: page } = view([manual('2026-10-20')]);
      const change = model.following!.change!;
      const official = String(962 - change);
      const main = buildModel({ ...stored, player: rawPlayer({ currentRating: official }) }, 100001, NOW, manualToRounds([manual('2026-10-20')]));
      expect(main.prediction.change).toBe(change);
      const mainArrow = ratingView({ model: main, favorite: true, now: NOW, onAddFavorite: vi.fn() }).querySelector('.change svg.slope-arrow')!;
      const followingArrow = page.querySelector('.following-change svg.slope-arrow')!;
      expect(drawnAngle(mainArrow)).toBe(drawnAngle(followingArrow));
      expect(mainArrow.outerHTML).toBe(followingArrow.outerHTML);
      for (const value of [-15, -10, -7, -5, -4, -1, 0, 1, 4, 5, 7, 10, 15]) {
        const line = ratingView({
          model: { ...main, prediction: { ...main.prediction, change: value }, following: { rating: 962 + value, change: value } },
          favorite: true,
          now: NOW,
          onAddFavorite: vi.fn(),
        });
        expect(drawnAngle(line.querySelector('.change svg.slope-arrow')!)).toBe(arrowAngle(value));
        expect(drawnAngle(line.querySelector('.following-change svg.slope-arrow')!)).toBe(arrowAngle(value));
      }
    });

    it('shows a larger change in a stronger tone', () => {
      // One round near the prediction moves it a little, three high ones move it more.
      const small = view([manual('2026-10-20', 975)]).view.querySelector('.following-change')!;
      const large = view([manual('2026-10-20', 1100), manual('2026-10-21', 1100), manual('2026-10-22', 1100)]).view.querySelector('.following-change')!;
      const strength = (shown: Element) => Number(/change-strength-(\d)/.exec(shown.className)![1]);
      expect(strength(small)).toBeGreaterThan(0);
      expect(strength(small)).toBeLessThan(strength(large));
      expect(strength(large)).toBe(3);
    });

    it('shows the rating alone without a next prediction', () => {
      const line = view([manual('2026-10-20')], { at: stored.at, events: [] }).view.querySelector('#following-update')!;
      expect(line.textContent).toMatch(/^Then \D*10\D*: 1000$/);
      expect(line.querySelector('.following-change')).toBeNull();
    });

    it('marks a round after its deadline as counting in a later update', () => {
      const { view: page } = view([manual('2026-11-20')]);
      expect(page.querySelector('#following-update')).toBeNull();
      const status = page.querySelector('.round-after-deadline .round-status')!;
      expect(status.textContent).toBe('» Counts in a later update');
      // The rating is an element of its own beside the status, which styles.css keeps on one line while the status wraps.
      const rating = status.previousElementSibling!;
      expect([rating.className, rating.textContent]).toEqual(['round-rating', '1000']);
    });

    it('on 22 Oct, shows no line for a round after 6 Dec alone, and keeps the line of a round before it', () => {
      const oct22 = new Date('2026-10-22T10:00:00');
      const page = (rounds: ReturnType<typeof manual>[]) =>
        ratingView({ model: buildModel(stored, 100001, oct22, manualToRounds(rounds)), favorite: true, now: oct22, onAddFavorite: vi.fn() });
      const december = page([manual('2026-12-15')]);
      expect(december.querySelector('#following-update')).toBeNull();
      expect(december.querySelector('.round-after-deadline .round-status')!.textContent).toBe('» Counts in a later update');
      const november = page([manual('2026-11-15')]).querySelector('#following-update')!.textContent;
      const both = page([manual('2026-11-15'), manual('2026-12-15', 700)]);
      expect(both.querySelector('#following-update')!.textContent).toBe(november);
      expect(both.querySelector('#predicted')!.textContent).toBe(december.querySelector('#predicted')!.textContent);
    });

    it('is translated', () => {
      setLanguage('sv');
      const line = view([manual('2026-10-20')]).view.querySelector('#following-update')!;
      expect(line.textContent).toMatch(/^Därefter \D*10\D*: \d+ \+\d+$/);
    });
  });

  it('marks an official round PDGA did not evaluate inside its window as not counted by PDGA', () => {
    const xTier = rawDetailsRow({ eventId: '900005', tier: 'XA', date: '1-Jul-2026', rating: '1050', evaluated: 'No', included: 'No' });
    const model = buildModel({ ...stored, details: [...stored.details!, xTier] }, 100001, NOW);
    const view = ratingView({ model, favorite: true, now: NOW, onAddFavorite: vi.fn() });
    const status = view.querySelector('.round-excluded .round-status')!;
    expect(status.textContent).toContain('Not counted by PDGA');
    expect(status.querySelector('[aria-hidden="true"]')!.textContent).toBe('⊘');
    expect(view.querySelector('#predicted')!.textContent).toBe(ratingPage().querySelector('#predicted')!.textContent);
  });

  describe('unofficial events', () => {
    const xTier = { ...stored, profileEvents: [rawProfileEvent({ tier: 'XA' })] };

    function toggle(box: HTMLInputElement) {
      box.checked = !box.checked;
      box.dispatchEvent(new Event('change'));
    }

    function page(data: StoredImport, leftOut: string[] = [], onLeaveOut = vi.fn()) {
      const model = buildModel(data, 100001, NOW, [], leftOut);
      return ratingView({ model, cards: ALL_OPEN, onLeaveOut, favorite: true, now: NOW, onAddFavorite: vi.fn() });
    }

    it('come first in the Rounds card, each with a checked Count box, X-tier marked', () => {
      const onLeaveOut = vi.fn();
      const choices = page(xTier, [], onLeaveOut).querySelector('#rounds #event-choices')!;
      expect(choices.nextElementSibling!.className).toBe('rounds');
      expect(choices.querySelector('legend')!.textContent).toBe('Unofficial events that count');
      const box = choices.querySelector<HTMLInputElement>('#count-event-0')!;
      expect(box.type).toBe('checkbox');
      expect(box.checked).toBe(true);
      expect(choices.querySelector('label[for="count-event-0"]')!.textContent).toBe('Example Cup');
      expect(box.getAttribute('aria-describedby')).toBe('count-event-0-meta');
      expect(choices.querySelector('#count-event-0-meta')!.textContent).toMatch(/^\S+ · X-tier: may not count$/);
      toggle(box);
      expect(onLeaveOut).toHaveBeenCalledWith('e:900002', true);
    });

    it('mark X-tier rounds in the round list, and only them', () => {
      const marked = (view: HTMLElement) => [...view.querySelectorAll('.round-meta')].filter((meta) => meta.textContent!.includes('X-tier'));
      expect(marked(page(xTier))).toHaveLength(2);
      expect(marked(page(stored))).toHaveLength(0);
      expect(page(stored).querySelector('#count-event-0-meta')!.textContent).toMatch(/^\S+$/);
    });

    it('mark a league on its event and its rounds, with a general hint above', () => {
      const LEAGUE = 'League: counts only when the whole league is finished and reported';
      const view = page({ ...stored, profileEvents: [rawProfileEvent({ tier: 'L' })] });
      expect(view.querySelector('#event-choices .hint')!.textContent).toBe(
        "Uncheck an event the next update won't count, for example one whose report arrives after the deadline.",
      );
      expect(view.querySelector('#count-event-0-meta')!.textContent).toMatch(new RegExp(`^\\S+ · ${LEAGUE}$`));
      const marked = [...view.querySelectorAll('.round-meta')].filter((meta) => meta.textContent!.includes(LEAGUE));
      expect(marked).toHaveLength(2);
    });

    it('offer no choice without a handler', () => {
      const model = buildModel(stored, 100001, NOW);
      expect(ratingView({ model, cards: ALL_OPEN, favorite: true, now: NOW, onAddFavorite: vi.fn() }).querySelector('#event-choices')).toBeNull();
    });

    it('show a left-out event unchecked, its rounds as left out, and what counting it would give', () => {
      const onLeaveOut = vi.fn();
      const view = page(xTier, ['e:900002'], onLeaveOut);
      const box = view.querySelector<HTMLInputElement>('#count-event-0')!;
      expect(box.checked).toBe(false);
      toggle(box);
      expect(onLeaveOut).toHaveBeenCalledWith('e:900002', false);
      const left = [...view.querySelectorAll('.round-left-out .round-status')];
      expect(left).toHaveLength(2);
      expect(left[0]!.textContent).toContain('Left out by you');
      // With the only event left out there are no new rated rounds, so the rating stays.
      expect(view.querySelector('#why-unchanged')!.textContent).toBe('No new rated rounds since the last update, so the rating stays at 950');
      expect(view.querySelector('#why-left-out')!.textContent).toMatch(/^Counting Example Cup would give \d+ \(−\d+\.\d\)$/);
    });
  });

  describe('the round list', () => {
    // After the deadline two rounds of an unofficial event, then ten in September, the oldest dropped, then older rounds outside the window.
    const september = Array.from({ length: 10 }, (_, i) =>
      rawDetailsRow({ eventId: String(900100 + i), eventName: `Event ${i}`, date: `${i + 1}-Sep-2026`, rating: String(i === 0 ? 700 : 950 + i) }),
    );
    const older = (count: number) =>
      Array.from({ length: count }, (_, i) => rawDetailsRow({ eventId: String(900200 + i), eventName: `Old ${i}`, date: `${3 - i}-Jan-2024`, rating: '900' }));
    const data = (oldRounds: number): StoredImport => ({
      at: '2026-10-01T10:00:00.000Z',
      player: rawPlayer({ currentRating: '955' }),
      details: [...september, ...older(oldRounds)],
      events: [rawEvent({ eventId: '900300', date: '12-Oct-2026' })],
    });

    function page(from: StoredImport, expanded = false, onExpand = vi.fn()) {
      const model = buildModel(from, 100001, NOW);
      return ratingView({ model, cards: ALL_OPEN, rounds: { expanded, onExpand }, favorite: true, now: NOW, onAddFavorite: vi.fn() });
    }
    const statuses = (view: HTMLElement) => [...view.querySelectorAll('#rounds-body .round')].map((round) => round.classList[1]);

    it('shows the rounds down to the oldest that counts or is dropped, and one more', () => {
      const onExpand = vi.fn();
      const view = page(data(3), false, onExpand);
      expect(statuses(view)).toEqual([
        'round-after-deadline',
        'round-after-deadline',
        ...Array(9).fill('round-included').map((status, i) => (i < 3 ? 'round-doubled' : status)),
        'round-dropped',
        'round-outside-window',
      ]);
      const more = view.querySelector<HTMLButtonElement>('#rounds-body .rounds + #rounds-more')!;
      expect(more.className).toBe('button button-small rounds-more');
      expect(more.textContent).toBe('Show 2 more rounds');
      more.click();
      expect(onExpand).toHaveBeenCalledOnce();
      expect(page(data(2)).querySelector('#rounds-more')!.textContent).toBe('Show 1 more round');
      setLanguage('sv');
      expect(page(data(3)).querySelector('#rounds-more')!.textContent).toBe('Visa 2 rundor till');
      expect(page(data(2)).querySelector('#rounds-more')!.textContent).toBe('Visa 1 runda till');
    });

    it('shows every round once expanded, with focus to go to the first one added', () => {
      const view = page(data(3), true);
      expect(statuses(view)).toHaveLength(15);
      expect(view.querySelector('#rounds-more')).toBeNull();
      const next = view.querySelector<HTMLElement>('#rounds-next')!;
      expect(next.tabIndex).toBe(-1);
      expect([...view.querySelectorAll('#rounds-body .round')].indexOf(next)).toBe(13);
    });

    it('has no button when nothing is hidden', () => {
      expect(statuses(page(data(1)))).toHaveLength(13);
      expect(page(data(1)).querySelector('#rounds-more, #rounds-next')).toBeNull();
      expect(page(data(0)).querySelector('#rounds-more')).toBeNull();
    });

    it('shows only the newest round when none counts or is dropped', () => {
      const rows = (...kinds: RoundStatus[]) => kinds.map((status) => ({ result: { status } }) as ListedResult);
      expect(shownRounds(rows('after-deadline', 'outside-window', 'outside-window'))).toBe(1);
      expect(shownRounds(rows())).toBe(0);
      expect(shownRounds(rows('dnf', 'included', 'excluded', 'dropped', 'outside-window', 'dnf'))).toBe(5);
      expect(shownRounds(rows('included'))).toBe(1);
    });
  });

  it("links each round's event name to its pdga.com page, in the same tab", () => {
    const rounds = [...ratingPage().querySelectorAll('.round')];
    const official = rounds[3]!.querySelector<HTMLAnchorElement>('.round-event a')!;
    expect(official.textContent).toBe('Example Open');
    expect(official.getAttribute('href')).toBe('https://www.pdga.com/tour/event/900001');
    expect(official.hasAttribute('target')).toBe(false);
    expect(official.rel).toBe('noreferrer');
    const unofficial = rounds[1]!.querySelector<HTMLAnchorElement>('.round-event a')!;
    expect(unofficial.getAttribute('href')).toBe('https://www.pdga.com/tour/event/900002');
  });

  it('shows the event name without a link when its id is unknown', () => {
    const model = buildModel({ ...stored, details: [rawDetailsRow({ eventId: '' })], events: [] }, 100001, NOW);
    const event = ratingView({ model, favorite: true, now: NOW, onAddFavorite: vi.fn() }).querySelector('.round-event')!;
    expect(event.querySelector('a')).toBeNull();
    expect(event.textContent).toBe('Example Open, Round 1');
  });

  it('has a Details card', () => {
    const stats = ratingPage().querySelector('#stats')!;
    expect(stats.querySelector('#stats-toggle')!.textContent).toBe('Details');
    const rows = [...stats.querySelectorAll('dl > div.stat')];
    expect(rows.length).toBeGreaterThan(0);
    expect(stats.querySelectorAll('dt').length).toBe(rows.length);
    for (const row of rows) expect([...row.children].map((child) => child.tagName).slice(0, 2)).toEqual(['DT', 'DD']);
  });

  it('shows the career and the window events with wins and their share', () => {
    const model = buildModel(
      {
        ...stored,
        career: { events: '40', wins: '3' },
        wins: [{ eventId: '900001', name: 'Example Open', division: 'Mixed Pro Open', tier: 'C', date: '02-Aug-2026' }],
      },
      100001,
      NOW,
    );
    const view = ratingView({ model, cards: ALL_OPEN, favorite: true, now: NOW, onAddFavorite: vi.fn() });
    const value = (label: string) =>
      [...view.querySelectorAll('#stats div.stat')].find((stat) => stat.querySelector('dt')!.textContent === label)?.querySelector('dd')!
        .textContent;
    expect(value('Career on pdga.com')).toBe('40 events, 3 wins (8%)');
    expect(value('In window')).toMatch(/^\d+ events, 1 win \(\d+%\)$/);
  });

  it('shows the window events alone while the wins are not known', () => {
    const labels = [...ratingPage().querySelectorAll('#stats dt')].map((dt) => dt.textContent);
    expect(labels).not.toContain('Career on pdga.com');
    const row = [...ratingPage().querySelectorAll('#stats div.stat')].find((stat) => stat.querySelector('dt')!.textContent === 'In window')!;
    expect(row.querySelector('dd')!.textContent).toMatch(/^\d+ events?$/);
  });

  it('tells the weighted prediction apart from the plain averages', () => {
    const labels = [...ratingPage().querySelectorAll('#stats dt')].map((dt) => dt.textContent);
    expect(labels).toContain('Unrounded prediction (weighted average)');
    expect(labels).toContain('Average in window (unweighted)');
    expect(labels).toContain('Average of counted rounds (unweighted)');
  });

  it('shows the window length next to its label and the dates below', () => {
    const row = [...ratingPage().querySelectorAll('#stats div.stat')].find((stat) =>
      stat.querySelector('dt')!.textContent!.startsWith('Window'),
    )!;
    const [label, months, range] = [...row.children];
    expect(label!.textContent).toBe('Window');
    // Fewer than 8 rounds, so the 24-month fallback applies.
    expect(months!.textContent).toBe('24 months');
    expect(range!.className).toBe('stat-detail');
    expect(range!.textContent).toMatch(/^\S+ to \S+$/);
  });

  describe('why it changed', () => {
    // PDGA's rounds give 965, so with this official rating there is no difference line.
    const reproduced = rawPlayer({ currentRating: '965' });

    function why(extra: Partial<StoredImport> = {}, cards = ALL_OPEN): HTMLElement | null {
      const model = buildModel({ ...stored, player: reproduced, ...extra }, 100001, NOW);
      return ratingView({ model, cards, favorite: true, now: NOW, onAddFavorite: vi.fn() }).querySelector('#why');
    }

    it('follows the summary with the new rounds, largest effect first', () => {
      const section = why()!;
      expect(section.previousElementSibling!.classList.contains('summary')).toBe(true);
      expect(section.querySelector('h2')!.textContent).toBe('Why it changed');
      const items = [...section.querySelectorAll('.reason')];
      expect(items.map((item) => item.querySelector('.reason-text')!.textContent)).toEqual([
        'New round 960',
        'New round 955',
      ]);
      expect(items[1]!.querySelector('.reason-meta')!.textContent).toMatch(/^Example Cup · Round 2 · \S+$/);
    });

    it('starts the list with the net total and what it rounds to', () => {
      const net = why()!.querySelector('#why-net')!;
      expect(net.previousElementSibling!.className).toBe('card-intro');
      expect(net.nextElementSibling!.className).toBe('reasons');
      expect(net.textContent).toMatch(/^Net −\d\.\d, rounds to −3$/);
    });

    it('says when the net total rounds to no change', () => {
      // Official 962 and predicted 962: the lines add up to no change.
      const net = why({ player: rawPlayer({ currentRating: '962' }) })!.querySelector('#why-net')!;
      expect(net.textContent).toBe('Net 0.0, rounds to no change');
    });

    it('marks each effect with an arrow and a sign, not colour alone', () => {
      const effect = why()!.querySelector('.reason-effect')!;
      // The official rounds give 965; both new rounds lower it by 5 / 3.5.
      expect(effect.textContent).toBe('↓−1.4');
      expect(effect.classList.contains('change-down')).toBe(true);
      expect(effect.querySelector('.reason-arrow')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('puts lines after the fifth under "Show all"', () => {
      const ratings = ['960', '955', '950', '945', '940', '935'];
      const event = rawEvent({}, [rawEventRow('100001', ratings)]);
      event.divisions[0]!.holes = ratings.map(() => '18');
      const section = why({ events: [event] })!;
      expect(section.querySelectorAll('.card-body > ul > .reason')).toHaveLength(5);
      const more = section.querySelector('details.reasons-more')!;
      expect(more.querySelector('summary')!.textContent).toBe('Show all 6');
      expect(more.querySelectorAll('.reason')).toHaveLength(1);
    });

    it("adds the difference from PDGA's last calculation as the last visible line", () => {
      // The official rating is 950, not the 965 that PDGA's rounds give.
      const section = why({ player: rawPlayer({ currentRating: '950' }) })!;
      const lines = [...section.querySelectorAll('.card-body > ul > .reason')];
      expect(lines.map((line) => line.id)).toEqual(['', '', 'why-difference']);
      expect(lines.at(-1)!.querySelector('.reason-text')!.textContent).toBe("Difference from PDGA's last calculation");
      expect(lines.at(-1)!.querySelector('.reason-effect')!.textContent).toMatch(/^[↑↓→][−+]?\d+\.\d$/);
      expect(why()!.querySelector('#why-difference')).toBeNull();
    });

    it('says the rating stays without new rated rounds, instead of a difference line', () => {
      const section = why({ events: [], player: rawPlayer({ currentRating: '950' }) })!;
      const text = 'No new rated rounds since the last update, so the rating stays at 950';
      expect(section.querySelector('#why-unchanged')!.textContent).toBe(text);
      expect(section.querySelector('.reason')).toBeNull();
      expect(section.querySelector('#why-net')).toBeNull();
      const closed = why({ events: [], player: rawPlayer({ currentRating: '950' }) }, DEFAULT_CARDS)!;
      expect(closed.querySelector('.card-teaser')!.textContent).toBe(text);
    });

    it('suggests a new import only when the details are older than the official rating', () => {
      const differs = rawPlayer({ currentRating: '950' });
      expect(why({ player: differs })!.querySelector('.hint')).toBeNull();
      const hint = why({ player: differs, detailsAt: '2026-09-01T10:00:00.000Z' })!.querySelector('.hint')!;
      expect(hint.textContent).toMatch(/^The ratings details were imported before the rating update of \S+\. Import them again/);
      // Without a difference there is nothing to fix.
      expect(why({ detailsAt: '2026-09-01T10:00:00.000Z' })!.querySelector('.hint')).toBeNull();
    });

    it('is hidden when the official rating is unknown', () => {
      expect(why({ player: undefined })).toBeNull();
      expect(why({ player: undefined, events: [] })).toBeNull();
    });

    it('shows the largest effect in its header while closed', () => {
      const closed = why({}, DEFAULT_CARDS)!;
      expect(closed.querySelector('.reason')).toBeNull();
      expect(closed.querySelector('.card-teaser')!.textContent).toBe('New round 960, −1.4');
      expect(why()!.querySelector('.card-teaser')).toBeNull();
    });

    it("shows the difference from PDGA's last calculation in the header when it is the largest", () => {
      const teaser = why({ player: rawPlayer({ currentRating: '950' }) }, DEFAULT_CARDS)!.querySelector('.card-teaser')!;
      expect(teaser.textContent).toMatch(/^Difference from PDGA's last calculation, \+\d+\.\d$/);
    });

    it('shows the net total in its header when the change rounds to no change', () => {
      const closed = why({ player: rawPlayer({ currentRating: '962' }) }, DEFAULT_CARDS)!;
      expect(closed.querySelector('.card-teaser')!.textContent).toBe('Net 0.0, rounds to no change');
    });
  });

  it('offers to save the unsaved player as a favorite', () => {
    const onAddFavorite = vi.fn();
    expect(ratingPage(true).querySelector('#add-favorite')).toBeNull();
    const button = ratingPage(false, onAddFavorite).querySelector<HTMLButtonElement>('#add-favorite')!;
    expect(button.textContent).toBe('Add #100001 to favorites');
    button.click();
    expect(onAddFavorite).toHaveBeenCalledWith(100001);
  });

  it('names the player by number before a player header is imported', () => {
    const model = buildModel({ ...stored, player: undefined }, 100001, NOW);
    expect(ratingView({ model, favorite: true, now: NOW, onAddFavorite: vi.fn() }).querySelector('h1')!.textContent).toBe('#100001');
  });

  it('ends with the unofficial notice', () => {
    expect(ratingPage().lastElementChild!.textContent).toMatch(/not affiliated with/);
  });

  it('ends with the PDGA attribution, linked to pdga.com', () => {
    const notice = ratingPage().lastElementChild!;
    expect(notice.textContent).toMatch(/^Player, event, and course data provided by PDGA\. Unofficial tool/);
    expect(notice.querySelector('a')!.getAttribute('href')).toBe('https://www.pdga.com/');
  });

  it("links the player's name in the heading to the player's pdga.com profile", () => {
    const heading = ratingPage().querySelector('h1')!;
    expect(heading.textContent).toBe('Test Player #100001');
    const link = heading.querySelector('a')!;
    expect(link.textContent).toBe('Test Player');
    expect(link.getAttribute('href')).toBe('https://www.pdga.com/player/100001');
  });
});

describe('rating tab cards', () => {
  /** The official rating 950 against a new unofficial round, so there is a change to explain. */
  const stored: StoredImport = {
    at: '2026-10-01T10:00:00.000Z',
    player: rawPlayer({ currentRating: '950' }),
    details: [rawDetailsRow()],
    events: [rawEvent()],
  };

  function page(cards?: CardState, onToggleCard = vi.fn()) {
    const model = buildModel(stored, 100001, NOW);
    const target = {
      draft: { target: '1000', count: '3', date: '2026-10-04' },
      dates: { min: '2026-10-04', max: '2027-10-04' },
      answer: null,
      examples: 0,
      examplesFlash: null,
      onDraft: vi.fn(),
      onCalculate: vi.fn(),
      onExamples: vi.fn(),
      onRemoveExamples: vi.fn(),
    };
    const manual = {
      rounds: [],
      draft: { rating: '', date: '2026-10-04', eventName: '', holes: '' },
      flash: null,
      confirmClear: false,
      undo: null,
      player: 'Test Player #100001',
      today: '2026-10-04',
      editing: null,
      onDraft: vi.fn(),
      onAdd: vi.fn(),
      onEdit: vi.fn(),
      onSave: vi.fn(),
      onCancelEdit: vi.fn(),
      onDelete: vi.fn(),
      onUndo: vi.fn(),
      onAskClear: vi.fn(),
      onClear: vi.fn(),
      onRemoveExamples: vi.fn(),
    };
    const top8 = { top: topEight(model, THIS_YEAR, '2026-10-04'), today: '2026-10-04', onPeriod: vi.fn(), onOwn: vi.fn() };
    const chart = { chart: chartData(model, { kind: 'recent' }, '2026-10-04'), pdgaNumber: 100001, today: '2026-10-04', onPeriod: vi.fn(), axis: 'time' as const, onAxis: vi.fn() };
    return ratingView({ model, manual, target, top8, chart, cards, onToggleCard, favorite: true, now: NOW, onAddFavorite: vi.fn() });
  }

  it('follow the summary in a fixed order, then the Ko-fi link and the unofficial notice', () => {
    const view = page();
    expect([...view.querySelectorAll('.card')].map((card) => card.id)).toEqual(['why', 'chart', 'manual', 'target', 'top8', 'stats', 'rounds']);
    expect(view.querySelector('.summary')!.nextElementSibling!.id).toBe('why');
    const support = view.querySelector('#rounds')!.nextElementSibling!;
    expect(support.querySelector(`a[href="${KOFI_URL}"]`)).not.toBeNull();
    expect(support.nextElementSibling!.className).toBe('notice');
  });

  it('start with only Rounds open', () => {
    const view = page();
    const open = [...view.querySelectorAll('.card-toggle')].map((toggle) => [toggle.id, toggle.getAttribute('aria-expanded')]);
    expect(open).toEqual([
      ['why-toggle', 'false'],
      ['chart-toggle', 'false'],
      ['manual-toggle', 'false'],
      ['target-toggle', 'false'],
      ['top8-toggle', 'false'],
      ['stats-toggle', 'false'],
      ['rounds-toggle', 'true'],
    ]);
    expect(view.querySelectorAll('.card-body')).toHaveLength(1);
    expect(view.querySelector('#rounds-body .round')).not.toBeNull();
  });

  it('each have a header button inside a heading, with a turning arrow, and name the section after the title', () => {
    const card = page().querySelector('#stats')!;
    const toggle = card.querySelector<HTMLButtonElement>('h2 > button.card-toggle')!;
    expect(toggle.type).toBe('button');
    expect(toggle.hasAttribute('aria-controls')).toBe(false);
    expect(toggle.querySelector('.card-arrow')!.getAttribute('aria-hidden')).toBe('true');
    expect(card.getAttribute('aria-labelledby')).toBe('stats-title');
    expect(card.querySelector('#stats-title')!.textContent).toBe('Details');
    const open = page({ ...DEFAULT_CARDS, stats: true }).querySelector('#stats-toggle')!;
    expect(open.getAttribute('aria-controls')).toBe('stats-body');
  });

  it('report a tap on the header with the card name', () => {
    const onToggleCard = vi.fn();
    page(undefined, onToggleCard).querySelector<HTMLButtonElement>('#top8-toggle')!.click();
    expect(onToggleCard).toHaveBeenCalledWith('top8');
  });

  it('each start with a one-line explanation', () => {
    const view = page(ALL_OPEN);
    const intros = [...view.querySelectorAll('.card-body')].map((body) => body.firstElementChild!);
    expect(intros.map((intro) => intro.className)).toEqual(Array(7).fill('card-intro'));
    expect(intros.map((intro) => intro.textContent)).toEqual([
      'What moved the prediction away from the official rating, largest effect first.',
      "The player's round ratings over time, newest to the right, with the rating window shaded and lines across it for the official and the predicted rating.",
      'Add round ratings that are not on pdga.com yet, or rounds you expect to play.',
      'The average round rating your next rounds need to reach a rating at the update they count in.',
      "Same idea as PDGA's Global Masters Series: the 8 highest rated rounds in the period, here for any player.",
      'The numbers behind the prediction: the window, dropped and doubled rounds, averages, events and wins.',
      'The rounds that count, newest first, and how each counts in the prediction. Older rounds are a tap away, under the list.',
    ]);
  });

  it('link the Global Masters Series to its pdga.com page, in the same tab', () => {
    const link = page(ALL_OPEN).querySelector<HTMLAnchorElement>('#top8-body .card-intro a')!;
    expect(link.textContent).toBe('Global Masters Series');
    expect(link.getAttribute('href')).toBe('https://www.pdga.com/global-masters-series');
    expect(link.hasAttribute('target')).toBe(false);
  });

  it('keep Rounds for events without rated rounds, and leave it out with neither', () => {
    const empty = rawEvent({}, [rawEventRow('100002', ['950'])]);
    const model = buildModel({ ...stored, details: [], events: [empty] }, 100001, NOW);
    const view = ratingView({ model, favorite: true, now: NOW, onAddFavorite: vi.fn() });
    expect(view.querySelector('#rounds-body .hint')!.textContent).toMatch(/^No rated rounds for #100001 yet in: /);
    expect(view.querySelector('#rounds-body .rounds')).toBeNull();
    const none = buildModel({ ...stored, details: [], events: [] }, 100001, NOW);
    expect(ratingView({ model: none, favorite: true, now: NOW, onAddFavorite: vi.fn() }).querySelector('#rounds')).toBeNull();
  });
});

describe('textWithNodes', () => {
  it('puts nodes in place of placeholders and keeps the rest as text', () => {
    const link = el('a', {}, 'here');
    const parts = textWithNodes('Read {link}, not {other} <b>.', { link });
    expect(parts).toEqual(['Read ', link, ', not ', '{other}', ' <b>.']);
  });
});

describe('top 8 panel', () => {
  /** Nine rated rounds this year, one of them in a later round of an event without an id. */
  const stored: StoredImport = {
    at: '2026-10-01T10:00:00.000Z',
    player: rawPlayer(),
    details: [
      ...[1000, 990, 980, 970, 960, 950, 940, 930].map((rating, i) =>
        rawDetailsRow({ eventId: String(900100 + i), date: `${i + 1}-Mar-2026`, rating: String(rating) }),
      ),
      rawDetailsRow({ eventId: '', eventName: 'Club Round', date: '1-Apr-2026', round: '2', roundLabel: '2', rating: '1010' }),
      rawDetailsRow({ eventId: '900200', date: '1-Jun-2025', rating: '1050' }),
    ],
    events: [],
  };

  function page(props: Partial<Top8Props> = {}, data = stored) {
    const model = buildModel(data, 100001, NOW);
    const top8: Top8Props = {
      top: topEight(model, props.top?.period ?? THIS_YEAR, '2026-10-04'),
      today: '2026-10-04',
      onPeriod: vi.fn(),
      onOwn: vi.fn(),
      ...props,
    };
    return ratingView({ model, top8, cards: ALL_OPEN, favorite: true, now: NOW, onAddFavorite: vi.fn() });
  }

  it('offers the manual rounds switch only with a manual round, and marks manual rounds when they count', () => {
    expect(page().querySelector('#top8-own')).toBeNull();
    const manual = manualToRounds([
      { id: 'a', rating: 1060, date: '2026-09-01', eventName: 'Practice league', holes: null, example: false, leftOut: false },
      { id: 'b', rating: 1055, date: '2026-09-02', eventName: '', holes: null, example: false, leftOut: false },
    ]);
    const model = buildModel(stored, 100001, NOW, manual);
    const onOwn = vi.fn();
    const view = (own: boolean) =>
      ratingView({
        model,
        top8: { top: topEight(model, THIS_YEAR, '2026-10-04', own), today: '2026-10-04', onPeriod: vi.fn(), onOwn },
        cards: ALL_OPEN,
        favorite: true,
        now: NOW,
        onAddFavorite: vi.fn(),
      });
    const off = view(false);
    const box = off.querySelector<HTMLInputElement>('#top8-own')!;
    expect(box.checked).toBe(false);
    expect(off.querySelector('label[for="top8-own"]')!.textContent).toBe('Include manual rounds');
    expect(off.querySelector('.top8-row-own')).toBeNull();
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(onOwn).toHaveBeenCalledWith(true);

    const on = view(true);
    expect(on.querySelector<HTMLInputElement>('#top8-own')!.checked).toBe(true);
    const own = [...on.querySelectorAll('.top8-row-own')];
    expect(own.map((row) => row.textContent)).toEqual(['ManualPractice league1060', 'ManualManual round1055']);
    expect(own[0]!.querySelector('a')).toBeNull();
  });

  it('is a card right before Statistics, closed by default', () => {
    const model = buildModel(stored, 100001, NOW);
    const top8 = { top: topEight(model, THIS_YEAR, '2026-10-04'), today: '2026-10-04', onPeriod: vi.fn(), onOwn: vi.fn() };
    const view = ratingView({ model, top8, favorite: true, now: NOW, onAddFavorite: vi.fn() });
    const card = view.querySelector('#top8')!;
    expect(card.querySelector('#top8-toggle')!.getAttribute('aria-expanded')).toBe('false');
    expect(card.querySelector('#top8-title')!.textContent).toBe('Top 8');
    expect(card.nextElementSibling!.id).toBe('stats');
  });

  function pick(view: HTMLElement, value: string) {
    const select = view.querySelector<HTMLSelectElement>('#top8-period')!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  it('offers each year with rated rounds newest first, the rating window and a custom range, in one labelled select', () => {
    const view = page();
    const select = view.querySelector<HTMLSelectElement>('#top8-period')!;
    expect(view.querySelector('label[for="top8-period"]')!.textContent).toBe('Period');
    expect([...select.options].map((option) => [option.value, option.textContent])).toEqual([
      ['year:2026', '2026'],
      ['year:2025', '2025'],
      // Without its dates, which would not fit the select on a phone.
      ['window', 'Rating window (12 months)'],
      ['custom', 'Custom range'],
    ]);
    // The current year by default, and the period is not repeated under the select.
    expect(select.value).toBe('year:2026');
    expect(view.querySelector('.top8-band')).toBeNull();
    expect(view.querySelector('#top8-from')).toBeNull();
    expect(view.querySelector('#top8-window-dates')).toBeNull();
  });

  it('names the window dates under the select while the rating window is picked', () => {
    const model = buildModel(stored, 100001, NOW);
    const view = page({ top: topEight(model, { kind: 'window' }, '2026-10-04') });
    expect(view.querySelector('#top8-window-dates')!.textContent).toMatch(/^\d{2}\/\d{2}\/\d{4} to \d{2}\/\d{2}\/\d{4}$/);
    expect(view.querySelector('#top8-period')!.getAttribute('aria-describedby')).toBe('top8-window-dates');
  });

  it('reports the picked period, with no year for the current one', () => {
    const onPeriod = vi.fn();
    const view = page({ onPeriod });
    pick(view, 'year:2025');
    expect(onPeriod).toHaveBeenLastCalledWith({ kind: 'year', year: 2025 });
    pick(view, 'year:2026');
    expect(onPeriod).toHaveBeenLastCalledWith({ kind: 'year', year: null });
    pick(view, 'window');
    expect(onPeriod).toHaveBeenLastCalledWith({ kind: 'window' });
    pick(view, 'custom');
    expect(onPeriod).toHaveBeenLastCalledWith({ kind: 'custom', from: '2025-10-04', to: '2026-10-04' });
  });

  it('shows the from and to dates of a custom range, and reports a valid change', () => {
    const onPeriod = vi.fn();
    const model = buildModel(stored, 100001, NOW);
    const top = topEight(model, { kind: 'custom', from: '2026-03-01', to: '2026-03-04' }, '2026-10-04');
    const view = page({ top, onPeriod });
    expect(view.querySelector<HTMLSelectElement>('#top8-period')!.value).toBe('custom');
    const from = view.querySelector<HTMLInputElement>('#top8-from')!;
    const to = view.querySelector<HTMLInputElement>('#top8-to')!;
    expect([from.type, from.value, to.value]).toEqual(['date', '2026-03-01', '2026-03-04']);
    for (const field of [from, to]) {
      expect(field.parentElement!.className).toBe('date-input');
      expect(field.nextElementSibling!.matches('svg.date-icon[aria-hidden="true"]')).toBe(true);
    }
    expect(view.querySelectorAll('.top8-row')).toHaveLength(4);
    to.value = '2026-03-02';
    to.dispatchEvent(new Event('change'));
    expect(onPeriod).toHaveBeenCalledWith({ kind: 'custom', from: '2026-03-01', to: '2026-03-02' });
  });

  it('says why a custom range cannot be used, without reporting it', () => {
    const onPeriod = vi.fn();
    const model = buildModel(stored, 100001, NOW);
    const top = topEight(model, { kind: 'custom', from: '2026-03-01', to: '2026-03-04' }, '2026-10-04');
    const view = page({ top, onPeriod });
    const from = view.querySelector<HTMLInputElement>('#top8-from')!;
    const status = view.querySelector('#top8-range-status')!;
    from.value = '2026-04-01';
    from.dispatchEvent(new Event('change'));
    expect(from.getAttribute('aria-invalid')).toBe('true');
    expect(status.textContent).toBe('Pick a from date on or before the to date.');
    from.value = '';
    from.dispatchEvent(new Event('change'));
    expect(status.textContent).toBe('Pick both dates.');
    expect(onPeriod).not.toHaveBeenCalled();
  });

  it('shows Sum, Average and High, then the 8 highest rounds', () => {
    const view = page();
    const figures = [...view.querySelectorAll('.top8-figure')].map((figure) => [
      figure.querySelector('dt')!.textContent,
      figure.querySelector('dd')!.textContent,
    ]);
    expect(figures).toEqual([
      ['Sum', '7800'],
      ['Average', '975'],
      ['High', '1010'],
    ]);
    const rows = [...view.querySelectorAll('.top8-row')];
    expect(rows.map((row) => row.querySelector('.top8-rating')!.textContent)).toEqual([
      '1010', '1000', '990', '980', '970', '960', '950', '940',
    ]);
    expect(view.querySelector('#top8-found')).toBeNull();
  });

  it('labels each round "RD n", with the event linked to pdga.com when its id is known', () => {
    const rows = [...page().querySelectorAll('.top8-row')];
    expect([...rows[0]!.children].map((child) => child.className)).toEqual(['top8-label', 'top8-event', 'top8-rating']);
    expect(rows[0]!.querySelector('.top8-label')!.textContent).toBe('RD 2');
    expect(rows[0]!.querySelector('.top8-event')!.textContent).toBe('Club Round');
    expect(rows[0]!.querySelector('a')).toBeNull();
    const link = rows[1]!.querySelector<HTMLAnchorElement>('.top8-event a')!;
    expect(link.textContent).toBe('Example Open');
    expect(link.getAttribute('href')).toBe('https://www.pdga.com/tour/event/900100');
    expect(link.hasAttribute('target')).toBe(false);
  });

  describe('header while closed', () => {
    function teaser(period: TopPeriod, data = stored) {
      const model = buildModel(data, 100001, NOW);
      const top8 = { top: topEight(model, period, '2026-10-04'), today: '2026-10-04', onPeriod: vi.fn(), onOwn: vi.fn() };
      const view = ratingView({ model, top8, cards: DEFAULT_CARDS, favorite: true, now: NOW, onAddFavorite: vi.fn() });
      return view.querySelector('#top8 .card-teaser')?.textContent;
    }

    it('shows the average and the chosen period', () => {
      expect(teaser(THIS_YEAR)).toBe('Average 975 · 2026');
      expect(teaser({ kind: 'window' })).toMatch(/^Average \d+ · Rating window$/);
      expect(teaser({ kind: 'custom', from: '2026-03-01', to: '2026-03-04' })).toMatch(/^Average 985 · 4 of 8 · \S+ – \S+$/);
    });

    it('says how many of the 8 were found, or that there are none', () => {
      expect(teaser(THIS_YEAR, { ...stored, details: stored.details!.slice(0, 3) })).toBe('Average 990 · 3 of 8 · 2026');
      expect(teaser({ kind: 'year', year: 2024 })).toBe('No rounds · 2024');
    });

    it('is not shown while open', () => {
      expect(page().querySelector('#top8 .card-teaser')).toBeNull();
    });
  });

  it('says how many rounds were found when there are fewer than 8', () => {
    const view = page({}, { ...stored, details: stored.details!.slice(0, 3) });
    expect(view.querySelector('#top8-found')!.textContent).toBe('3 rated rounds found; the Top 8 takes 8.');
    expect(view.querySelectorAll('.top8-row')).toHaveLength(3);
    expect(view.querySelectorAll('.top8-figure dd')[1]!.textContent).toBe('990');
  });

  it('shows the rating window', () => {
    const model = buildModel(stored, 100001, NOW);
    const view = page({ top: topEight(model, { kind: 'window' }, '2026-10-04') });
    expect(view.querySelector<HTMLSelectElement>('#top8-period')!.value).toBe('window');
    expect(view.querySelectorAll('.top8-row')).toHaveLength(8);
  });

  it('says so when no round was rated in the period', () => {
    const view = page({}, { ...stored, details: stored.details!.slice(-1) });
    expect(view.querySelector('.top8-empty')!.textContent).toBe('No rated rounds in this period.');
    expect(view.querySelector('.top8-figures')).toBeNull();
  });

  it('shows in Swedish', () => {
    setLanguage('sv');
    const view = page();
    expect(view.querySelector('#top8-title')!.textContent).toBe('Topp 8');
    expect([...view.querySelectorAll('.top8-figure dt')].map((dt) => dt.textContent)).toEqual(['Summa', 'Snitt', 'Högsta']);
  });
});

describe('import banner', () => {
  it('links to the pages that could not be fetched', () => {
    const failed = ['https://www.pdga.com/player/100001/details', 'https://www.pdga.com/tour/event/900003'];
    const banner = bannerView({ message: 'import.status.challenge', tone: 'warning', failed }, () => {}, () => {});
    expect(banner.getAttribute('role')).toBe('alert');
    const links = [...banner.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(failed);
    expect(links.map((link) => link.textContent)).toEqual(['Ratings details on pdga.com', 'Event 900003 on pdga.com']);
    expect(links.some((link) => link.hasAttribute('target'))).toBe(false);
    expect(banner.textContent).toContain('run the bookmarklet on each of them');
  });

  it('closes', () => {
    const onClose = vi.fn();
    bannerView({ message: 'import.status.ok', tone: 'info' }, onClose, () => {}).querySelector('button')!.click();
    expect(onClose).toHaveBeenCalled();
  });

  it('offers a newer bookmarklet only after an outdated one', () => {
    const onOpenSetup = vi.fn();
    expect(bannerView({ message: 'import.status.ok', tone: 'info' }, () => {}, onOpenSetup).querySelector('#banner-setup')).toBeNull();
    const banner = bannerView({ message: 'import.status.ok', tone: 'info', outdated: true }, () => {}, onOpenSetup);
    expect(banner.textContent).toContain('A newer version of the bookmarklet');
    banner.querySelector<HTMLButtonElement>('#banner-setup')!.click();
    expect(onOpenSetup).toHaveBeenCalled();
  });
});

describe('update notice', () => {
  it('offers a reload to switch to the new version', () => {
    const onReload = vi.fn();
    const notice = updateNotice(onReload);
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.textContent).toContain('A new version of the app is available.');
    notice.querySelector<HTMLButtonElement>('#update-reload')!.click();
    expect(onReload).toHaveBeenCalled();
  });
});

function setupProps(bookmarklet: string): SetupProps {
  return { bookmarklet, stored: null, pdgaNumber: 100001, platform: 'iphone', onPlatform: vi.fn(), onBack: vi.fn() };
}

describe('bookmarklet status', () => {
  it('says whether the bookmarklet of the last hand-off is up to date', () => {
    expect(bookmarkletStatus('1.0.0', '1.0.0')).toMatchObject({ className: 'hint', textContent: 'Your bookmarklet: 1.0.0, up to date' });
    // A newer one than the app knows, as from a cached app: nothing to update.
    expect(bookmarkletStatus('1.2.0', '1.1.0').textContent).toBe('Your bookmarklet: 1.2.0, up to date');
    expect(bookmarkletStatus('1.0.0', '1.1.0')).toMatchObject({
      className: 'warning',
      textContent: 'Your bookmarklet: 1.0.0, a newer one (1.1.0) is available',
    });
    expect(bookmarkletStatus(null, '1.1.0').textContent).toBe(
      'Your bookmarklet: no import in this browser yet (current version 1.1.0)',
    );
  });

  it('shows at the top of the setup page', () => {
    const view = setupView({ ...setupProps('javascript:void 0'), stored: '0.9' });
    expect(view.querySelector('h1')!.nextElementSibling!.id).toBe('bookmarklet-status');
    expect(view.querySelector('#bookmarklet-status')!.textContent).toContain('0.9, a newer one');
  });
});

describe('bookmarklet setup', () => {
  const CODE = 'javascript:(function(){location.assign("https://example.github.io/next-rating/#d=")})();void 0';

  it('tells older bookmarklet versions apart', () => {
    expect(isOlderVersion('0.9.9', '1.0.0')).toBe(true);
    expect(isOlderVersion('1.0', '1.0.1')).toBe(true);
    expect(isOlderVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isOlderVersion('1.10.0', '1.9.0')).toBe(false);
  });

  it('guesses the kind of browser from the device', () => {
    const iPhone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1';
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
    const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';
    const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';
    expect(guessPlatform(iPhone, 5)).toBe('iphone');
    // An iPad reports itself as a Mac with a touch screen.
    expect(guessPlatform(mac, 5)).toBe('iphone');
    expect(guessPlatform(mac, 0)).toBe('computer');
    expect(guessPlatform(android, 5)).toBe('android');
    expect(guessPlatform(windows, 0)).toBe('computer');
  });

  it('shows the code as plain text in the first step, with the version', () => {
    const view = setupView(setupProps(CODE));
    const first = view.querySelector('#setup-steps > .step')!;
    expect(first.querySelector('.step-title')!.textContent).toBe('Copy the bookmarklet.');
    const code = first.querySelector<HTMLTextAreaElement>('#bookmarklet-code')!;
    expect(code.value).toBe(CODE);
    expect(code.readOnly).toBe(true);
    expect(code.children).toHaveLength(0);
    expect(first.querySelector('#copy-bookmarklet')).not.toBeNull();
    expect(view.querySelector('#bookmarklet-version')!.textContent).toBe(`Bookmarklet version ${BOOKMARKLET_VERSION}`);
    // The code is never a link: the CSP would block it, and dom.ts allows https only.
    expect(view.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('keeps the code box close to the Copy button: the status line between them starts empty', () => {
    const first = setupView(setupProps(CODE)).querySelector('#setup-steps > .step')!;
    const status = first.querySelector('#copy-bookmarklet')!.nextElementSibling!;
    expect(status.id).toBe('bookmarklet-code-status');
    expect(status.classList.contains('copy-status')).toBe(true);
    expect(status.textContent).toBe('');
    expect(status.nextElementSibling!.className).toBe('field');
  });

  it.each([
    [
      'iphone',
      'Safari on iPhone',
      [
        'Copy the bookmarklet.',
        'Bookmark this page.',
        "Paste the code into the bookmark's address, not into Safari's address bar.",
        'Try it on pdga.com.',
      ],
    ],
    [
      'android',
      'Android browsers',
      [
        'Copy the bookmarklet.',
        'Bookmark this page.',
        "Paste the code into the bookmark's URL field, not into the browser's address bar.",
        'Try it on pdga.com.',
      ],
    ],
    [
      'computer',
      'Desktop browsers',
      ['Copy the bookmarklet.', "Paste the code into a new bookmark's URL field, not into the address bar.", 'Try it on pdga.com.'],
    ],
  ] as const)('shows numbered steps for %s only', (platform, title, steps) => {
    const view = setupView({ ...setupProps(CODE), platform });
    expect([...view.querySelectorAll('h2')].map((h2) => h2.textContent)).toEqual([title]);
    expect([...view.querySelectorAll('#setup-steps .step-title')].map((step) => step.textContent)).toEqual(steps);
    expect(view.querySelector<HTMLInputElement>(`#platform-${platform}`)!.checked).toBe(true);
  });

  it.each([
    ['iphone', 2, 'Tap the address bar only to show the book icon', 'Klistra in koden i bokmärkets adress, inte i Safaris adressfält.'],
    ['android', 2, 'Replace everything in its URL field with the code', 'Klistra in koden i bokmärkets fält för webbadress (URL), inte i webbläsarens adressfält.'],
    ['computer', 1, 'paste the code into its URL field', 'Klistra in koden i ett nytt bokmärkes fält för webbadress (URL), inte i adressfältet.'],
  ] as const)('says first on %s where to paste the code, and not into the address bar', (platform, index, how, swedish) => {
    const paste = setupView({ ...setupProps(CODE), platform }).querySelectorAll('#setup-steps > .step')[index]!;
    expect(paste.firstElementChild!.className).toBe('step-title');
    expect(paste.firstElementChild!.textContent).toMatch(/^Paste the code into .*, not into .*address bar\.$/);
    expect(paste.textContent).toContain(how);
    setLanguage('sv');
    const sv = setupView({ ...setupProps(CODE), platform }).querySelectorAll('#setup-steps > .step')[index]!;
    expect(sv.querySelector('.step-title')!.textContent).toBe(swedish);
  });

  it('runs the bookmarklet on Android from the address bar', () => {
    const view = setupView({ ...setupProps(CODE), platform: 'android' });
    const run = view.querySelector('#setup-steps')!.lastElementChild!.textContent;
    expect(run).toContain('type get data');
    expect(run).toContain('In Chrome, opening the bookmark from the bookmarks list does not run it.');
  });

  it.each(['iphone', 'android', 'computer'] as const)('names the bookmark after the page title in the steps for %s', (platform) => {
    const view = setupView({ ...setupProps(CODE), platform });
    const steps = [...view.querySelectorAll('#setup-steps > .step')].slice(1).map((step) => step.textContent);
    expect(steps.filter((text) => text!.includes('Next Rating: get data')).length).toBeGreaterThanOrEqual(2);
    expect(view.textContent).not.toContain('{name}');
  });

  it('says on iPhone that only Safari works, and runs it from the book icon', () => {
    const view = setupView({ ...setupProps(CODE), platform: 'iphone' });
    expect(view.querySelector('#setup-note')!.textContent).toMatch(/^It only works in Safari/);
    const steps = view.querySelectorAll('#setup-steps > .step');
    expect(steps[1]!.textContent).toContain('New bookmarks are saved in Favorites.');
    expect(steps[3]!.textContent).toContain('Tap the address bar, tap the book icon, then tap Next Rating: get data.');
    expect(setupView({ ...setupProps(CODE), platform: 'android' }).querySelector('#setup-note')).toBeNull();
  });

  it.each([
    ['iphone', 'Cannot Run Script', 'Tested on Android'],
    ['android', 'Tested on Android in Chrome, Brave, Ghost Browser and Samsung Internet.', 'Cannot Run Script'],
  ] as const)("lists the trouble for %s first, and not the other phone's",(platform, own, other) => {
    const items = [...setupView({ ...setupProps(CODE), platform }).querySelectorAll('#setup-trouble li')].map((li) => li.textContent!);
    expect(items[0]).toContain(own);
    expect(items.join(' ')).not.toContain(other);
    expect(items.at(-1)).toMatch(/browser check/);
  });

  it('switches to another browser', () => {
    const onPlatform = vi.fn();
    const view = document.body.appendChild(setupView({ ...setupProps(CODE), onPlatform }));
    view.querySelector<HTMLInputElement>('#platform-android')!.click();
    expect(onPlatform).toHaveBeenCalledWith('android');
    view.remove();
  });

  it('ends with trying it on your ratings details, which waits for a PDGA number', () => {
    const last = setupView(setupProps(CODE)).querySelector('#setup-steps')!.lastElementChild!;
    expect(last.querySelector<HTMLAnchorElement>('a#details-link')!.getAttribute('href')).toBe('https://www.pdga.com/player/100001/details');
    expect(last.textContent).toContain('Import complete');
    const none = setupView({ ...setupProps(CODE), pdgaNumber: null }).querySelector<HTMLButtonElement>('#details-link')!;
    expect(none.disabled).toBe(true);
  });

  it('offers help when it does not work, closed', () => {
    const trouble = setupView(setupProps(CODE)).querySelector<HTMLDetailsElement>('details#setup-trouble')!;
    expect(trouble.open).toBe(false);
    expect(trouble.querySelector('summary')!.textContent).toBe("If it doesn't work");
    expect(trouble.textContent).toContain('javascript:');
  });

  it("gives the code's length and ending, to check a pasted bookmark against", () => {
    const address = setupView(setupProps(CODE)).querySelector('#setup-trouble li:nth-last-child(4)')!;
    expect(address.textContent).toContain(`holds the whole code: ${formatCount(CODE.length)} characters, ending in ;void 0.`);
    expect(CODE.endsWith(';void 0')).toBe(true);
  });

  it('copies the code to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const view = setupView(setupProps(CODE));
    view.querySelector<HTMLButtonElement>('#copy-bookmarklet')!.click();
    await vi.waitFor(() => expect(view.querySelector('#bookmarklet-code-status')!.textContent).toMatch(/^Copied/));
    expect(writeText).toHaveBeenCalledWith(CODE);
    vi.unstubAllGlobals();
  });

  it('selects the code for the user to copy when the clipboard is not available', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const view = setupView(setupProps(CODE));
    document.body.append(view);
    view.querySelector<HTMLButtonElement>('#copy-bookmarklet')!.click();
    await vi.waitFor(() => expect(view.querySelector('#bookmarklet-code-status')!.textContent).toBe('Copy the selected text.'));
    const code = view.querySelector<HTMLTextAreaElement>('#bookmarklet-code')!;
    expect(document.activeElement).toBe(code);
    expect(code.selectionEnd - code.selectionStart).toBe(CODE.length);
    view.remove();
    vi.unstubAllGlobals();
  });

  it('explains the events the next update may not count: a late report, an unfinished league and X-tier', () => {
    const section = guidePage().querySelector('#guide-xtier')!.parentElement!;
    expect(section.querySelector('h2')!.textContent).toBe('Events the next update may not count');
    expect([...section.querySelectorAll('li')].map((item) => item.textContent!.split('.')[0])).toEqual([
      'A late report',
      'An unfinished league',
      'An X-tier event PDGA leaves out',
    ]);
    const text = section.textContent!;
    for (const part of [
      'one tap',
      'reported by its deadline',
      'tier L on pdga.com',
      'League: counts only when the whole league is finished and reported',
      'X-tier (the tiers XA, XB, XC and XM on pdga.com)',
      '5.10',
      'mulligans',
      'X-tier: may not count',
      'Not counted by PDGA',
      'Top 8 still counts',
    ]) {
      expect(text).toContain(part);
    }
  });

  it('says the Rating tab and the chart also show the following update', () => {
    const text = guidePage().querySelector('#guide-rounds')!.parentElement!.textContent!;
    expect(text).toContain('count in the following update, and the round list says so. The Rating tab then also shows the prediction for that update');
    expect(text).toContain('the chart adds it as one more step');
  });

  it('keeps the PDGA term X-tier in Swedish and explains it once', () => {
    setLanguage('sv');
    const text = guidePage().querySelector('#guide-xtier')!.parentElement!.textContent!;
    expect(text.split('X-tier (nivåerna XA, XB, XC och XM på pdga.com)')).toHaveLength(2);
    expect(text).toContain('Liga: räknas först när hela ligan är klar och rapporterad');
    expect(text).toContain('X-tier: räknas kanske inte');
  });

  it('goes back', () => {
    const onBack = vi.fn();
    setupView({ ...setupProps(CODE), onBack }).querySelector<HTMLButtonElement>('#setup-back')!.click();
    expect(onBack).toHaveBeenCalled();
  });
});

describe('el', () => {
  it('adds text as text, never as markup', () => {
    const node = el('p', {}, '<img src=x onerror=alert(1)>');
    expect(node.children).toHaveLength(0);
    expect(node.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('refuses links that are not https', () => {
    expect(() => el('a', { href: 'javascript:alert(1)' })).toThrow();
    expect(() => el('a', { href: 'http://example.com/' })).toThrow();
  });

  it('refuses inline styles', () => {
    expect(() => el('p', { style: 'color: red' })).toThrow();
  });
});

describe('players panel', () => {
  const imported: StoredImport = { at: '2026-10-17T10:00:00.000Z', player: rawPlayer(), events: [] };
  const players: StoredPlayer[] = [
    { pdgaNumber: 100001, favorite: true, import: imported, manualRounds: [], leftOut: [] },
    { pdgaNumber: 100002, favorite: true, import: null, manualRounds: [], leftOut: [] },
    { pdgaNumber: 100003, favorite: false, import: null, manualRounds: [], leftOut: [] },
  ];

  function panel(extra: Partial<PlayersProps> = {}): HTMLElement {
    return playersPanel({
      players,
      me: 100001,
      selected: 100002,
      editing: false,
      confirmRemove: null,
      flash: null,
      order: 'name',
      now: new Date('2026-10-20T10:00:00.000Z'),
      predictions: new Map(),
      onOrder: vi.fn(),
      onSearch: vi.fn(),
      onSelect: vi.fn(),
      onClose: vi.fn(),
      onToggleEdit: vi.fn(),
      onSetMe: vi.fn(),
      onAskRemove: vi.fn(),
      onRemove: vi.fn(),
      onSave: vi.fn(),
      onAdd: vi.fn(),
      ...extra,
    });
  }

  it('lists favorites with "You", the selected player and when each was imported', () => {
    const view = panel();
    const [me, other] = [...view.querySelectorAll('.player-list')[0]!.querySelectorAll('.player-select')];
    expect(me!.querySelector('.player-name')!.textContent).toBe('Test Player #100001You');
    expect(me!.querySelector('.player-meta')!.textContent).toBe('Imported 3 days ago');
    expect(me!.hasAttribute('aria-current')).toBe(false);
    expect(other!.getAttribute('aria-current')).toBe('true');
    expect(other!.querySelector('[aria-hidden="true"]')!.textContent).toBe('✓ ');
    expect(other!.querySelector('.player-meta')!.textContent).toBe('Not imported yet');
  });

  it('is headed "Players" on wide screens only, with the shown player marked as now on phones', () => {
    const view = panel();
    const heading = view.querySelector('#favorites-title')!;
    // On phones the top bar shows the panel's heading.
    expect(heading.textContent).toBe('Players');
    expect(heading.classList.contains('wide-only')).toBe(true);
    // The sidebar on wide screens keeps the check mark.
    const other = view.querySelector('#player-100002')!;
    expect(other.querySelector('.badge.menu-only')!.textContent).toBe('Now');
    expect(other.querySelector('.player-check')!.classList.contains('wide-only')).toBe(true);
    expect(view.querySelector('#player-100001 .menu-only')).toBeNull();
    // The top bar's button closes the panel, so it has no Close button of its own.
    expect(view.querySelector('#players-close')).toBeNull();
  });

  it('shows each prediction with its change at the right, the figures hidden from screen readers', () => {
    const view = panel({ predictions: new Map([[100001, { rating: 985, change: 7, unchanged: false }]]) });
    const column = view.querySelector('#player-100001 .player-prediction')!;
    expect(column.querySelector('.player-rating')!.textContent).toBe('985');
    const change = column.querySelector('.player-change')!;
    expect(change.textContent).toBe('+7');
    expect(drawnAngle(change.querySelector('svg.slope-arrow')!)).toBe(63);
    expect(change.classList.contains('change-up')).toBe(true);
    expect([...column.querySelectorAll('.player-rating, .player-change')].every((part) => part.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(column.querySelector('.visually-hidden')!.textContent).toBe('Predicted rating 985, +7 vs official rating');
    // The name and import age stay apart from it.
    expect(view.querySelector('#player-100001 .player-text .player-meta')!.textContent).toBe('Imported 3 days ago');
  });

  it('shows a drop with a true minus, and no new rounds as no change', () => {
    const view = panel({
      predictions: new Map([
        [100001, { rating: 1012, change: -3, unchanged: false }],
        [100003, { rating: 950, change: 0, unchanged: true }],
      ]),
    });
    const drop = view.querySelector('#player-100001 .player-change')!;
    expect(drop.textContent).toBe('−3');
    expect(drawnAngle(drop.querySelector('svg.slope-arrow')!)).toBe(-27);
    expect(drop.classList.contains('change-down')).toBe(true);
    // The unsaved player gets it too.
    const same = view.querySelector('#player-100003 .player-change')!;
    expect(same.textContent).toBe('0');
    expect(drawnAngle(same.querySelector('svg.slope-arrow')!)).toBe(0);
    expect(same.classList.contains('change-none')).toBe(true);
  });

  it('shows the rating alone without an official rating, and nothing without a prediction', () => {
    const view = panel({ predictions: new Map([[100001, { rating: 960, change: null, unchanged: false }]]) });
    expect(view.querySelector('#player-100001 .player-rating')!.textContent).toBe('960');
    expect(view.querySelector('#player-100001 .player-change')).toBeNull();
    expect(view.querySelector('#player-100001 .visually-hidden')!.textContent).toBe('Predicted rating 960');
    expect(view.querySelector('#player-100002 .player-prediction')).toBeNull();
    expect(view.querySelector('#player-100003 .player-prediction')).toBeNull();
  });

  it('reads the prediction in Swedish', () => {
    setLanguage('sv');
    const view = panel({ predictions: new Map([[100001, { rating: 985, change: -2, unchanged: false }]]) });
    expect(view.querySelector('#player-100001 .visually-hidden')!.textContent).toBe('Beräknad rating 985, −2 jämfört med officiell rating');
  });

  it("links each player to its ratings details on pdga.com", () => {
    const links = [...panel().querySelectorAll<HTMLAnchorElement>('a.player-details-link')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://www.pdga.com/player/100001/details',
      'https://www.pdga.com/player/100002/details',
      'https://www.pdga.com/player/100003/details',
    ]);
    expect(links[0]!.getAttribute('aria-label')).toBe('Ratings details for Test Player #100001 on pdga.com');
    expect(links.some((link) => link.hasAttribute('target'))).toBe(false);
  });

  it('selects a player', () => {
    const onSelect = vi.fn();
    panel({ onSelect }).querySelector<HTMLButtonElement>('#player-100001')!.click();
    expect(onSelect).toHaveBeenCalledWith(100001);
  });

  it('shows the unsaved player apart, with a button to save it', () => {
    const onSave = vi.fn();
    const view = panel({ onSave });
    expect(view.querySelector('h3')!.textContent).toBe('Not saved');
    view.querySelector<HTMLButtonElement>('#save-100003')!.click();
    expect(onSave).toHaveBeenCalledWith(100003);
  });

  it('shows "This is me" and Remove only while editing', () => {
    expect(panel().querySelector('#remove-100002')).toBeNull();
    expect(panel().querySelector('#players-edit')!.getAttribute('aria-pressed')).toBe('false');
    const view = panel({ editing: true });
    expect(view.querySelector('#players-edit')!.getAttribute('aria-pressed')).toBe('true');
    expect(view.querySelector('#set-me-100001')).toBeNull();
    expect(view.querySelector('#set-me-100002')).not.toBeNull();
    expect(view.querySelector('#remove-100002')!.getAttribute('aria-label')).toBe('Remove #100002');
  });

  it('asks before removing a player', () => {
    const onRemove = vi.fn();
    const onAskRemove = vi.fn();
    const view = panel({ editing: true, confirmRemove: 100001, onRemove, onAskRemove });
    const group = view.querySelector('.confirm')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.textContent).toContain('Remove Test Player #100001 and the data stored for this player?');
    view.querySelector<HTMLButtonElement>('#remove-cancel-100001')!.click();
    expect(onAskRemove).toHaveBeenCalledWith(null);
    view.querySelector<HTMLButtonElement>('#remove-confirm-100001')!.click();
    expect(onRemove).toHaveBeenCalledWith(100001);
  });

  it('adds a player by number and requires one', () => {
    const onAdd = vi.fn();
    const view = panel({ onAdd });
    const input = view.querySelector<HTMLInputElement>('#player-add')!;
    submit(input.form!);
    expect(onAdd).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    input.value = '100004';
    submit(input.form!);
    expect(onAdd).toHaveBeenCalledWith(100004);
  });

  describe('order', () => {
    const named = (pdgaNumber: number, name: string, at: string): StoredPlayer => ({
      pdgaNumber,
      favorite: true,
      import: { at, player: rawPlayer({ pdgaNumber: String(pdgaNumber), name }), events: [] },
      manualRounds: [],
      leftOut: [],
    });
    const many = [
      named(100004, 'Zoe Ash', '2026-10-19T10:00:00.000Z'),
      ...players,
      named(100005, 'Adam Berg', '2026-10-01T10:00:00.000Z'),
    ];
    const listed = (view: HTMLElement) =>
      [...view.querySelectorAll('.player-list')[0]!.querySelectorAll('.player-select')].map((button) => button.id);

    it('lists "me" first, then A to Z, and switches to last updated', () => {
      const onOrder = vi.fn();
      const view = document.body.appendChild(panel({ players: many, onOrder }));
      expect(listed(view)).toEqual(['player-100001', 'player-100005', 'player-100004', 'player-100002']);
      expect(view.querySelector('.segmented legend')!.textContent).toBe('Order');
      expect(view.querySelector<HTMLInputElement>('#order-name')!.checked).toBe(true);
      view.querySelector<HTMLInputElement>('#order-updated')!.click();
      expect(onOrder).toHaveBeenCalledWith('updated');
      view.remove();
      expect(listed(panel({ players: many, order: 'updated' }))).toEqual([
        'player-100001',
        'player-100004',
        'player-100005',
        'player-100002',
      ]);
    });

    it('offers no switch with fewer than two players after "me"', () => {
      expect(panel().querySelector('#order-name')).toBeNull();
    });
  });

  it('searches pdga.com by name and requires one', () => {
    const onSearch = vi.fn();
    const view = panel({ onSearch });
    const input = view.querySelector<HTMLInputElement>('#player-search')!;
    expect(input.type).toBe('search');
    expect(view.querySelector(`label[for="player-search"]`)!.textContent).toBe('Find a player on pdga.com by name');
    submit(input.form!);
    expect(onSearch).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(view.querySelector('#player-search-status')!.textContent).toBe('Enter a first or last name.');
    input.value = ' Anna  Svensson ';
    submit(input.form!);
    expect(onSearch).toHaveBeenCalledWith('https://www.pdga.com/players?FirstName=Anna&LastName=Svensson');
  });

  it('suggests how to add players while there are no favorites', () => {
    const view = panel({ players: [], me: null, selected: null });
    expect(view.querySelector('.hint')!.textContent).toMatch(/No favorites yet/);
    expect(view.querySelector('#players-edit')).toBeNull();
  });

  it('closes with Escape', () => {
    const onClose = vi.fn();
    panel({ onClose }).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('top bar', () => {
  it('has a menu button that controls the players panel and reads Close while it is open', () => {
    const onToggle = vi.fn();
    const bar = topBar({ open: false, onToggle });
    const button = bar.querySelector<HTMLButtonElement>('#players-menu')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('favorites');
    expect(button.textContent).toBe('☰ Players');
    // Without a player to name, the bar holds only the button.
    expect(bar.children).toHaveLength(1);
    button.click();
    expect(onToggle).toHaveBeenCalled();
    const open = topBar({ open: true, onToggle: vi.fn() }).querySelector('#players-menu')!;
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(open.textContent).toBe('Close');
  });

  it('names the shown player, with the PDGA number on a line of its own, before the button', () => {
    const bar = topBar({ open: false, onToggle: vi.fn(), player: { name: 'Test Player', pdgaNumber: 100001 } });
    const heading = bar.querySelector('h1')!;
    expect(heading.textContent).toBe('Test Player #100001');
    expect(heading.querySelector('.topbar-number')!.textContent).toBe('#100001');
    expect(heading.nextElementSibling!.id).toBe('players-menu');
    const unnamed = topBar({ open: false, onToggle: vi.fn(), player: { name: '', pdgaNumber: 100002 } });
    expect(unnamed.querySelector('h1')!.textContent).toBe('#100002');
    expect(unnamed.querySelector('.topbar-number')).toBeNull();
  });

  it("links the shown player's name, or the number without one, to the player's pdga.com profile", () => {
    const named = topBar({ open: false, onToggle: vi.fn(), player: { name: 'Test Player', pdgaNumber: 100001 } });
    const link = named.querySelector('h1 a')!;
    expect(link.textContent).toBe('Test Player');
    expect(link.getAttribute('href')).toBe('https://www.pdga.com/player/100001');
    const unnamed = topBar({ open: false, onToggle: vi.fn(), player: { name: '', pdgaNumber: 100002 } });
    expect(unnamed.querySelector('h1 a')!.getAttribute('href')).toBe('https://www.pdga.com/player/100002');
  });
});

describe('getting-started view for a player without data', () => {
  it("leaves out your own number and opens that player's ratings details", () => {
    const view = startPage(100001, vi.fn(), { player: { pdgaNumber: 100002, label: '#100002' } });
    expect(view.querySelector('h1')!.textContent).toBe('#100002');
    expect(view.querySelector('#pdga-number')).toBeNull();
    expect(view.querySelector('#start-by-name')).toBeNull();
    expect(view.querySelectorAll('.step')).toHaveLength(2);
    expect(view.textContent).toContain('Open the ratings details of #100002 on pdga.com');
    expect(view.querySelector<HTMLAnchorElement>('#details-link')!.getAttribute('href')).toBe(
      'https://www.pdga.com/player/100002/details',
    );
  });
});

describe('how it works', () => {
  it('has a section for each topic, in order, each heading ready for focus', () => {
    const view = guidePage();
    expect(view.querySelector('h1')!.textContent).toBe('How it works');
    const headings = [...view.querySelectorAll('h2')];
    expect(headings.map((h2) => h2.id)).toEqual(GUIDE_SECTIONS.map(guideSectionId));
    expect(headings.map((h2) => h2.getAttribute('tabindex'))).toEqual(Array(GUIDE_SECTIONS.length).fill('-1'));
    expect(GUIDE_SECTIONS).toEqual(['about', 'data', 'rules', 'rounds', 'xtier', 'why', 'chart', 'target', 'top8']);
  });

  it('says the app is unofficial, and links to the PDGA pages it follows, in the same tab', () => {
    const view = guidePage();
    expect(view.querySelector('#guide-about')!.parentElement!.textContent).toMatch(/not affiliated with/);
    const links = [...view.querySelectorAll<HTMLAnchorElement>('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      'https://www.pdga.com/',
      'https://www.pdga.com/ratings/guide',
      'https://www.pdga.com/faq/ratings/when-updated',
      'https://www.pdga.com/global-masters-series',
      KOFI_URL,
    ]);
    expect(view.querySelector('a[target]')).toBeNull();
  });

  it('ends with the Ko-fi link, just before Back', () => {
    const view = guidePage();
    const support = view.querySelector(`a[href="${KOFI_URL}"]`)!.parentElement!;
    expect(support.textContent).toBe('Like Next Rating? Buy me a coffee on Ko-fi');
    expect(support.className).toBe('support');
    expect(view.querySelectorAll('.support')).toHaveLength(1);
    expect(support.nextElementSibling!.id).toBe('guide-back');
  });

  it('explains the rules, and is honest about what is not yet checked and where the decimals come from', () => {
    const rules = guidePage().querySelector('#guide-rules')!.parentElement!.textContent!;
    for (const part of ['12 months', '24 months', '2.5 standard deviations', 'at least 7 rounds', 'at least 9 counted rounds', 'highest rated rounds of that event', '9-hole round counts half', 'DNF']) {
      expect(rules).toContain(part);
    }
    expect(rules).toContain('One thing is not yet checked against a real player');
    expect(rules).toContain('two low rounds dropped in the same window');
    expect(rules).toContain('A rating only changes when new rated rounds are added');
    expect(rules).toContain('whole round ratings shown on pdga.com');
  });

  it('goes back', () => {
    const onBack = vi.fn();
    guidePage({ onBack }).querySelector<HTMLButtonElement>('#guide-back')!.click();
    expect(onBack).toHaveBeenCalled();
  });

  /** The text size toolbar's value and buttons. */
  function textTools(view: HTMLElement) {
    const button = (id: string) => view.querySelector<HTMLButtonElement>(`#guide-text-${id}`)!;
    return {
      value: () => view.querySelector('#guide-text-value')!.textContent,
      smaller: button('smaller'),
      larger: button('larger'),
      reset: button('reset'),
    };
  }

  it('puts A−, A+ and Reset under the heading, at the app’s size until a step is picked', () => {
    const view = guidePage();
    const tools = view.querySelector('.guide-tools')!;
    expect(tools.previousElementSibling!.id).toBe('guide-title');
    expect(tools.getAttribute('role')).toBe('group');
    expect(view.querySelector(`#${tools.getAttribute('aria-labelledby')}`)!.textContent).toBe('Text size');
    const { value, smaller, larger, reset } = textTools(view);
    expect(value()).toBe('17');
    expect([smaller, larger, reset].map((button) => button.textContent)).toEqual(['A−', 'A+', 'Reset']);
    expect([smaller, larger, reset].map((button) => button.getAttribute('aria-label'))).toEqual(['Smaller text', 'Larger text', null]);
    expect([smaller.disabled, larger.disabled, reset.disabled]).toEqual([false, false, true]);
    expect(view.style.fontSize).toBe('');
    expect(view.style.getPropertyValue('--display-scale')).toBe('');
  });

  it('adds the step to the app’s size, with headings changing half as much', () => {
    const view = guidePage({ textStep: 3 });
    expect(view.style.fontSize).toBe('20px');
    expect(Number(view.style.getPropertyValue('--display-scale'))).toBeCloseTo(displayScale(20, 17));
    expect(textTools(view).value()).toBe('20');
    expect(textTools(view).reset.disabled).toBe(false);
    // The step stays when Settings changes the app's size.
    expect(guidePage({ baseTextSize: 22, textStep: 3 }).style.fontSize).toBe('25px');
  });

  it('changes the size in place, so the page is not drawn again', () => {
    const onTextStep = vi.fn();
    const view = guidePage({ onTextStep });
    const tools = view.querySelector('.guide-tools');
    const { value, smaller, larger, reset } = textTools(view);
    larger.click();
    expect(onTextStep).toHaveBeenLastCalledWith(1);
    expect(view.style.fontSize).toBe('18px');
    expect(value()).toBe('18');
    expect(reset.disabled).toBe(false);
    expect(view.querySelector('.guide-tools')).toBe(tools);
    smaller.click();
    expect(onTextStep).toHaveBeenLastCalledWith(0);
    expect(view.style.fontSize).toBe('');
    expect(reset.disabled).toBe(true);
  });

  it('stops at 32 and 14 px, moving focus off a button it disables', () => {
    const onTextStep = vi.fn();
    const view = document.body.appendChild(guidePage({ textStep: 14, onTextStep }));
    const { smaller, larger } = textTools(view);
    larger.focus();
    larger.click();
    expect(onTextStep).toHaveBeenLastCalledWith(15);
    expect(view.style.fontSize).toBe('32px');
    expect(larger.disabled).toBe(true);
    expect(document.activeElement).toBe(smaller);
    view.remove();

    // From 22 px, the largest step shows 32, and A− shows 31.
    const cut = guidePage({ baseTextSize: 22, textStep: 18, onTextStep });
    expect(cut.style.fontSize).toBe('32px');
    textTools(cut).smaller.click();
    expect(onTextStep).toHaveBeenLastCalledWith(9);
    expect(cut.style.fontSize).toBe('31px');

    const smallest = guidePage({ baseTextSize: 22, textStep: -8 });
    expect(smallest.style.fontSize).toBe('14px');
    expect(textTools(smallest).smaller.disabled).toBe(true);
    expect(textTools(smallest).larger.disabled).toBe(false);
  });

  it('goes back to the app’s size with Reset, focus moving to A+', () => {
    const onTextStep = vi.fn();
    const view = document.body.appendChild(guidePage({ textStep: 5, onTextStep }));
    const { larger, reset } = textTools(view);
    reset.focus();
    reset.click();
    expect(onTextStep).toHaveBeenLastCalledWith(0);
    expect(view.style.fontSize).toBe('');
    expect(view.style.getPropertyValue('--display-scale')).toBe('');
    expect(reset.disabled).toBe(true);
    expect(document.activeElement).toBe(larger);
    view.remove();
  });

  it('names the text size buttons in Swedish', () => {
    setLanguage('sv');
    const view = guidePage();
    const { smaller, larger, reset } = textTools(view);
    expect(view.querySelector('.guide-tools-label')!.textContent).toBe('Textstorlek');
    expect([smaller, larger].map((button) => button.getAttribute('aria-label'))).toEqual(['Mindre text', 'Större text']);
    expect(reset.textContent).toBe('Återställ');
  });

  it('opens from Settings', () => {
    const onOpenGuide = vi.fn();
    settingsView({
      language: null,
      preferred: ['en'],
      theme: null,
      textSize: null,
      deviceTextSize: 17,
      dateOrder: null,
      today: '2026-10-21',
      persistent: true,
      bookmarklet: null,
      onLanguage: vi.fn(),
      onTextSize: vi.fn(),
      onDateOrder: vi.fn(),
      openWith: 'me',
      onTheme: vi.fn(),
      onOpenWith: vi.fn(),
      onOpenSetup: vi.fn(),
      onOpenGuide,
    }).querySelector<HTMLButtonElement>('#open-guide')!.click();
    expect(onOpenGuide).toHaveBeenCalled();
  });

  it('opens from each card explanation at the matching section', () => {
    const stored: StoredImport = {
      at: '2026-10-01T10:00:00.000Z',
      player: rawPlayer({ currentRating: '950' }),
      details: [rawDetailsRow()],
      events: [rawEvent()],
    };
    const model = buildModel(stored, 100001, NOW);
    const top8 = { top: topEight(model, THIS_YEAR, '2026-10-04'), today: '2026-10-04', onPeriod: vi.fn(), onOwn: vi.fn() };
    const onGuide = vi.fn();
    const view = ratingView({ model, top8, cards: ALL_OPEN, onGuide, favorite: true, now: NOW, onAddFavorite: vi.fn() });
    const links = [...view.querySelectorAll<HTMLButtonElement>('.card-intro .link-button')];
    expect(links.map((link) => link.id)).toEqual(['why-guide', 'top8-guide', 'stats-guide', 'rounds-guide']);
    expect(links.every((link) => link.textContent === 'How it works' && link.parentElement!.lastChild === link)).toBe(true);
    expect(links[1]!.getAttribute('aria-label')).toBe('How it works: Top 8');
    for (const link of links) link.click();
    expect(onGuide.mock.calls.map(([section]) => section)).toEqual(['why', 'top8', 'rules', 'rules']);
  });

  it('opens at X-tier events from the unofficial events in the Rounds card', () => {
    const stored: StoredImport = { at: '2026-10-01T10:00:00.000Z', player: rawPlayer(), details: [rawDetailsRow()], events: [rawEvent()] };
    const onGuide = vi.fn();
    const props = { model: buildModel(stored, 100001, NOW), cards: ALL_OPEN, onLeaveOut: vi.fn(), favorite: true, now: NOW, onAddFavorite: vi.fn() };
    const link = ratingView({ ...props, onGuide }).querySelector<HTMLButtonElement>('#event-choices #xtier-guide')!;
    expect(link.getAttribute('aria-label')).toBe('How it works: Events the next update may not count');
    link.click();
    expect(onGuide).toHaveBeenCalledWith('xtier');
    expect(ratingView(props).querySelector('#xtier-guide')).toBeNull();
  });
});
