import './styles.css';
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
import { browserStorage, createStore } from './storage';
import { BANNER_ID, bannerView, type Banner } from './views/banner';
import { EVENT_DATE_ID, importView, OWNER_ID, PASTE_ID, type PasteMessage } from './views/import';
import { PDGA_SAVE_ID, type PdgaFlash } from './views/pdga';
import { ratingView } from './views/rating';
import { settingsView } from './views/settings';
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
  pasteMessage = null;
  render(`tab-${next}`);
  window.scrollTo(0, 0);
}

function saveImport(parts: ImportParts, owner: number | null = null): void {
  const { lastImport } = store.get();
  store.update({ lastImport: applyImport(lastImport, parts, new Date().toISOString(), owner) });
}

/** Shows the result of an import on the Rating tab, with focus on the message. */
function showBanner(next: Banner): void {
  banner = next;
  tab = 'rating';
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
    showBanner({ ...STATUS_BANNERS[status], failed: [...(envelope.failed ?? []), ...unreadable] });
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
  if (tab === 'import') {
    return importView({
      pendingEvent,
      pendingDetails: pendingDetails?.rounds ?? null,
      pdgaNumber: data.pdgaNumber,
      message: pasteMessage,
      onPaste: pasted,
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
  });
}

/** Rebuilds the page, then puts focus back on the element with the same id. */
function render(focusId = document.activeElement?.id): void {
  root.replaceChildren(
    el('main', { class: 'main' }, banner && bannerView(banner, closeBanner), currentView()),
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
applyLanguage();
render();
if (payload !== null) void receiveHandoff(payload);
