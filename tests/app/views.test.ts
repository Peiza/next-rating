// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { el } from '../../src/app/dom';
import type { StoredImport } from '../../src/app/import';
import { buildModel } from '../../src/app/model';
import { bannerView } from '../../src/app/views/banner';
import { ratingView } from '../../src/app/views/rating';
import { settingsView, type SettingsProps } from '../../src/app/views/settings';
import { isOlderVersion, setupView } from '../../src/app/views/setup';
import { BOOKMARKLET_VERSION } from '../../src/bookmarklet/version';
import { startView } from '../../src/app/views/start';
import { playersPanel, topBar, type PlayersProps } from '../../src/app/views/players';
import type { StoredPlayer } from '../../src/app/storage';
import { setLanguage } from '../../src/i18n';
import { rawDetailsRow, rawEvent, rawEventRow, rawPlayer } from '../handoff/raw';

afterEach(() => setLanguage('en'));

/** Three days after the imports below. */
const NOW = new Date('2026-10-04T10:00:00.000Z');

function startPage(pdgaNumber: number | null, onSavePdgaNumber = vi.fn()) {
  return startView({ pdgaNumber, player: null, flash: null, onSavePdgaNumber, onOpenSetup: vi.fn() });
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
    persistent: true,
    onLanguage: () => {},
    onTheme: () => {},
    onOpenSetup: () => {},
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

describe('getting-started bookmarklet steps', () => {
  it('installs the bookmarklet before opening pdga.com, and offers nothing to paste', () => {
    const onOpenSetup = vi.fn();
    const view = startView({ pdgaNumber: null, player: null, flash: null, onSavePdgaNumber: vi.fn(), onOpenSetup });
    const steps = [...view.querySelectorAll('.step-title')].map((step) => step.textContent);
    expect(steps).toHaveLength(3);
    expect(steps[1]).toMatch(/Install the bookmarklet/);
    expect(steps[2]).toMatch(/run the bookmarklet there/);
    view.querySelector<HTMLButtonElement>('#open-setup')!.click();
    expect(onOpenSetup).toHaveBeenCalled();
    expect(view.querySelector('#open-import')).toBeNull();
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
    return ratingView({ model: buildModel(stored, 100001), favorite, now: NOW, onAddFavorite });
  }

  it('names the player once, in the heading, with the data age on the line below', () => {
    const view = ratingPage();
    expect(view.querySelector('h1')!.textContent).toBe('Test Player #100001');
    expect(view.querySelector('h1')!.nextElementSibling!.firstElementChild!.textContent).toBe('Updated 3 days ago');
    expect(view.textContent!.split('Test Player #100001')).toHaveLength(2);
    // The exact time stays further down.
    expect(view.querySelector('.summary .hint')!.textContent).toMatch(/^Last import: /);
  });

  it('gives the predicted number a label for screen readers', () => {
    const label = ratingPage().querySelector('#predicted')!.previousElementSibling!;
    expect(label.className).toBe('visually-hidden');
    expect(label.textContent).toBe('Predicted rating');
  });

  it('shows the next update and its report deadline, linked to the rule on pdga.com', () => {
    // On 4 Oct 2026 the next update is Tuesday 13 Oct, for events reported by Sunday 11 Oct.
    const link = ratingPage().querySelector<HTMLAnchorElement>('#next-update a')!;
    expect(link.textContent).toMatch(/^Next ratings update: \D*13\D* \(events reported by \D*11\D*\)$/);
    expect(link.getAttribute('href')).toBe('https://www.pdga.com/faq/ratings/when-updated');
    expect(link.hasAttribute('target')).toBe(false);
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
    const line = ratingView({ model, favorite: true, now: NOW, onAddFavorite: vi.fn() }).querySelector('.change')!;
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
    const model = buildModel({ ...stored, details: [rawDetailsRow({ eventId: '' })], events: [] }, 100001);
    const event = ratingView({ model, favorite: true, now: NOW, onAddFavorite: vi.fn() }).querySelector('.round-event')!;
    expect(event.querySelector('a')).toBeNull();
    expect(event.textContent).toBe('Example Open, Round 1');
  });

  it('has a stats panel', () => {
    const stats = ratingPage().querySelector('details#stats')!;
    expect(stats.querySelector('summary')!.textContent).toBe('Statistics');
    const rows = [...stats.querySelectorAll('dl > div.stat')];
    expect(rows.length).toBeGreaterThan(0);
    expect(stats.querySelectorAll('dt').length).toBe(rows.length);
    for (const row of rows) expect([...row.children].map((child) => child.tagName).slice(0, 2)).toEqual(['DT', 'DD']);
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

    function why(extra: Partial<StoredImport> = {}): HTMLElement | null {
      const model = buildModel({ ...stored, player: reproduced, ...extra }, 100001);
      return ratingView({ model, favorite: true, now: NOW, onAddFavorite: vi.fn() }).querySelector('#why');
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
      expect(section.querySelectorAll(':scope > ul > .reason')).toHaveLength(5);
      const more = section.querySelector('details.reasons-more')!;
      expect(more.querySelector('summary')!.textContent).toBe('Show all 6');
      expect(more.querySelectorAll('.reason')).toHaveLength(1);
    });

    it("adds the difference from PDGA's last calculation as the last visible line", () => {
      // The official rating is 950, not the 965 that PDGA's rounds give.
      const section = why({ player: rawPlayer({ currentRating: '950' }) })!;
      const lines = [...section.querySelectorAll(':scope > ul > .reason')];
      expect(lines.map((line) => line.id)).toEqual(['', '', 'why-difference']);
      expect(lines.at(-1)!.querySelector('.reason-text')!.textContent).toBe("Difference from PDGA's last calculation");
      expect(lines.at(-1)!.querySelector('.reason-effect')!.textContent).toMatch(/^[↑↓→][−+]?\d+\.\d$/);
      expect(why()!.querySelector('#why-difference')).toBeNull();
    });

    it('shows the difference line on its own when no round changed', () => {
      const section = why({ events: [], player: rawPlayer({ currentRating: '950' }) })!;
      expect([...section.querySelectorAll('.reason')].map((line) => line.id)).toEqual(['why-difference']);
    });

    it('suggests a new import only when the details are older than the official rating', () => {
      const differs = rawPlayer({ currentRating: '950' });
      expect(why({ player: differs })!.querySelector('.hint')).toBeNull();
      const hint = why({ player: differs, detailsAt: '2026-09-01T10:00:00.000Z' })!.querySelector('.hint')!;
      expect(hint.textContent).toMatch(/^The ratings details were imported before the rating update of \S+\. Import them again/);
      // Without a difference there is nothing to fix.
      expect(why({ detailsAt: '2026-09-01T10:00:00.000Z' })!.querySelector('.hint')).toBeNull();
    });

    it('is hidden when nothing changed or the official rating is unknown', () => {
      expect(why({ events: [] })).toBeNull();
      expect(why({ player: undefined })).toBeNull();
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
    const model = buildModel({ ...stored, player: undefined }, 100001);
    expect(ratingView({ model, favorite: true, now: NOW, onAddFavorite: vi.fn() }).querySelector('h1')!.textContent).toBe('#100001');
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
    { pdgaNumber: 100001, favorite: true, import: imported },
    { pdgaNumber: 100002, favorite: true, import: null },
    { pdgaNumber: 100003, favorite: false, import: null },
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

  it("links each player to its ratings details on pdga.com", () => {
    const links = [...panel().querySelectorAll<HTMLAnchorElement>('a.player-link')];
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
  it('has a menu button that controls the players panel', () => {
    const onToggle = vi.fn();
    const bar = topBar(false, onToggle);
    const button = bar.querySelector<HTMLButtonElement>('#players-menu')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('favorites');
    // The heading names the player, so the bar holds only the button.
    expect(bar.children).toHaveLength(1);
    button.click();
    expect(onToggle).toHaveBeenCalled();
    expect(topBar(true, vi.fn()).querySelector('#players-menu')!.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('getting-started view for a player without data', () => {
  it("leaves out your own number and opens that player's ratings details", () => {
    const view = startView({
      pdgaNumber: 100001,
      player: { pdgaNumber: 100002, label: '#100002' },
      flash: null,
      onSavePdgaNumber: vi.fn(),
      onOpenSetup: vi.fn(),
    });
    expect(view.querySelector('h1')!.textContent).toBe('#100002');
    expect(view.querySelector('#pdga-number')).toBeNull();
    expect(view.querySelectorAll('.step')).toHaveLength(2);
    expect(view.textContent).toContain('Open the ratings details of #100002 on pdga.com');
    expect(view.querySelector<HTMLAnchorElement>('#details-link')!.getAttribute('href')).toBe(
      'https://www.pdga.com/player/100002/details',
    );
  });
});
