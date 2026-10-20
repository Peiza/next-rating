// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { el, textWithNodes } from '../../src/app/dom';
import type { StoredImport } from '../../src/app/import';
import { buildModel } from '../../src/app/model';
import { bannerView, updateNotice } from '../../src/app/views/banner';
import { GUIDE_SECTIONS, guideSectionId, guideView } from '../../src/app/views/guide';
import { ratingView } from '../../src/app/views/rating';
import { topEight, type TopPeriod } from '../../src/app/top8';
import type { Top8Props } from '../../src/app/views/top8';
import { settingsView, type SettingsProps } from '../../src/app/views/settings';
import { bookmarkletStatus, guessPlatform, isOlderVersion, setupView, type SetupProps } from '../../src/app/views/setup';
import { BOOKMARKLET_VERSION } from '../../src/bookmarklet/version';
import { startView } from '../../src/app/views/start';
import { playersPanel, topBar, type PlayersProps } from '../../src/app/views/players';
import { CARDS, DEFAULT_CARDS, type CardState, type StoredPlayer } from '../../src/app/storage';
import { setLanguage } from '../../src/i18n';
import { rawDetailsRow, rawEvent, rawEventRow, rawPlayer, rawProfileEvent } from '../handoff/raw';

afterEach(() => setLanguage('en'));

/** Three days after the imports below. */
const NOW = new Date('2026-10-04T10:00:00.000Z');

/** Every Rating tab card open, so their content shows. */
const THIS_YEAR: TopPeriod = { kind: 'year', year: null };

const ALL_OPEN = Object.fromEntries(CARDS.map((name) => [name, true])) as CardState;

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
    bookmarklet: BOOKMARKLET_VERSION,
    onLanguage: () => {},
    onTheme: () => {},
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

  it('shows the calculated official rating only when the engine reproduces it', () => {
    // The official rounds give 965.
    const model = buildModel({ ...stored, player: rawPlayer({ currentRating: '965' }) }, 100001, NOW);
    const official = ratingView({ model, favorite: true, now: NOW, onAddFavorite: vi.fn() }).querySelector('#official')!;
    expect(official.textContent).toMatch(/^Official rating 965 \(calculated 96[45]\.\d\d\), as of \S+$/);
    // 950 is not what the official rounds give, so the decimals would not explain it.
    expect(ratingPage().querySelector('#official')!.textContent).not.toContain('calculated');
  });

  it.each([
    ['950', 'up', '↑', '+12'],
    ['970', 'down', '↓', '−8'],
    ['962', 'none', '→', '0'],
  ])('marks a change from an official %s with an arrow and a sign', (official, direction, arrow, sign) => {
    const model = buildModel({ ...stored, player: rawPlayer({ currentRating: official }) }, 100001, NOW);
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
      const reasons = [...view.querySelectorAll('#why .reason-text')].map((text) => text.textContent);
      expect(reasons).toContain('New round 960, left out by you');
      expect(view.querySelector('#why-left-out')!.textContent).toMatch(/^Counting Example Cup would give \d+ \(−\d+\.\d\)$/);
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
    const target = { draft: { target: '1000', count: '3' }, answer: null, onDraft: vi.fn(), onCalculate: vi.fn() };
    const manual = {
      rounds: [],
      draft: { rating: '', date: '2026-10-04', eventName: '', holes: '' },
      flash: null,
      confirmClear: false,
      undo: null,
      player: 'Test Player #100001',
      today: '2026-10-04',
      onDraft: vi.fn(),
      onAdd: vi.fn(),
      onDelete: vi.fn(),
      onUndo: vi.fn(),
      onAskClear: vi.fn(),
      onClear: vi.fn(),
    };
    const top8 = { top: topEight(model, THIS_YEAR, '2026-10-04'), today: '2026-10-04', onPeriod: vi.fn() };
    return ratingView({ model, manual, target, top8, cards, onToggleCard, favorite: true, now: NOW, onAddFavorite: vi.fn() });
  }

  it('follow the summary in a fixed order, then the unofficial notice', () => {
    const view = page();
    expect([...view.querySelectorAll('.card')].map((card) => card.id)).toEqual(['why', 'manual', 'target', 'top8', 'stats', 'rounds']);
    expect(view.querySelector('.summary')!.nextElementSibling!.id).toBe('why');
    expect(view.querySelector('#rounds')!.nextElementSibling!.className).toBe('notice');
  });

  it('start with only Rounds open', () => {
    const view = page();
    const open = [...view.querySelectorAll('.card-toggle')].map((toggle) => [toggle.id, toggle.getAttribute('aria-expanded')]);
    expect(open).toEqual([
      ['why-toggle', 'false'],
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
    expect(intros.map((intro) => intro.className)).toEqual(Array(6).fill('card-intro'));
    expect(intros.map((intro) => intro.textContent)).toEqual([
      'What moved the prediction away from the official rating, largest effect first.',
      'Add round ratings that are not on pdga.com yet, or rounds you expect to play.',
      'The average round rating your next rounds need to reach a rating at the next update.',
      "Same idea as PDGA's Global Masters Series: the 8 highest rated rounds in the period, here for any player.",
      'The numbers behind the prediction: the window, dropped and doubled rounds, and averages.',
      'Every round the app knows, newest first, and how it counts in the prediction.',
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
      ...props,
    };
    return ratingView({ model, top8, cards: ALL_OPEN, favorite: true, now: NOW, onAddFavorite: vi.fn() });
  }

  it('is a card right before Statistics, closed by default', () => {
    const model = buildModel(stored, 100001, NOW);
    const top8 = { top: topEight(model, THIS_YEAR, '2026-10-04'), today: '2026-10-04', onPeriod: vi.fn() };
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
      ['window', expect.stringMatching(/^Rating window \(12 months, \S+ to \S+\)$/)],
      ['custom', 'Custom range'],
    ]);
    // The current year by default, and the period is not repeated under the select.
    expect(select.value).toBe('year:2026');
    expect(view.querySelector('.top8-band')).toBeNull();
    expect(view.querySelector('#top8-from')).toBeNull();
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
      const top8 = { top: topEight(model, period, '2026-10-04'), today: '2026-10-04', onPeriod: vi.fn() };
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

  it.each([
    ['iphone', 'Safari on iPhone', ['Copy the bookmarklet.', 'Bookmark this page.', 'Paste the code as its address.', 'Try it on pdga.com.']],
    ['android', 'Chrome on Android', ['Copy the bookmarklet.', 'Bookmark this page.', 'Paste the code as its URL.', 'Try it on pdga.com.']],
    ['computer', 'Desktop browsers', ['Copy the bookmarklet.', 'Add a bookmark with the code as its URL.', 'Try it on pdga.com.']],
  ] as const)('shows numbered steps for %s only', (platform, title, steps) => {
    const view = setupView({ ...setupProps(CODE), platform });
    expect([...view.querySelectorAll('h2')].map((h2) => h2.textContent)).toEqual([title]);
    expect([...view.querySelectorAll('#setup-steps .step-title')].map((step) => step.textContent)).toEqual(steps);
    expect(view.querySelector<HTMLInputElement>(`#platform-${platform}`)!.checked).toBe(true);
  });

  it('runs the bookmarklet on Android from the address bar', () => {
    const view = setupView({ ...setupProps(CODE), platform: 'android' });
    expect(view.querySelector('#setup-steps')!.lastElementChild!.textContent).toContain('type Next Rating');
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

  it('is headed "Switch player" on phones, with the shown player marked as now', () => {
    const view = panel();
    const heading = view.querySelector('#favorites-title')!;
    expect(heading.querySelector('.menu-only')!.textContent).toBe('Switch player');
    // The sidebar on wide screens keeps its heading and the check mark.
    expect(heading.querySelector('.wide-only')!.textContent).toBe('Players');
    const other = view.querySelector('#player-100002')!;
    expect(other.querySelector('.badge.menu-only')!.textContent).toBe('Now');
    expect(other.querySelector('.player-check')!.classList.contains('wide-only')).toBe(true);
    expect(view.querySelector('#player-100001 .menu-only')).toBeNull();
    // The top bar's button closes the panel, so it has no Close button of its own.
    expect(view.querySelector('#players-close')).toBeNull();
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

describe('how it works', () => {
  it('has a section for each topic, in order, each heading ready for focus', () => {
    const view = guideView({ onBack: vi.fn() });
    expect(view.querySelector('h1')!.textContent).toBe('How it works');
    const headings = [...view.querySelectorAll('h2')];
    expect(headings.map((h2) => h2.id)).toEqual(GUIDE_SECTIONS.map(guideSectionId));
    expect(headings.map((h2) => h2.getAttribute('tabindex'))).toEqual(Array(GUIDE_SECTIONS.length).fill('-1'));
    expect(GUIDE_SECTIONS).toEqual(['about', 'data', 'rules', 'rounds', 'why', 'target', 'top8']);
  });

  it('says the app is unofficial, and links to the PDGA pages it follows, in the same tab', () => {
    const view = guideView({ onBack: vi.fn() });
    expect(view.querySelector('#guide-about')!.parentElement!.textContent).toMatch(/not affiliated with/);
    const links = [...view.querySelectorAll<HTMLAnchorElement>('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      'https://www.pdga.com/ratings/guide',
      'https://www.pdga.com/faq/ratings/when-updated',
      'https://www.pdga.com/global-masters-series',
    ]);
    expect(view.querySelector('a[target]')).toBeNull();
  });

  it('explains the rules, and is honest about what is not yet checked and where the decimals come from', () => {
    const rules = guideView({ onBack: vi.fn() }).querySelector('#guide-rules')!.parentElement!.textContent!;
    for (const part of ['12 months', '24 months', '2.5 standard deviations', 'at least 7 rounds', 'at least 9 counted rounds', 'highest rated rounds of that event', '9-hole round counts half', 'DNF']) {
      expect(rules).toContain(part);
    }
    expect(rules).toContain('Two things are not yet checked against a real player');
    expect(rules).toContain('two low rounds in the same window');
    expect(rules).toContain('whole round ratings shown on pdga.com');
  });

  it('goes back', () => {
    const onBack = vi.fn();
    guideView({ onBack }).querySelector<HTMLButtonElement>('#guide-back')!.click();
    expect(onBack).toHaveBeenCalled();
  });

  it('opens from Settings', () => {
    const onOpenGuide = vi.fn();
    settingsView({
      language: null,
      preferred: ['en'],
      theme: null,
      persistent: true,
      bookmarklet: null,
      onLanguage: vi.fn(),
      onTheme: vi.fn(),
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
    const top8 = { top: topEight(model, THIS_YEAR, '2026-10-04'), today: '2026-10-04', onPeriod: vi.fn() };
    const onGuide = vi.fn();
    const view = ratingView({ model, top8, cards: ALL_OPEN, onGuide, favorite: true, now: NOW, onAddFavorite: vi.fn() });
    const links = [...view.querySelectorAll<HTMLButtonElement>('.card-intro .link-button')];
    expect(links.map((link) => link.id)).toEqual(['why-guide', 'top8-guide', 'stats-guide', 'rounds-guide']);
    expect(links.every((link) => link.textContent === 'How it works' && link.parentElement!.lastChild === link)).toBe(true);
    expect(links[1]!.getAttribute('aria-label')).toBe('How it works: Top 8');
    for (const link of links) link.click();
    expect(onGuide.mock.calls.map(([section]) => section)).toEqual(['why', 'top8', 'rules', 'rules']);
  });
});
