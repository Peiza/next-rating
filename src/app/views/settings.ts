import { languages, resolveLanguage, t, type MessageKey } from '../../i18n';
import { BOOKMARKLET_VERSION } from '../../bookmarklet/version';
import { el } from '../dom';
import type { Theme } from '../storage';

export interface SettingsProps {
  /** The language override; null follows the device. */
  language: string | null;
  /** The device's preferred languages. */
  preferred: readonly string[];
  /** The theme override; null follows the device. */
  theme: Theme | null;
  persistent: boolean;
  onLanguage: (language: string | null) => void;
  onTheme: (theme: Theme | null) => void;
  onOpenSetup: () => void;
}

const THEME_OPTIONS: { value: Theme | null; id: string; label: MessageKey }[] = [
  { value: null, id: 'theme-device', label: 'settings.themeDevice' },
  { value: 'light', id: 'theme-light', label: 'settings.themeLight' },
  { value: 'dark', id: 'theme-dark', label: 'settings.themeDark' },
];

/** The id of the radio for a theme, so focus can return to it. */
export function themeId(theme: Theme | null): string {
  return THEME_OPTIONS.find((option) => option.value === theme)!.id;
}

/** A segmented control of native radios: Device, Light, Dark. */
function themePicker(theme: Theme | null, onTheme: (theme: Theme | null) => void): HTMLElement {
  return el(
    'fieldset',
    { class: 'segmented' },
    el('legend', { class: 'label' }, t('settings.theme')),
    el(
      'div',
      { class: 'segments' },
      ...THEME_OPTIONS.flatMap(({ value, id, label }) => [
        el('input', {
          id,
          type: 'radio',
          name: 'theme',
          value: value ?? '',
          checked: value === theme,
          onchange: () => onTheme(value),
        }),
        el('label', { for: id }, t(label)),
      ]),
    ),
  );
}

function languagePicker(language: string | null, preferred: readonly string[], onLanguage: (language: string | null) => void) {
  const all = languages();
  const device = resolveLanguage(preferred, null);
  const deviceName = all.find((entry) => entry.code === device)?.name ?? device;
  return el(
    'div',
    { class: 'field' },
    el('label', { for: 'language', class: 'label' }, t('settings.language')),
    el(
      'select',
      {
        id: 'language',
        class: 'input',
        onchange: (event) => onLanguage((event.target as HTMLSelectElement).value || null),
      },
      el('option', { value: '', selected: language === null }, t('settings.languageDevice', { language: deviceName })),
      ...all.map(({ code, name }) => el('option', { value: code, lang: code, selected: language === code }, name)),
    ),
  );
}

export function settingsView(props: SettingsProps): HTMLElement {
  const { language, preferred, theme, persistent, onLanguage, onTheme, onOpenSetup } = props;
  return el(
    'section',
    { class: 'view', 'aria-labelledby': 'view-title' },
    el('h1', { id: 'view-title' }, t('settings.title')),
    !persistent && el('p', { class: 'warning' }, t('settings.storageUnavailable')),
    languagePicker(language, preferred, onLanguage),
    themePicker(theme, onTheme),
    el('h2', {}, t('settings.bookmarklet')),
    el('p', { class: 'hint' }, t('setup.version', { version: BOOKMARKLET_VERSION })),
    el(
      'button',
      { id: 'open-setup', class: 'button button-block', type: 'button', onclick: onOpenSetup },
      t('settings.openSetup'),
    ),
    el('h2', {}, t('settings.about')),
    el('p', {}, t('app.privacy')),
    el('p', { id: 'version', class: 'hint' }, t('settings.version', { version: __BUILD_ID__ })),
    el('p', { class: 'notice' }, t('app.unofficial')),
  );
}
