import { languages, resolveLanguage, t } from '../../i18n';
import { BOOKMARKLET_VERSION } from '../../bookmarklet/version';
import { el } from '../dom';
import { detailsLink, pdgaNumberForm, type PdgaFlash } from './pdga';

export interface SettingsProps {
  pdgaNumber: number | null;
  flash: PdgaFlash;
  /** The language override; null follows the device. */
  language: string | null;
  /** The device's preferred languages. */
  preferred: readonly string[];
  persistent: boolean;
  onSavePdgaNumber: (pdgaNumber: number | null) => void;
  onLanguage: (language: string | null) => void;
  onOpenSetup: () => void;
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
  const { pdgaNumber, flash, language, preferred, persistent, onSavePdgaNumber, onLanguage, onOpenSetup } = props;
  return el(
    'section',
    { class: 'view', 'aria-labelledby': 'view-title' },
    el('h1', { id: 'view-title' }, t('settings.title')),
    !persistent && el('p', { class: 'warning' }, t('settings.storageUnavailable')),
    pdgaNumberForm(pdgaNumber, flash, onSavePdgaNumber),
    detailsLink(pdgaNumber),
    pdgaNumber !== null && el('p', { class: 'hint' }, t('settings.detailsHint')),
    languagePicker(language, preferred, onLanguage),
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
