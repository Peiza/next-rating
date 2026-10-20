import './styles.css';
import bookmarklet from 'virtual:bookmarklet';
import type { PlainDate } from '../engine';
import { decodeHandoff, HandoffError, type HandoffErrorCode, type HandoffStatus, type ImportParts } from '../handoff';
import { resolveLanguage, setLanguage, t, type MessageKey } from '../i18n';
import type { RawDetailsRow, RawEvent } from '../parsers/types';
import { ParseError, toPdgaDate } from '../parsers/values';
import { el } from './dom';
import { readPages } from './handoff';
import { applyImport, takeFragment } from './import';
import { buildModel } from './model';
import { readPaste } from './paste';
import { browserStorage, createStore, type Theme } from './storage';
import { BANNER_ID, bannerView, type Banner } from './views/banner';
import { EVENT_DATE_ID, importView, OWNER_ID, PASTE_ID, type PasteMessage } from './views/import';
import { PDGA_SAVE_ID, type PdgaFlash } from './views/pdga';
import { ratingView } from './views/rating';
import { settingsView, themeId } from './views/settings';
import { isOlderVersion, SETUP_ID, setupView } from './views/setup';
import { startView } from './views/start';

/*
 * The fragment is reserved for the bookmarklet hand-off and there is no
 * path-based routing, so tabs switch in memory only.
 */

const TABS = ['rating', 'import', 'settings'] as const;
type Tab = (typeof TABS)[number];

const STATUS_BANNERS: Record<HandoffStatus, Pick<Banner, 'message' | 'tone'>> = {
  ok: { message: 'import.status.ok', tone: 'info' },
  partial: { message: 'import.status.partial', tone: 'warning' },
  challenge: { message: 'import.status.challenge', tone: 'warning' },
  'unsupported-page': { message: 'import.status.unsupported-page', tone: 'error' },
  error: { message: 'import.status.error', tone: 'error' },
};

const ERROR_MESSAGES: Record<HandoffErrorCode, MessageKey> = {
  'too-large': 'import.error.too-large',
  malformed: 'import.error.malformed',
  version: 'import.error.version',
  unsupported: 'import.error.unsupported',
};

const store = createStore(browserStorage());
const root = document.getElementById('app')!;
let tab: Tab = 'rating';
let flash: PdgaFlash = null;
let banner: Banner | null = null;
let pendingEvent: RawEvent | null = null;
let pendingDetails: { details: RawDetailsRow[]; rounds: number } | null = null;
let pasteMessage: PasteMessage | null = null;
/** The bookmarklet setup shows over the current tab, and the id of what opened it gets focus back. */
let setupOpener: string | null = null;

function preferredLanguages(): readonly string[] {
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

/** A phone or tablet, where text on pdga.com cannot be selected well enough to paste a table. */
function isTouchDevice(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

function applyLanguage(): void {
  setLanguage(resolveLanguage(preferredLanguages(), store.get().language));
  document.title = t('app.name');
}

/** --bg of each theme in styles.css, for the browser's toolbar colour. */
const THEME_COLORS: Record<Theme, string> = { light: '#ffffff', dark: '#000000' };

/** Follows the device unless Settings overrides it; styles.css reads data-theme. */
function applyTheme(): void {
  const { theme } = store.get();
  const html = document.documentElement;
  if (theme) html.dataset.theme = theme;
  else delete html.dataset.theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    // Each meta keeps its original colour, which applies when following the device.
    meta.dataset.device ??= meta.content;
    meta.content = theme ? THEME_COLORS[theme] : meta.dataset.device;
  }
}

function setTheme(theme: Theme | null): void {
  store.update({ theme });
  applyTheme();
  render(themeId(theme));
}

function savePdgaNumber(pdgaNumber: number | null): void {
  const before = store.get().pdgaNumber;
  store.update({ pdgaNumber });
  flash = pdgaNumber !== null ? 'saved' : before !== null ? 'removed' : null;
  // Focus the button rather than the field, so a phone keyboard closes.
  render(PDGA_SAVE_ID);
}

function makeDefault(pdgaNumber: number): void {
  store.update({ pdgaNumber });
  render(`tab-${tab}`);
}

function setLanguageOverride(language: string | null): void {
  store.update({ language });
  applyLanguage();
  render('language');
}

function selectTab(next: Tab): void {
  tab = next;
  setupOpener = null;
  pasteMessage = null;
  render(`tab-${next}`);
  window.scrollTo(0, 0);
}

function saveImport(parts: ImportParts, owner: number | null = null): void {
  const { lastImport } = store.get();
  store.update({ lastImport: applyImport(lastImport, parts, new Date().toISOString(), owner) });
}

function openSetup(): void {
  setupOpener = document.activeElement?.id || `tab-${tab}`;
  render(SETUP_ID);
  window.scrollTo(0, 0);
}

function closeSetup(): void {
  const opener = setupOpener;
  setupOpener = null;
  render(opener ?? `tab-${tab}`);
}

/** Shows the result of an import on the Rating tab, with focus on the message. */
function showBanner(next: Banner): void {
  banner = next;
  tab = 'rating';
  setupOpener = null;
  render(BANNER_ID);
  window.scrollTo(0, 0);
}

function closeBanner(): void {
  banner = null;
  render(`tab-${tab}`);
}

async function receiveHandoff(payload: string): Promise<void> {
  try {
    const envelope = await decodeHandoff(payload);
    const { parts, owner, unreadable } = readPages(envelope.pages ?? []);
    saveImport(parts, owner);
    const status = envelope.status === 'ok' && unreadable.length > 0 ? 'partial' : envelope.status;
    showBanner({
      ...STATUS_BANNERS[status],
      failed: [...(envelope.failed ?? []), ...unreadable],
      outdated: isOlderVersion(envelope.bookmarklet),
    });
  } catch (error) {
    if (!(error instanceof HandoffError)) console.error(error);
    showBanner({ message: ERROR_MESSAGES[error instanceof HandoffError ? error.code : 'malformed'], tone: 'error' });
  }
}

function pasted(html: string, text: string): void {
  let result: ReturnType<typeof readPaste>;
  try {
    result = readPaste(html, text);
  } catch (error) {
    const tooLarge = error instanceof ParseError && error.code === 'too-large';
    pasteMessage = { key: tooLarge ? 'paste.tooLarge' : 'paste.malformed', error: true };
    render(PASTE_ID);
    return;
  }
  pasteMessage = null;
  if (result.kind === 'none') {
    pasteMessage = { key: 'paste.none', error: true };
    render(PASTE_ID);
  } else if (result.kind === 'event') {
    pendingEvent = result.event;
    render(EVENT_DATE_ID);
  } else if (!result.player) {
    // The table alone does not say whose rounds these are, so ask.
    pendingDetails = { details: result.details, rounds: result.rounds };
    render(OWNER_ID);
  } else {
    saveImport({ details: result.details, player: result.player });
    showBanner({ message: 'paste.details', params: { count: result.rounds }, tone: 'info' });
  }
}

function importPastedDetails(owner: number): void {
  if (!pendingDetails) return;
  const { details, rounds } = pendingDetails;
  pendingDetails = null;
  saveImport({ details }, owner);
  showBanner({ message: 'paste.details', params: { count: rounds }, tone: 'info' });
}

function addPastedEvent(date: PlainDate, name: string): void {
  if (!pendingEvent) return;
  const event: RawEvent = { ...pendingEvent, date: toPdgaDate(date), name };
  pendingEvent = null;
  saveImport({ events: [event] });
  showBanner({ message: 'paste.eventAdded', tone: 'info' });
}

function cancelPaste(): void {
  pendingEvent = null;
  pendingDetails = null;
  render(PASTE_ID);
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
  if (setupOpener !== null) return setupView({ bookmarklet, onBack: closeSetup });
  const data = store.get();
  if (tab === 'settings') {
    return settingsView({
      pdgaNumber: data.pdgaNumber,
      flash,
      language: data.language,
      preferred: preferredLanguages(),
      theme: data.theme,
      persistent: store.persistent,
      onSavePdgaNumber: savePdgaNumber,
      onLanguage: setLanguageOverride,
      onTheme: setTheme,
      onOpenSetup: openSetup,
    });
  }
  if (tab === 'import') {
    return importView({
      pendingEvent,
      pendingDetails: pendingDetails?.rounds ?? null,
      pdgaNumber: data.pdgaNumber,
      message: pasteMessage,
      touch: isTouchDevice(),
      onPaste: pasted,
      onOpenSetup: openSetup,
      onAddEvent: addPastedEvent,
      onImportDetails: importPastedDetails,
      onCancel: cancelPaste,
    });
  }
  if (data.lastImport) {
    return ratingView({
      model: buildModel(data.lastImport, data.pdgaNumber),
      defaultPdgaNumber: data.pdgaNumber,
      onMakeDefault: makeDefault,
    });
  }
  return startView({
    pdgaNumber: data.pdgaNumber,
    flash,
    onSavePdgaNumber: savePdgaNumber,
    onOpenImport: () => selectTab('import'),
    onOpenSetup: openSetup,
  });
}

/** Rebuilds the page, then puts focus back on the element with the same id. */
function render(focusId = document.activeElement?.id): void {
  root.replaceChildren(
    el('main', { class: 'main' }, setupOpener === null && banner && bannerView(banner, closeBanner, openSetup), currentView()),
    tabBar(),
  );
  flash = null;
  if (focusId) document.getElementById(focusId)?.focus();
}

window.addEventListener('languagechange', () => {
  applyLanguage();
  render();
});

// A hand-off into a page that is already open only changes the fragment.
window.addEventListener('hashchange', () => {
  const payload = takeFragment();
  if (payload !== null) void receiveHandoff(payload);
});

const payload = takeFragment();
applyTheme();
applyLanguage();
render();
if (payload !== null) void receiveHandoff(payload);
