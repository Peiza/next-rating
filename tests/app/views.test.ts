// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { el } from '../../src/app/dom';
import type { StoredImport } from '../../src/app/import';
import { buildModel } from '../../src/app/model';
import { bannerView } from '../../src/app/views/banner';
import { importView, type ImportProps } from '../../src/app/views/import';
import { ratingView } from '../../src/app/views/rating';
import { settingsView, type SettingsProps } from '../../src/app/views/settings';
import { isOlderVersion, setupView } from '../../src/app/views/setup';
import { BOOKMARKLET_VERSION } from '../../src/bookmarklet/version';
import { startView } from '../../src/app/views/start';
import { setLanguage } from '../../src/i18n';
import { rawDetailsRow, rawEvent, rawPlayer } from '../handoff/raw';

afterEach(() => setLanguage('en'));

function startPage(pdgaNumber: number | null, onSavePdgaNumber = vi.fn()) {
  return startView({ pdgaNumber, flash: null, onSavePdgaNumber, onOpenImport: vi.fn(), onOpenSetup: vi.fn() });
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
    expect(view.querySelector('a[href*="pdga.com"]')).toBeNull();
  });

  it("links to the player's ratings details", () => {
    const link = startPage(100001).querySelector<HTMLAnchorElement>('#details-link')!;
    expect(link.getAttribute('href')).toBe('https://www.pdga.com/player/100001/details');
    expect(link.rel).toBe('noopener noreferrer');
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

  it('shows in the active language', () => {
    setLanguage('sv');
    expect(startPage(null).querySelector('h2')!.textContent).toBe('Kom igång');
    expect(document.documentElement.lang).toBe('sv');
  });
});

describe('settings view', () => {
  const props: SettingsProps = {
    pdgaNumber: null,
    flash: null,
    language: null,
    preferred: ['sv-SE'],
    persistent: true,
    onSavePdgaNumber: () => {},
    onLanguage: () => {},
    onOpenSetup: () => {},
  };

  it('offers the device setting and every language', () => {
    const options = [...settingsView(props).querySelectorAll('#language option')];
    expect(options.map((option) => option.getAttribute('value'))).toEqual(['', 'en', 'sv']);
    expect(options[0]!.textContent).toContain('Svenska');
    expect(options[2]!.getAttribute('lang')).toBe('sv');
  });

  it('shows the build id', () => {
    expect(settingsView(props).querySelector('#version')!.textContent).toBe('Version dev');
  });

  it('warns when the browser cannot store data', () => {
    expect(settingsView(props).querySelector('.warning')).toBeNull();
    expect(settingsView({ ...props, persistent: false }).querySelector('.warning')).not.toBeNull();
  });

  it('shows the bookmarklet version and opens the setup', () => {
    const onOpenSetup = vi.fn();
    const view = settingsView({ ...props, onOpenSetup });
    expect(view.textContent).toContain(`Bookmarklet version ${BOOKMARKLET_VERSION}`);
    view.querySelector<HTMLButtonElement>('#open-setup')!.click();
    expect(onOpenSetup).toHaveBeenCalled();
  });

  it('ends with the unofficial notice', () => {
    expect(settingsView(props).lastElementChild!.textContent).toMatch(/not affiliated with/);
  });
});

describe('getting-started bookmarklet and paste steps', () => {
  it('installs the bookmarklet before opening pdga.com, and opens the Import tab', () => {
    const onOpenImport = vi.fn();
    const onOpenSetup = vi.fn();
    const view = startView({ pdgaNumber: null, flash: null, onSavePdgaNumber: vi.fn(), onOpenImport, onOpenSetup });
    const steps = [...view.querySelectorAll('.step-title')].map((step) => step.textContent);
    expect(steps[1]).toMatch(/Install the bookmarklet/);
    expect(steps[2]).toMatch(/run the bookmarklet there/);
    view.querySelector<HTMLButtonElement>('#open-setup')!.click();
    expect(onOpenSetup).toHaveBeenCalled();
    view.querySelector<HTMLButtonElement>('#open-import')!.click();
    expect(onOpenImport).toHaveBeenCalled();
  });
});

describe('rating view', () => {
  const stored: StoredImport = {
    at: '2026-10-01T10:00:00.000Z',
    player: rawPlayer({ currentRating: '950' }),
    details: [
      rawDetailsRow({ rating: '970', round: '2', roundLabel: '2' }),
      rawDetailsRow({ rating: '960', round: 'Finals', roundLabel: 'Finals' }),
      rawDetailsRow({ eventId: '900000', date: '1-Jul-2024', rating: '900' }),
    ],
    events: [rawEvent()],
  };

  function ratingPage(defaultPdgaNumber: number | null = 100001, onMakeDefault = vi.fn()) {
    return ratingView({ model: buildModel(stored, defaultPdgaNumber), defaultPdgaNumber, onMakeDefault });
  }

  it('shows the prediction, the change and the official rating', () => {
    const view = ratingPage();
    expect(view.querySelector('#predicted')!.textContent).toBe('962');
    expect(view.querySelector('.change')!.textContent).toBe('↑+12 vs official rating');
    expect(view.querySelector('.official')!.textContent).toContain('950');
    expect(view.textContent).toContain('Last import:');
  });

  it.each([
    ['950', 'up', '↑', '+12'],
    ['970', 'down', '↓', '−8'],
    ['962', 'none', '→', '0'],
  ])('marks a change from an official %s with an arrow and a sign', (official, direction, arrow, sign) => {
    const model = buildModel({ ...stored, player: rawPlayer({ currentRating: official }) }, 100001);
    const line = ratingView({ model, defaultPdgaNumber: 100001, onMakeDefault: vi.fn() }).querySelector('.change')!;
    expect(line.classList.contains(`change-${direction}`)).toBe(true);
    const icon = line.querySelector('.change-arrow')!;
    expect(icon.textContent).toBe(arrow);
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(line.textContent).toBe(`${arrow}${sign} vs official rating`);
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

  it('has a stats panel', () => {
    const stats = ratingPage().querySelector('details#stats')!;
    expect(stats.querySelector('summary')!.textContent).toBe('Statistics');
    expect(stats.querySelectorAll('dt').length).toBe(stats.querySelectorAll('dd').length);
  });

  it('offers to make the imported player the default player', () => {
    const onMakeDefault = vi.fn();
    expect(ratingPage(100001).querySelector('#make-default')).toBeNull();
    ratingPage(100009, onMakeDefault).querySelector<HTMLButtonElement>('#make-default')!.click();
    expect(onMakeDefault).toHaveBeenCalledWith(100001);
  });

  it('ends with the unofficial notice', () => {
    expect(ratingPage().lastElementChild!.textContent).toMatch(/not affiliated with/);
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

describe('bookmarklet setup', () => {
  const CODE = 'javascript:(function(){location.assign("https://example.github.io/next-rating/#d=")})();void 0';

  it('tells older bookmarklet versions apart', () => {
    expect(isOlderVersion('0.9.9', '1.0.0')).toBe(true);
    expect(isOlderVersion('1.0', '1.0.1')).toBe(true);
    expect(isOlderVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isOlderVersion('1.10.0', '1.9.0')).toBe(false);
  });

  it('shows the code as plain text, with the version and steps for each browser', () => {
    const view = setupView({ bookmarklet: CODE, onBack: vi.fn() });
    const code = view.querySelector<HTMLTextAreaElement>('#bookmarklet-code')!;
    expect(code.value).toBe(CODE);
    expect(code.readOnly).toBe(true);
    expect(code.children).toHaveLength(0);
    expect(view.querySelector('#bookmarklet-version')!.textContent).toBe(`Bookmarklet version ${BOOKMARKLET_VERSION}`);
    expect([...view.querySelectorAll('h2')].map((h2) => h2.textContent)).toEqual(['Safari on iPhone', 'Chrome on Android', 'Desktop browsers']);
    expect(view.querySelector('a')).toBeNull();
  });

  it('copies the code to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const view = setupView({ bookmarklet: CODE, onBack: vi.fn() });
    view.querySelector<HTMLButtonElement>('#copy-bookmarklet')!.click();
    await vi.waitFor(() => expect(view.querySelector('#bookmarklet-code-status')!.textContent).toMatch(/^Copied/));
    expect(writeText).toHaveBeenCalledWith(CODE);
    vi.unstubAllGlobals();
  });

  it('selects the code for the user to copy when the clipboard is not available', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const view = setupView({ bookmarklet: CODE, onBack: vi.fn() });
    document.body.append(view);
    view.querySelector<HTMLButtonElement>('#copy-bookmarklet')!.click();
    await vi.waitFor(() => expect(view.querySelector('#bookmarklet-code-status')!.textContent).toBe('Copy the selected text.'));
    const code = view.querySelector<HTMLTextAreaElement>('#bookmarklet-code')!;
    expect(document.activeElement).toBe(code);
    expect(code.selectionEnd - code.selectionStart).toBe(CODE.length);
    view.remove();
    vi.unstubAllGlobals();
  });

  it('goes back', () => {
    const onBack = vi.fn();
    setupView({ bookmarklet: CODE, onBack }).querySelector<HTMLButtonElement>('#setup-back')!.click();
    expect(onBack).toHaveBeenCalled();
  });
});

describe('import view', () => {
  const props: ImportProps = {
    pendingEvent: null,
    pendingDetails: null,
    pdgaNumber: 100001,
    message: null,
    onPaste: () => {},
    onAddEvent: () => {},
    onImportDetails: () => {},
    onCancel: () => {},
  };

  function submitOwner(view: HTMLElement, value?: string) {
    const input = view.querySelector<HTMLInputElement>('#paste-owner')!;
    if (value !== undefined) input.value = value;
    view.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    return input;
  }

  it('asks whose rounds a pasted table holds, starting from the default player', () => {
    const onImportDetails = vi.fn();
    const view = importView({ ...props, pendingDetails: 12, onImportDetails });
    expect(view.textContent).toContain('Found 12 rounds');
    const input = submitOwner(view);
    expect(input.value).toBe('100001');
    expect(onImportDetails).toHaveBeenCalledWith(100001);
  });

  it('takes another player for a pasted table', () => {
    const onImportDetails = vi.fn();
    submitOwner(importView({ ...props, pendingDetails: 12, onImportDetails }), '#100002');
    expect(onImportDetails).toHaveBeenCalledWith(100002);
  });

  it('needs a number for a pasted table when there is no default player', () => {
    const onImportDetails = vi.fn();
    const view = importView({ ...props, pdgaNumber: null, pendingDetails: 1, onImportDetails });
    document.body.replaceChildren(view);
    const input = submitOwner(view);
    expect(input.value).toBe('');
    expect(onImportDetails).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(view.querySelector('#paste-status')!.textContent).toBe('Enter the PDGA number of the player.');
    submitOwner(view, '100003');
    expect(onImportDetails).toHaveBeenCalledWith(100003);
  });

  it('reads both clipboard forms on paste', () => {
    const onPaste = vi.fn();
    const target = importView({ ...props, onPaste }).querySelector('#paste-target')!;
    const event = new Event('paste', { cancelable: true });
    const clipboard = { 'text/html': '<table></table>', 'text/plain': 'a\tb' } as Record<string, string>;
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => clipboard[type] ?? '' } });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onPaste).toHaveBeenCalledWith('<table></table>', 'a\tb');
  });

  it('asks for the date of pasted event results', () => {
    const onAddEvent = vi.fn();
    const view = importView({ ...props, pendingEvent: rawEvent({ eventId: '', name: '' }), onAddEvent });
    const date = view.querySelector<HTMLInputElement>('#paste-date')!;
    expect(date.type).toBe('date');
    expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    date.value = '2026-09-07';
    view.querySelector<HTMLInputElement>('#paste-name')!.value = '  Example   Cup ';
    view.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onAddEvent).toHaveBeenCalledWith('2026-09-07', 'Example Cup');
  });

  it('refuses an empty date', () => {
    const onAddEvent = vi.fn();
    const view = importView({ ...props, pendingEvent: rawEvent(), onAddEvent });
    document.body.replaceChildren(view);
    view.querySelector<HTMLInputElement>('#paste-date')!.value = '';
    view.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onAddEvent).not.toHaveBeenCalled();
    expect(view.querySelector('#paste-status')!.textContent).toBe('Pick a date.');
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
