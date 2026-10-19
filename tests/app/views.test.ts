// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { el } from '../../src/app/dom';
import { settingsView, type SettingsProps } from '../../src/app/views/settings';
import { startView } from '../../src/app/views/start';
import { setLanguage } from '../../src/i18n';

afterEach(() => setLanguage('en'));

function startPage(pdgaNumber: number | null, onSavePdgaNumber = vi.fn()) {
  return startView({ pdgaNumber, flash: null, onSavePdgaNumber });
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
  };

  it('offers the device setting and every language', () => {
    const options = [...settingsView(props).querySelectorAll('#language option')];
    expect(options.map((option) => option.getAttribute('value'))).toEqual(['', 'en', 'sv']);
    expect(options[0]!.textContent).toContain('Svenska');
    expect(options[2]!.getAttribute('lang')).toBe('sv');
  });

  it('warns when the browser cannot store data', () => {
    expect(settingsView(props).querySelector('.warning')).toBeNull();
    expect(settingsView({ ...props, persistent: false }).querySelector('.warning')).not.toBeNull();
  });

  it('ends with the unofficial notice', () => {
    expect(settingsView(props).lastElementChild!.textContent).toMatch(/not affiliated with/);
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
