import './styles.css';
import bookmarklet from 'virtual:bookmarklet';
import { decodeHandoff, HandoffError, type HandoffErrorCode, type HandoffStatus, type ImportParts } from '../handoff';
import { resolveLanguage, setLanguage, t, type MessageKey } from '../i18n';
import { el } from './dom';
import { readPages } from './handoff';
import { takeFragment } from './import';
import { buildModel } from './model';
import { addFavorite, findPlayer, initialSelection, removePlayer, routeImport, setMe, type Routed } from './players';
import { browserStorage, createStore, MAX_FAVORITES, STORAGE_KEY, type PlayerOrder, type Theme } from './storage';
import { BANNER_ID, bannerView, type Banner } from './views/banner';
import { PDGA_SAVE_ID, type PdgaFlash } from './views/pdga';
import {
  ADD_INPUT_ID,
  MENU_BUTTON_ID,
  orderId,
  PANEL_TITLE_ID,
  playerButtonId,
  playerLabel,
  playersPanel,
  topBar,
  WIDE_QUERY,
} from './views/players';
import { ratingView } from './views/rating';
import { settingsView, themeId } from './views/settings';
import { isOlderVersion, SETUP_ID, setupView } from './views/setup';
import { startView } from './views/start';

/*
 * The fragment is reserved for the bookmarklet hand-off and there is no
 * path-based routing, so tabs switch in memory only.
 */

const TABS = ['rating', 'settings'] as const;
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
/** The player the Rating tab shows. Every page load starts on "me". */
let selected: number | null = initialSelection(store.get());
let flash: PdgaFlash = null;
let banner: Banner | null = null;
/** The bookmarklet setup shows over the current tab, and the id of what opened it gets focus back. */
let setupOpener: string | null = null;
/** On phones, the players panel shows in place of the current view. */
let menuOpen = false;
let editingPlayers = false;
let confirmRemove: number | null = null;
let addFlash: PdgaFlash = null;

function preferredLanguages(): readonly string[] {
  return navigator.languages?.length ? navigator.languages : [navigator.language];
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

/** Your own PDGA number: saved as a favorite and made "me". An empty field clears "me". */
function savePdgaNumber(pdgaNumber: number | null): void {
  const before = store.get().me;
  const { me } = store.update(setMe(store.get(), pdgaNumber));
  if (pdgaNumber !== null && me !== pdgaNumber) {
    flash = 'full';
  } else {
    if (me !== null) selected = me;
    flash = pdgaNumber !== null ? 'saved' : before !== null ? 'removed' : null;
  }
  // Focus the button rather than the field, so a phone keyboard closes.
  render(PDGA_SAVE_ID);
}

/** Saves the unsaved player as a favorite, then puts focus on `focusId`. */
function addToFavorites(pdgaNumber: number, focusId = `tab-${tab}`): void {
  const data = store.get();
  const next = addFavorite(data, pdgaNumber);
  if (next === data) {
    showBanner({ message: 'favorites.full', params: { max: MAX_FAVORITES }, tone: 'warning' });
    return;
  }
  store.update(next);
  render(focusId);
}

function labelOf(pdgaNumber: number): string {
  const player = findPlayer(store.get(), pdgaNumber);
  return player ? playerLabel(player) : t('rating.playerNumber', { number: pdgaNumber });
}

function isWide(): boolean {
  return window.matchMedia?.(WIDE_QUERY).matches ?? false;
}

function toggleMenu(): void {
  menuOpen = !menuOpen;
  editingPlayers = false;
  confirmRemove = null;
  render(menuOpen ? PANEL_TITLE_ID : MENU_BUTTON_ID);
  window.scrollTo(0, 0);
}

function closeMenu(): void {
  if (!menuOpen) return;
  toggleMenu();
}

/** Shows a player on the Rating tab. On phones the menu closes, and focus returns to its button. */
function selectPlayer(pdgaNumber: number): void {
  selected = pdgaNumber;
  tab = 'rating';
  setupOpener = null;
  banner = null;
  menuOpen = false;
  confirmRemove = null;
  render(isWide() ? playerButtonId(pdgaNumber) : MENU_BUTTON_ID);
  window.scrollTo(0, 0);
}

function toggleEditPlayers(): void {
  editingPlayers = !editingPlayers;
  confirmRemove = null;
  render('players-edit');
}

function setMeFromPanel(pdgaNumber: number): void {
  store.update(setMe(store.get(), pdgaNumber));
  render(playerButtonId(pdgaNumber));
}

function askRemove(pdgaNumber: number | null): void {
  const before = confirmRemove;
  confirmRemove = pdgaNumber;
  // Focus goes to Cancel, the safe choice, and back to Remove when cancelled.
  render(pdgaNumber !== null ? `remove-cancel-${pdgaNumber}` : `remove-${before}`);
}

function removeFromPanel(pdgaNumber: number): void {
  const data = store.update(removePlayer(store.get(), pdgaNumber));
  confirmRemove = null;
  if (selected === pdgaNumber) selected = initialSelection(data);
  const anyFavorite = data.players.some((player) => player.favorite);
  if (!anyFavorite) editingPlayers = false;
  render(anyFavorite ? 'players-edit' : PANEL_TITLE_ID);
}

/** Adds a player from the panel's form and shows it, so its pdga.com page is one tap away. */
function addFromPanel(pdgaNumber: number): void {
  const data = store.get();
  const next = addFavorite(data, pdgaNumber);
  if (next === data && !findPlayer(data, pdgaNumber)?.favorite) {
    addFlash = 'full';
    render(`${ADD_INPUT_ID}-save`);
    return;
  }
  store.update(next);
  selectPlayer(pdgaNumber);
}

function setPlayerOrder(playerOrder: PlayerOrder): void {
  store.update({ playerOrder });
  render(orderId(playerOrder));
}

function setLanguageOverride(language: string | null): void {
  store.update({ language });
  applyLanguage();
  render('language');
}

function selectTab(next: Tab): void {
  tab = next;
  setupOpener = null;
  menuOpen = false;
  render(`tab-${next}`);
  window.scrollTo(0, 0);
}

/** Stores an import with its players. An import for one player selects that player. */
function saveImport(parts: ImportParts, owner: number | null = null): Routed {
  const data = store.get();
  const routed = routeImport(data, parts, new Date().toISOString(), owner, selected);
  if (routed.data !== data) store.update({ players: routed.data.players });
  if (routed.owner !== null && routed.players.length > 0) selected = routed.owner;
  return routed;
}

/** What a banner adds about where an import went. */
function importNotes(routed: Routed): Pick<Banner, 'storageFull'> {
  return { storageFull: routed.players.length > 0 && !store.persistent };
}

function eventAddedBanner(routed: Routed): Banner {
  return {
    message: 'import.eventFor',
    params: { players: routed.players.map(labelOf).join(', ') },
    tone: 'info',
    ...importNotes(routed),
  };
}

function openSetup(): void {
  setupOpener = document.activeElement?.id || `tab-${tab}`;
  menuOpen = false;
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
  menuOpen = false;
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
    const routed = saveImport(parts, owner);
    const status = envelope.status === 'ok' && unreadable.length > 0 ? 'partial' : envelope.status;
    const failed = [...(envelope.failed ?? []), ...unreadable];
    const outdated = isOlderVersion(envelope.bookmarklet);
    if (routed.noPlayer) {
      // Event results without anyone to give them to: link back to run the bookmarklet there again.
      const events = (envelope.pages ?? []).map(({ url }) => url).filter((url) => url.includes('/tour/event/'));
      showBanner({ message: 'import.noPlayer', tone: 'warning', failed: [...events, ...failed], outdated });
      return;
    }
    const eventsOnly = routed.owner === null && routed.players.length > 0 && status === 'ok';
    showBanner({
      ...(eventsOnly ? eventAddedBanner(routed) : { ...STATUS_BANNERS[status], ...importNotes(routed) }),
      failed,
      outdated,
    });
  } catch (error) {
    if (!(error instanceof HandoffError)) console.error(error);
    showBanner({ message: ERROR_MESSAGES[error instanceof HandoffError ? error.code : 'malformed'], tone: 'error' });
  }
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
      language: data.language,
      preferred: preferredLanguages(),
      theme: data.theme,
      persistent: store.persistent,
      onLanguage: setLanguageOverride,
      onTheme: setTheme,
      onOpenSetup: openSetup,
    });
  }
  const player = findPlayer(data, selected);
  if (player?.import) {
    return ratingView({
      model: buildModel(player.import, player.pdgaNumber),
      favorite: player.favorite,
      now: new Date(),
      onAddFavorite: (pdgaNumber) => addToFavorites(pdgaNumber),
    });
  }
  return startView({
    pdgaNumber: data.me,
    player: player ? { pdgaNumber: player.pdgaNumber, label: playerLabel(player) } : null,
    flash,
    onSavePdgaNumber: savePdgaNumber,
    onOpenSetup: openSetup,
  });
}

/** Rebuilds the page, then puts focus back on the element with the same id. */
function render(focusId = document.activeElement?.id): void {
  const data = store.get();
  root.replaceChildren(
    el(
      'div',
      { class: menuOpen ? 'shell menu-open' : 'shell' },
      topBar(menuOpen, toggleMenu),
      playersPanel({
        players: data.players,
        me: data.me,
        selected,
        editing: editingPlayers,
        confirmRemove,
        flash: addFlash,
        order: data.playerOrder,
        now: new Date(),
        onOrder: setPlayerOrder,
        // The same tab, so the bookmarklet run on the player's page comes back here.
        onSearch: (url) => window.location.assign(url),
        onSelect: selectPlayer,
        onClose: closeMenu,
        onToggleEdit: toggleEditPlayers,
        onSetMe: setMeFromPanel,
        onAskRemove: askRemove,
        onRemove: removeFromPanel,
        onSave: (pdgaNumber) => addToFavorites(pdgaNumber, playerButtonId(pdgaNumber)),
        onAdd: addFromPanel,
      }),
      el('main', { class: 'main' }, setupOpener === null && banner && bannerView(banner, closeBanner, openSetup), currentView()),
    ),
    tabBar(),
  );
  flash = null;
  addFlash = null;
  if (focusId) document.getElementById(focusId)?.focus();
}

window.addEventListener('languagechange', () => {
  applyLanguage();
  render();
});

// Another tab changed the stored data, such as a hand-off that opened there: show it here too,
// so this tab never writes its older copy back over it.
window.addEventListener('storage', (event) => {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  const data = store.reload();
  if (!findPlayer(data, selected)) selected = initialSelection(data);
  applyTheme();
  applyLanguage();
  render();
});

// Back from another app or tab: show the data age as of now. Nothing is fetched.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
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
