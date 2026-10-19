import './styles.css';
import { resolveLanguage, setLanguage, t } from '../i18n';
import { el } from './dom';
import { browserStorage, createStore } from './storage';
import { PDGA_SAVE_ID, type PdgaFlash } from './views/pdga';
import { settingsView } from './views/settings';
import { startView } from './views/start';

/*
 * The fragment is reserved for the bookmarklet hand-off and there is no
 * path-based routing, so tabs switch in memory only.
 */

const TABS = ['rating', 'settings'] as const;
type Tab = (typeof TABS)[number];

const store = createStore(browserStorage());
const root = document.getElementById('app')!;
let tab: Tab = 'rating';
let flash: PdgaFlash = null;

function preferredLanguages(): readonly string[] {
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

function applyLanguage(): void {
  setLanguage(resolveLanguage(preferredLanguages(), store.get().language));
  document.title = t('app.name');
}

function savePdgaNumber(pdgaNumber: number | null): void {
  const before = store.get().pdgaNumber;
  store.update({ pdgaNumber });
  flash = pdgaNumber !== null ? 'saved' : before !== null ? 'removed' : null;
  // Focus the button rather than the field, so a phone keyboard closes.
  render(PDGA_SAVE_ID);
}

function setLanguageOverride(language: string | null): void {
  store.update({ language });
  applyLanguage();
  render('language');
}

function selectTab(next: Tab): void {
  tab = next;
  render(`tab-${next}`);
  window.scrollTo(0, 0);
}

function tabBar(): HTMLElement {
  return el(
    'nav',
    { class: 'tabbar', 'aria-label': t('tabs.label') },
    ...TABS.map((name) =>
      el(
        'button',
        {
          id: `tab-${name}`,
          class: 'tab',
          type: 'button',
          'aria-current': name === tab ? 'page' : false,
          onclick: () => selectTab(name),
        },
        t(`tabs.${name}`),
      ),
    ),
  );
}

function currentView(): HTMLElement {
  const data = store.get();
  if (tab === 'settings') {
    return settingsView({
      pdgaNumber: data.pdgaNumber,
      flash,
      language: data.language,
      preferred: preferredLanguages(),
      persistent: store.persistent,
      onSavePdgaNumber: savePdgaNumber,
      onLanguage: setLanguageOverride,
    });
  }
  return startView({ pdgaNumber: data.pdgaNumber, flash, onSavePdgaNumber: savePdgaNumber });
}

/** Rebuilds the page, then puts focus back on the element with the same id. */
function render(focusId = document.activeElement?.id): void {
  root.replaceChildren(el('main', { class: 'main' }, currentView()), tabBar());
  flash = null;
  if (focusId) document.getElementById(focusId)?.focus();
}

window.addEventListener('languagechange', () => {
  applyLanguage();
  render();
});

applyLanguage();
render();
