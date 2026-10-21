import './styles.css';
import bookmarklet from 'virtual:bookmarklet';
import type { PlainDate } from '../engine';
import { decodeHandoff, HandoffError, type HandoffErrorCode, type HandoffStatus, type ImportParts } from '../handoff';
import { resolveLanguage, setLanguage, t, type MessageKey } from '../i18n';
import { el } from './dom';
import { readPages } from './handoff';
import { setDateOrder, today } from './format';
import { takeFragment } from './import';
import { layersState, readLayers, sameLayers, type Layers, type OverlayView } from './layers';
import { buildModel, manualToRounds, type Model } from './model';
import {
  addFavorite,
  addManualRound,
  clearManualRounds,
  findPlayer,
  initialSelection,
  playerName,
  removeManualRound,
  removePlayer,
  restoreManualRound,
  routeImport,
  setLeftOut,
  setMe,
  type ManualRoundInput,
  type Routed,
} from './players';
import {
  browserStorage,
  createStore,
  MAX_FAVORITES,
  STORAGE_KEY,
  type CardName,
  type ChartAxis,
  type ChartPeriod,
  type DateOrder,
  type OpenWith,
  type PlayerOrder,
  type StoredManualRound,
  type StoredPlayer,
  type Theme,
} from './storage';
import { applyUpdate, registerServiceWorker } from './pwa';
import {
  calculateTarget,
  emptyTargetDraft,
  targetDates,
  type TargetAnswer,
  type TargetDraft,
  type TargetQuery,
} from './target';
import { chartData } from './chart';
import { topEight, type TopPeriod } from './top8';
import { BANNER_ID, bannerView, updateNotice, type Banner } from './views/banner';
import {
  emptyDraft,
  MANUAL_ADD_ID,
  MANUAL_CLEAR_CANCEL_ID,
  MANUAL_CLEAR_ID,
  MANUAL_RATING_ID,
  MANUAL_TOGGLE_ID,
  MANUAL_UNDO_ID,
  type ManualDraft,
  type ManualFlash,
} from './views/manual';
import { PDGA_SAVE_ID, type PdgaFlash } from './views/pdga';
import {
  ADD_INPUT_ID,
  MENU_BUTTON_ID,
  orderId,
  PANEL_TITLE_ID,
  playerButtonId,
  playerLabel,
  playersPanel,
  TOPBAR_TITLE_ID,
  topBar,
  WIDE_QUERY,
} from './views/players';
import { cardToggleId } from './views/card';
import { CHART_FULL_TITLE_ID, chartFullView, type ChartProps } from './views/chart';
import { GUIDE_ID, guideSectionId, guideView, type GuideSection } from './views/guide';
import { ratingView } from './views/rating';
import { TARGET_STATUS_ID } from './views/target';
import { DATE_FORMAT_ID, openWithId, settingsView, themeId } from './views/settings';
import { guessPlatform, isOlderVersion, platformId, SETUP_ID, setupView, type Platform } from './views/setup';
import { startTabId, startView, type StartTab } from './views/start';

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
/** The player the Rating tab shows. A page load starts on "me", or on the player shown last when Settings says so. */
let selected: number | null = initialSelection(store.get());
let flash: PdgaFlash = null;
/** The start view's first step: your PDGA number, or a search by name. A page load starts on the number. */
let startTab: StartTab = 'number';
let banner: Banner | null = null;
/**
 * The bookmarklet setup, How it works or the full-screen chart shows over the
 * current tab, and the id of what opened it gets focus back.
 */
let overlay: { view: OverlayView; opener: string } | null = null;
/** The full-screen chart asked the browser for full screen, which closing it leaves again. */
let chartFullscreen = false;
/** The kind of browser the setup shows steps for: guessed from the device, then as picked. */
let setupPlatform: Platform | null = null;
/** On phones, the players panel shows in place of the current view. */
let menuOpen = false;
/** Where each tab was scrolled when its view was last left or covered. In memory only, so a launch starts at the top. */
const scrollTops: Partial<Record<Tab, number>> = {};
let editingPlayers = false;
let confirmRemove: number | null = null;
let addFlash: PdgaFlash = null;
/*
 * Which Rating tab cards are open, and the Top 8 period, are stored with the
 * settings, the same for every player. What has been typed into a card stays
 * in memory, so a re-render keeps it.
 */
let manualDraft: ManualDraft = emptyDraft(today());
let manualFlash: ManualFlash = null;
let confirmClear = false;
/**
 * The manual round deleted last and where it was, for Undo. Unlike the flash,
 * it lasts through re-renders until the next change to the manual rounds.
 */
let manualUndo: { round: StoredManualRound; index: number } | null = null;
/** Target calculator: what has been typed (filled in when first shown) and the last calculation. */
let targetDraft: TargetDraft | null = null;
let targetQuery: TargetQuery | null = null;
/** The last answer and what it came from, so a re-render does not run the search again. */
let targetMemo: { key: string; answer: TargetAnswer } | null = null;
/** "How to refresh" opened or closed by hand; null follows the data age (open when it is old). */
let refreshOpen: boolean | null = null;
/**
 * The player the manual entry and target calculator drafts belong to;
 * another player starts with them empty.
 */
let manualPlayer: number | null = selected;
/** A new version of the app is installed and waits for a reload. */
let updateReady = false;

function preferredLanguages(): readonly string[] {
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

function applyLanguage(): void {
  setLanguage(resolveLanguage(preferredLanguages(), store.get().language));
  document.title = pageTitle();
}

/**
 * The page title: the bookmarklet's name while the setup shows, so a bookmark
 * made there gets that name and is not mistaken for one to the app.
 */
function pageTitle(): string {
  return overlay?.view === 'setup' ? t('setup.bookmarkName') : t('app.name');
}

/** Dates follow the app's language and the device's region unless Settings fixes their order. */
function applyDateOrder(): void {
  setDateOrder(store.get().dateOrder);
}

function setDateOrderOverride(dateOrder: DateOrder | null): void {
  store.update({ dateOrder });
  applyDateOrder();
  render(DATE_FORMAT_ID);
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

/**
 * Shows another player. While the app opens on the player shown last, that
 * player is stored too; otherwise nothing is written.
 */
function setSelected(pdgaNumber: number | null): void {
  selected = pdgaNumber;
  const { openWith, lastViewed } = store.get();
  if (openWith === 'last' && pdgaNumber !== null && pdgaNumber !== lastViewed) store.update({ lastViewed: pdgaNumber });
}

/** Choosing the player shown last stores the one shown now; going back to "me" forgets it. */
function setOpenWith(openWith: OpenWith): void {
  store.update({ openWith, lastViewed: openWith === 'last' ? selected : null });
  render(openWithId(openWith));
}

/** Your own PDGA number: saved as a favorite and made "me". An empty field clears "me". */
function savePdgaNumber(pdgaNumber: number | null): void {
  const before = store.get().me;
  const { me } = store.update(setMe(store.get(), pdgaNumber));
  if (pdgaNumber !== null && me !== pdgaNumber) {
    flash = 'full';
  } else {
    if (me !== null) setSelected(me);
    flash = pdgaNumber !== null ? 'saved' : before !== null ? 'removed' : null;
  }
  // Focus the button rather than the field, so a phone keyboard closes.
  render(PDGA_SAVE_ID);
}

/** Opens pdga.com's player search in the same tab, so the back gesture or the bookmarklet comes back here. */
function searchPdga(url: string): void {
  window.location.assign(url);
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

/*
 * Opening the players panel, the setup or How it works adds a history entry
 * with the same address, so the phone's back gesture closes it (layers.ts).
 * Closing from the app goes back over that entry too, and the popstate
 * handler shows the entry under it.
 */

/** The history depth of the current entry: how many layer entries the app added under it. */
function historyDepth(): number {
  return readLayers(history.state).depth;
}

/** Adds a history entry for the layers now shown, with the same address. */
function pushLayers(): void {
  const layers: Layers = { overlay: overlay?.view ?? null, menu: menuOpen, depth: historyDepth() + 1 };
  history.pushState(layersState(layers), '', location.pathname + location.search);
}

/**
 * Closes the top layer from the app: back over its entry when the app added
 * it, and the popstate handler shows what is under it. Returns false when
 * there is no such entry, and the caller closes it in place.
 */
function popLayer(): boolean {
  if (historyDepth() === 0) return false;
  history.back();
  return true;
}

/** After closing every layer at once: leaves the entries the app added. Their popstate finds nothing to change. */
function unwindLayers(): void {
  const depth = historyDepth();
  if (depth > 0) history.go(-depth);
}

/** Shows the layers of a history entry, as after the back gesture, with focus where it makes sense. */
function showLayers(next: Layers): void {
  const before: Layers = { overlay: overlay?.view ?? null, menu: menuOpen, depth: 0 };
  if (sameLayers(before, next)) return;
  let focusId: string | undefined;
  if (before.menu && !next.menu) focusId = MENU_BUTTON_ID;
  else if (next.menu) focusId = panelTitleId();
  else if (next.overlay === null) focusId = overlay?.opener ?? `tab-${tab}`;
  else focusId = overlayTitleId(next.overlay);
  if (before.menu !== next.menu) {
    editingPlayers = false;
    confirmRemove = null;
  }
  menuOpen = next.menu;
  if (next.overlay === null) overlay = null;
  else if (overlay?.view !== next.overlay) overlay = { view: next.overlay, opener: `tab-${tab}` };
  render(focusId);
  if (focusId !== overlay?.opener) window.scrollTo(0, 0);
}

/** The panel's heading, which gets focus when the panel opens: in the top bar on phones, where the panel's own is hidden. */
function panelTitleId(): string {
  return isWide() ? PANEL_TITLE_ID : TOPBAR_TITLE_ID;
}

/** Records the current tab's scroll position, while its own view shows: not under a view or the players panel. */
function saveScroll(): void {
  if (overlay === null && !menuOpen) scrollTops[tab] = window.scrollY;
}

function toggleMenu(): void {
  if (menuOpen && popLayer()) return;
  saveScroll();
  menuOpen = !menuOpen;
  editingPlayers = false;
  confirmRemove = null;
  if (menuOpen) pushLayers();
  render(menuOpen ? panelTitleId() : MENU_BUTTON_ID);
  window.scrollTo(0, 0);
}

function closeMenu(): void {
  if (!menuOpen) return;
  toggleMenu();
}

/** Shows a player on the Rating tab. On phones the menu closes, and focus returns to its button. */
function selectPlayer(pdgaNumber: number): void {
  saveScroll();
  setSelected(pdgaNumber);
  tab = 'rating';
  overlay = null;
  banner = null;
  menuOpen = false;
  confirmRemove = null;
  unwindLayers();
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
  if (selected === pdgaNumber) setSelected(initialSelection(data));
  const anyFavorite = data.players.some((player) => player.favorite);
  if (!anyFavorite) editingPlayers = false;
  render(anyFavorite ? 'players-edit' : panelTitleId());
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

/** Opens or closes a Rating tab card and remembers it. Focus stays on its header, so no keyboard pops up. */
function toggleCard(name: CardName): void {
  const { cards } = store.get();
  const open = !cards[name];
  store.update({ cards: { ...cards, [name]: open } });
  if (name === 'manual') {
    confirmClear = false;
    manualUndo = null;
    // A form opened on a later day starts on that day.
    if (open && manualDraft.rating === '' && manualDraft.eventName === '') manualDraft = emptyDraft(today());
  }
  render(cardToggleId(name));
}

/** Adds a round and keeps the form open for the next one, with the date and event kept. */
function addManual(round: ManualRoundInput): void {
  if (selected === null) return;
  manualUndo = null;
  const { data, error, savedFavorite } = addManualRound(store.get(), selected, round);
  if (error) {
    manualFlash = { kind: error };
    render(MANUAL_ADD_ID);
    return;
  }
  store.update(data);
  manualFlash = { kind: 'added', rating: round.rating, savedFavorite };
  manualDraft = { ...manualDraft, rating: '' };
  render(MANUAL_RATING_ID);
}

/** Deletes at once, without asking: the status line offers Undo instead, which gets focus. */
function deleteManual(id: string): void {
  const rounds = findPlayer(store.get(), selected)?.manualRounds ?? [];
  const index = rounds.findIndex((round) => round.id === id);
  if (selected === null || index < 0) return;
  store.update(removeManualRound(store.get(), selected, id));
  manualUndo = { round: rounds[index]!, index };
  render(MANUAL_UNDO_ID);
}

/** Puts the deleted round back in its place, with focus on its Delete button. */
function undoDelete(): void {
  if (selected === null || manualUndo === null) return;
  const { round, index } = manualUndo;
  manualUndo = null;
  const data = store.get();
  const restored = restoreManualRound(data, selected, round, index);
  if (restored !== data) {
    store.update(restored);
    manualFlash = { kind: 'restored', rating: round.rating };
  }
  render(restored !== data ? `manual-delete-${round.id}` : MANUAL_TOGGLE_ID);
}

function askClearManual(ask: boolean): void {
  confirmClear = ask;
  // Focus goes to Cancel, the safe choice, and back to Delete all when cancelled.
  render(ask ? MANUAL_CLEAR_CANCEL_ID : MANUAL_CLEAR_ID);
}

function clearManual(): void {
  if (selected === null) return;
  store.update(clearManualRounds(store.get(), selected));
  confirmClear = false;
  manualUndo = null;
  manualFlash = { kind: 'cleared' };
  render(MANUAL_TOGGLE_ID);
}

/** Leaves an unofficial event out of the shown player's prediction, or counts it again; focus stays on its checkbox. */
function leaveOut(key: string, leftOut: boolean): void {
  if (selected === null) return;
  store.update(setLeftOut(store.get(), selected, key, leftOut));
  render();
}

/** Stores the Top 8 period with the settings; focus stays on the control that changed it. */
function setTop8Period(top8Period: TopPeriod): void {
  store.update({ top8Period });
  render();
}

/** Stores the chart period with the settings; focus stays on the control that changed it. */
function setChartPeriod(chartPeriod: ChartPeriod): void {
  store.update({ chartPeriod });
  render();
}

/** Stores the chart's x-axis with the settings; focus stays on the radio. */
function setChartAxis(chartAxis: ChartAxis): void {
  store.update({ chartAxis });
  render();
}

/** Stores whether the chart's table is open. The details element opened itself, so nothing is drawn again. */
function setChartTable(chartTable: boolean): void {
  if (chartTable !== store.get().chartTable) store.update({ chartTable });
}

/** Stores whether the Top 8 counts manual rounds; focus stays on the checkbox. */
function setTop8Own(top8Own: boolean): void {
  store.update({ top8Own });
  render();
}

/** Focus goes to the answer, so a phone keyboard closes and a screen reader reads it. */
function calculate(query: TargetQuery): void {
  targetQuery = query;
  render(TARGET_STATUS_ID);
}

/** The answer for the shown player's current rounds, from the memo when nothing it depends on changed. */
function targetAnswer(player: StoredPlayer, model: Model, date: PlainDate): TargetAnswer | null {
  if (targetQuery === null) return null;
  const key = JSON.stringify([player.pdgaNumber, player.import?.at, player.manualRounds, player.leftOut, targetQuery, date]);
  if (targetMemo?.key !== key) targetMemo = { key, answer: calculateTarget(model, targetQuery) };
  return targetMemo.answer;
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

/**
 * Shows a tab where it was last scrolled. The tab already shown, with
 * nothing over it, goes back to the top instead.
 */
function selectTab(next: Tab): void {
  const again = next === tab && overlay === null && !menuOpen;
  if (next !== tab) saveScroll();
  tab = next;
  overlay = null;
  menuOpen = false;
  unwindLayers();
  render(`tab-${next}`);
  window.scrollTo(0, again ? 0 : (scrollTops[next] ?? 0));
}

/** Stores an import with its players. An import for one player selects that player. */
function saveImport(parts: ImportParts, owner: number | null = null): Routed {
  const data = store.get();
  const routed = routeImport(data, parts, new Date().toISOString(), owner, selected);
  if (routed.data !== data) store.update({ players: routed.data.players });
  if (routed.owner !== null && routed.players.length > 0) setSelected(routed.owner);
  // Fresh data: "How to refresh" follows the data age again.
  refreshOpen = null;
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

/** The heading that gets focus when a view opens: in the top bar on phones, where the view's own is hidden. */
function overlayTitleId(view: OverlayView): string {
  // The full-screen chart covers the top bar and has its own heading.
  if (view === 'chart') return CHART_FULL_TITLE_ID;
  if (!isWide()) return TOPBAR_TITLE_ID;
  return view === 'setup' ? SETUP_ID : GUIDE_ID;
}

/** Shows the setup or How it works over the current tab, as a new history entry. */
function openOverlay(view: OverlayView): void {
  saveScroll();
  overlay = { view, opener: document.activeElement?.id || `tab-${tab}` };
  menuOpen = false;
  pushLayers();
}

function openSetup(): void {
  openOverlay('setup');
  render(overlayTitleId('setup'));
  window.scrollTo(0, 0);
}

/** Opens How it works, at a section when a card asks for one: focus on its heading scrolls it into view. */
function openGuide(section?: GuideSection): void {
  openOverlay('guide');
  if (section) {
    render(guideSectionId(section));
  } else {
    render(overlayTitleId('guide'));
    window.scrollTo(0, 0);
  }
}

/*
 * The full-screen chart. Where the browser allows it (Android), it also asks
 * for full screen and landscape, both only on a tap; on iPhone the view
 * follows the phone's rotation. A failure leaves the view as it is.
 */
type LockableOrientation = ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> };

function openChart(): void {
  openOverlay('chart');
  if (document.fullscreenEnabled && !document.fullscreenElement) {
    chartFullscreen = true;
    document.documentElement
      .requestFullscreen()
      .then(() => (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape'))
      .catch(() => {});
  }
  render(CHART_FULL_TITLE_ID);
}

/** Leaves the browser's full screen once the chart no longer shows. */
function leaveFullscreen(): void {
  if (!chartFullscreen) return;
  chartFullscreen = false;
  try {
    screen.orientation?.unlock();
  } catch {
    // Not supported: leaving full screen unlocks it anyway.
  }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function closeOverlay(): void {
  if (popLayer()) return;
  const opener = overlay?.opener;
  overlay = null;
  render(opener ?? `tab-${tab}`);
}

/** Shows the result of an import on the Rating tab, with focus on the message. */
function showBanner(next: Banner): void {
  saveScroll();
  banner = next;
  tab = 'rating';
  overlay = null;
  menuOpen = false;
  unwindLayers();
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
    // Whatever the import brings, the hand-off tells which bookmarklet this browser has.
    store.update({ bookmarklet: envelope.bookmarklet });
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
  const data = store.get();
  if (overlay?.view === 'guide') return guideView({ onBack: closeOverlay });
  if (overlay?.view === 'setup') {
    return setupView({
      bookmarklet,
      stored: data.bookmarklet,
      pdgaNumber: data.me,
      platform: (setupPlatform ??= guessPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0)),
      onPlatform: (platform) => {
        setupPlatform = platform;
        render(platformId(platform));
      },
      onBack: closeOverlay,
    });
  }
  if (tab === 'settings') {
    return settingsView({
      language: data.language,
      preferred: preferredLanguages(),
      theme: data.theme,
      dateOrder: data.dateOrder,
      today: today(),
      persistent: store.persistent,
      bookmarklet: data.bookmarklet,
      onLanguage: setLanguageOverride,
      onTheme: setTheme,
      onDateOrder: setDateOrderOverride,
      openWith: data.openWith,
      onOpenWith: setOpenWith,
      onOpenSetup: openSetup,
      onOpenGuide: () => openGuide(),
    });
  }
  const player = findPlayer(data, selected);
  if (manualPlayer !== selected) {
    manualPlayer = selected;
    refreshOpen = null;
    manualDraft = emptyDraft(today());
    confirmClear = false;
    manualUndo = null;
    targetDraft = null;
    targetQuery = null;
  }
  if (player?.import) {
    const now = new Date();
    const model = modelOf(player, now);
    const dates = targetDates(model, today(now));
    targetDraft ??= emptyTargetDraft(model.prediction.rating, dates.min);
    return ratingView({
      model,
      cards: data.cards,
      onToggleCard: toggleCard,
      onGuide: openGuide,
      onLeaveOut: leaveOut,
      refresh: {
        open: refreshOpen ?? model.stale,
        onToggle: (open) => {
          refreshOpen = open;
        },
      },
      target: {
        draft: targetDraft,
        dates,
        answer: targetAnswer(player, model, today(now)),
        onDraft: (field, value) => {
          targetDraft = { ...targetDraft!, [field]: value };
        },
        onCalculate: calculate,
      },
      chart: chartProps(player, model, now),
      top8: {
        top: topEight(model, data.top8Period, today(now), data.top8Own),
        today: today(now),
        onPeriod: setTop8Period,
        onOwn: setTop8Own,
      },
      manual: {
        rounds: player.manualRounds,
        draft: manualDraft,
        flash: manualFlash,
        confirmClear,
        undo: manualUndo && { rating: manualUndo.round.rating, date: manualUndo.round.date },
        player: playerLabel(player),
        today: today(now),
        onDraft: (field, value) => {
          manualDraft = { ...manualDraft, [field]: value };
        },
        onAdd: addManual,
        onDelete: deleteManual,
        onUndo: undoDelete,
        onAskClear: askClearManual,
        onClear: clearManual,
      },
      favorite: player.favorite,
      now,
      onAddFavorite: (pdgaNumber) => addToFavorites(pdgaNumber),
    });
  }
  return startView({
    pdgaNumber: data.me,
    player: player ? { pdgaNumber: player.pdgaNumber, label: playerLabel(player) } : null,
    flash,
    tab: startTab,
    onTab: (next) => {
      startTab = next;
      flash = null;
      render(startTabId(next));
    },
    onSavePdgaNumber: savePdgaNumber,
    onSearch: searchPdga,
    onOpenSetup: openSetup,
  });
}

/** The model of a player with an import, for the Rating view and the full-screen chart. */
function modelOf(player: StoredPlayer, now: Date): Model {
  return buildModel(player.import!, player.pdgaNumber, now, manualToRounds(player.manualRounds), player.leftOut);
}

function chartProps(player: StoredPlayer, model: Model, now: Date): ChartProps {
  return {
    chart: chartData(model, store.get().chartPeriod, today(now)),
    pdgaNumber: player.pdgaNumber,
    today: today(now),
    onPeriod: setChartPeriod,
    axis: store.get().chartAxis,
    onAxis: setChartAxis,
    table: { open: store.get().chartTable, onToggle: setChartTable },
    onFullScreen: openChart,
  };
}

/** The full-screen chart for the shown player, or null when the player has no import to chart. */
function chartFull(): HTMLElement | null {
  const player = findPlayer(store.get(), selected);
  if (!player?.import) return null;
  const now = new Date();
  return chartFullView({
    ...chartProps(player, modelOf(player, now), now),
    onClose: closeOverlay,
    rotateHint: !document.fullscreenEnabled,
  });
}

/**
 * The player the Rating tab shows, also before the player's first import,
 * which the phone top bar names; null while the players panel or another
 * view shows.
 */
function ratingPlayer(): { name: string; pdgaNumber: number } | null {
  const player = findPlayer(store.get(), selected);
  if (menuOpen || overlay !== null || tab !== 'rating' || !player) return null;
  return { name: playerName(player), pdgaNumber: player.pdgaNumber };
}

/**
 * The heading the phone top bar shows when it names no player: the players
 * panel's, another view's, or the app's name on the start view.
 */
function barTitle(): string {
  if (menuOpen) return t('players.switch');
  if (overlay?.view === 'guide') return t('guide.title');
  if (overlay?.view === 'setup') return t('setup.title');
  return tab === 'settings' ? t('settings.title') : t('app.name');
}

/** Touch screens, where focusing a select or a date field opens its picker (iOS opens it again after a choice). */
const TOUCH_QUERY = '(pointer: coarse)';

function opensPicker(element: HTMLElement): boolean {
  return element instanceof HTMLSelectElement || (element instanceof HTMLInputElement && element.type === 'date');
}

/**
 * Puts focus on the element with this id. On a touch screen a select or date
 * field gets a stand-in near it that opens no picker, so a screen reader stays
 * there: its card's header, the full-screen chart's heading, or the view's.
 */
function restoreFocus(focusId: string): void {
  const target = document.getElementById(focusId);
  if (!target) return;
  if (!opensPicker(target) || !(window.matchMedia?.(TOUCH_QUERY).matches ?? false)) {
    target.focus();
    return;
  }
  const standIn =
    target.closest('.card')?.querySelector<HTMLElement>('.card-toggle') ??
    target.closest('.chart-full')?.querySelector<HTMLElement>(`#${CHART_FULL_TITLE_ID}`) ??
    document.getElementById(isWide() ? 'view-title' : TOPBAR_TITLE_ID);
  standIn?.focus();
}

/** Rebuilds the page, then puts focus back on the element with the same id. */
function render(focusId = document.activeElement?.id): void {
  const data = store.get();
  document.title = pageTitle();
  // The full-screen chart is all the page shows; without a player to chart, the tab shows instead.
  const full = overlay?.view === 'chart' ? chartFull() : null;
  if (overlay?.view === 'chart' && !full) overlay = null;
  if (!full) leaveFullscreen();
  if (full) root.replaceChildren(full);
  else root.replaceChildren(
    el(
      'div',
      { class: menuOpen ? 'shell menu-open' : 'shell' },
      topBar({ open: menuOpen, onToggle: toggleMenu, player: ratingPlayer(), title: barTitle() }),
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
        onSearch: searchPdga,
        onSelect: selectPlayer,
        onClose: closeMenu,
        onToggleEdit: toggleEditPlayers,
        onSetMe: setMeFromPanel,
        onAskRemove: askRemove,
        onRemove: removeFromPanel,
        onSave: (pdgaNumber) => addToFavorites(pdgaNumber, playerButtonId(pdgaNumber)),
        onAdd: addFromPanel,
      }),
      el(
        'main',
        { class: 'main' },
        updateReady && updateNotice(applyUpdate),
        overlay === null && banner && bannerView(banner, closeBanner, openSetup),
        currentView(),
      ),
    ),
    tabBar(),
  );
  flash = null;
  addFlash = null;
  manualFlash = null;
  if (focusId) restoreFocus(focusId);
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
  applyDateOrder();
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

// The back gesture, or the app going back over a layer it closed.
window.addEventListener('popstate', () => showLayers(readLayers(history.state)));

/*
 * Android's back (or Escape on a tablet) first leaves the browser's full
 * screen. The chart closes with it, so one back is enough, unless that back
 * also went back over the chart's entry: the check waits a moment for its
 * popstate, so the app never goes back twice.
 */
const FULLSCREEN_BACK_MS = 150;
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement || !chartFullscreen) return;
  chartFullscreen = false;
  setTimeout(() => {
    if (overlay?.view === 'chart' && readLayers(history.state).overlay === 'chart') closeOverlay();
  }, FULLSCREEN_BACK_MS);
});

// A fresh load on an entry with a layer, as back from pdga.com without the page kept in memory, shows that layer.
const restored = readLayers(history.state);
menuOpen = restored.menu;
overlay = restored.overlay && { view: restored.overlay, opener: `tab-${tab}` };

const payload = takeFragment();
applyTheme();
applyLanguage();
applyDateOrder();
render();
if (payload !== null) void receiveHandoff(payload);
registerServiceWorker(() => {
  updateReady = true;
  render();
});
