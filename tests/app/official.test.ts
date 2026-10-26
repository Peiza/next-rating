// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiPlayer, ApiState } from '../../src/app/api';
import { apiConfirm, apiSummary } from '../../src/app/views/official';
import { settingsView, type SettingsProps } from '../../src/app/views/settings';
import { startView } from '../../src/app/views/start';
import { validateData } from '../../src/app/storage';
import { setLanguage } from '../../src/i18n';

/* Invented data only. */

afterEach(() => setLanguage('en'));

function player(extra: Partial<ApiPlayer> = {}): ApiPlayer {
  return {
    pdgaNumber: 99999,
    name: 'Test Player',
    rating: 950,
    ratingDate: '2026-10-14',
    membership: 'current',
    membershipExpires: '2026-12-31',
    classification: 'amateur',
    fetchedAt: '2026-10-26T12:00:00.000Z',
    ...extra,
  };
}

const ok = (extra: Partial<ApiPlayer> = {}): ApiState => ({ kind: 'ok', player: player(extra) });

function text(nodes: (HTMLElement | false)[]): string {
  return nodes.flatMap((node) => (node ? [node.textContent] : [])).join('\n');
}

describe('apiConfirm', () => {
  it('names the player, linked to pdga.com, with the rating and date', () => {
    const line = apiConfirm(ok(), 99999) as HTMLElement;
    expect(line.textContent).toMatch(/^Test Player, rating 950 \(.+\)$/);
    const link = line.querySelector('a')!;
    expect(link.textContent).toBe('Test Player');
    expect(link.getAttribute('href')).toBe('https://www.pdga.com/player/99999');
  });

  it('says when there is no current rating', () => {
    expect((apiConfirm(ok({ rating: null, ratingDate: null }), 99999) as HTMLElement).textContent).toBe('Test Player, no current rating');
  });

  it('says when PDGA has no such player', () => {
    expect((apiConfirm({ kind: 'not-found' }, 99999) as HTMLElement).textContent).toBe('PDGA has no player with number 99999.');
  });

  it('shows nothing while loading, after a failure or with the lookup off', () => {
    expect(apiConfirm({ kind: 'loading' }, 99999)).toBe(false);
    expect(apiConfirm({ kind: 'unavailable' }, 99999)).toBe(false);
    expect(apiConfirm(null, 99999)).toBe(false);
  });

  it('shows in the start view for a player without data', () => {
    const view = startView({
      pdgaNumber: 99999,
      player: { pdgaNumber: 99999, label: 'Test Player' },
      flash: null,
      api: ok(),
      tab: 'number',
      onTab: vi.fn(),
      onSavePdgaNumber: vi.fn(),
      onSearch: vi.fn(),
      onOpenSetup: vi.fn(),
    });
    expect(view.querySelector('#api-confirm')?.textContent).toContain('Test Player, rating 950');
    // The attribution stays at the bottom.
    expect(view.lastElementChild?.textContent).toContain('Player, event, and course data provided by PDGA.');
  });
});

describe('apiSummary', () => {
  it('says PDGA published a newer rating than the import', () => {
    const shown = text(apiSummary(ok(), '2026-09-09'));
    expect(shown).toContain('PDGA published a new rating on');
    expect(shown).toContain(': 950. The prediction still uses the rounds from before it.');
  });

  it('has no notice when the import is as new', () => {
    expect(text(apiSummary(ok(), '2026-10-14'))).not.toContain('new rating');
  });

  it('shows the membership with when it was checked', () => {
    expect(text(apiSummary(ok(), '2026-10-14'))).toMatch(/^PDGA membership current until .+\. Checked with PDGA .+\.$/);
    expect(text(apiSummary(ok({ membership: 'expired', membershipExpires: '2025-12-31', rating: null, ratingDate: null }), '2026-10-14'))).toContain(
      'PDGA membership expired on',
    );
    expect(text(apiSummary(ok({ membership: 'none', membershipExpires: null }), '2026-10-14'))).toContain('PDGA membership not current.');
  });

  it('is one muted line after a failure, and nothing otherwise', () => {
    expect(text(apiSummary({ kind: 'unavailable' }, null))).toBe('Could not check the official rating right now.');
    expect(apiSummary({ kind: 'loading' }, null)).toEqual([]);
    expect(apiSummary({ kind: 'not-found' }, null)).toEqual([]);
    expect(apiSummary(null, null)).toEqual([]);
  });

  it('is translated', () => {
    setLanguage('sv');
    expect(text(apiSummary({ kind: 'unavailable' }, null))).toBe('Kunde inte kontrollera den officiella ratingen just nu.');
  });
});

describe('the Settings switch', () => {
  const props: SettingsProps = {
    language: null,
    preferred: ['en'],
    theme: null,
    textSize: null,
    deviceTextSize: 17,
    dateOrder: null,
    today: '2026-10-26',
    openWith: 'me',
    persistent: true,
    bookmarklet: null,
    onLanguage: vi.fn(),
    onTheme: vi.fn(),
    onTextSize: vi.fn(),
    onDateOrder: vi.fn(),
    onOpenWith: vi.fn(),
    onOpenSetup: vi.fn(),
    onOpenGuide: vi.fn(),
  };

  it('is absent from a build without the lookup', () => {
    const view = settingsView(props);
    expect(view.querySelector('#api-lookup')).toBeNull();
    expect(view.textContent).toContain('Nothing is sent to any server.');
  });

  it('turns the lookup on and off, and says what is sent', () => {
    const onApiLookup = vi.fn();
    const view = settingsView({ ...props, apiAvailable: true, apiLookup: true, onApiLookup });
    const box = view.querySelector<HTMLInputElement>('#api-lookup')!;
    expect(box.checked).toBe(true);
    expect(view.querySelector('#api-lookup-hint')?.textContent).toContain('Only the PDGA number, or the name you search for, is sent');
    expect(view.textContent).toContain('Only the PDGA number of the player shown is sent');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(onApiLookup).toHaveBeenCalledWith(false);
  });

  it('keeps the old privacy line when switched off', () => {
    const view = settingsView({ ...props, apiAvailable: true, apiLookup: false });
    expect(view.querySelector<HTMLInputElement>('#api-lookup')!.checked).toBe(false);
    expect(view.textContent).toContain('Nothing is sent to any server.');
  });
});

describe('the stored switch', () => {
  it('is on by default and keeps off', () => {
    expect(validateData({}).apiLookup).toBe(true);
    expect(validateData({ apiLookup: false }).apiLookup).toBe(false);
    expect(validateData({ apiLookup: 'no' }).apiLookup).toBe(true);
  });
});
