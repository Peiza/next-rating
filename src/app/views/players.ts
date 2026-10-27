import { t } from '../../i18n';
import { el } from '../dom';
import { deviceLocale, formatAge, formatChange, formatRating } from '../format';
import type { ListPrediction } from '../model';
import { playerName, sortFavorites } from '../players';
import type { PlayerOrder, StoredPlayer } from '../storage';
import { direction, slopeArrow } from './change';
import { detailsUrl, nameSearchForm, pdgaNumberForm, playerLink, type PdgaFlash } from './pdga';
import { playerSearchForm, type InAppSearch } from './search';
import { segmented, type Segment } from './segmented';
import { shareSection, type ShareStatus } from './share';

/*
 * The players panel: favorites, the unsaved player, a form to add one by
 * number and a search by name, in the app when it can or on pdga.com.
 * On wide screens it is a sidebar next to the current view; on phones the
 * menu button in the top bar shows it in place of the view.
 */

export const PANEL_ID = 'favorites';
export const PANEL_TITLE_ID = 'favorites-title';
export const MENU_BUTTON_ID = 'players-menu';
export const ADD_INPUT_ID = 'player-add';
export const SEARCH_INPUT_ID = 'player-search';
export const COMPARE_OPEN_ID = 'compare-open';

const ORDER_OPTIONS: Segment<PlayerOrder>[] = [
  { value: 'name', id: 'order-name', label: 'players.orderName' },
  { value: 'updated', id: 'order-updated', label: 'players.orderUpdated' },
];

/** The id of the radio for an order, so focus can return to it. */
export function orderId(order: PlayerOrder): string {
  return ORDER_OPTIONS.find((option) => option.value === order)!.id;
}

/** Matches the breakpoint in styles.css where the panel becomes a sidebar. */
export const WIDE_QUERY = '(min-width: 64rem)';

export function playerButtonId(pdgaNumber: number): string {
  return `player-${pdgaNumber}`;
}

/**
 * "Name #12345", or "#12345" before the first import. `lookedUp` is the
 * name the official rating lookup knows, used until there is an import.
 */
export function playerLabel(player: StoredPlayer, lookedUp?: string | null): string {
  const name = playerName(player) || lookedUp;
  return name
    ? t('rating.player', { name, number: player.pdgaNumber })
    : t('rating.playerNumber', { number: player.pdgaNumber });
}

export interface PlayersProps {
  players: readonly StoredPlayer[];
  me: number | null;
  selected: number | null;
  /** Shows "This is me" and Remove on each favorite. */
  editing: boolean;
  /** The favorite whose Remove waits for confirmation. */
  confirmRemove: number | null;
  /** What the add form says after a save. */
  flash: PdgaFlash;
  order: PlayerOrder;
  now: Date;
  /** Each player's prediction, by PDGA number; a player without one is left out. */
  predictions: ReadonlyMap<number, ListPrediction>;
  /** Names the official rating lookup knows for now, for players without an import. */
  names?: ReadonlyMap<number, string>;
  /** What Share list did last. */
  share?: ShareStatus;
  onShare?: () => void;
  /** Opens Compare players; only with at least two imported players. */
  onCompare?: (() => void) | undefined;
  onOrder: (order: PlayerOrder) => void;
  /** Opens pdga.com's player search. */
  onSearch: (url: string) => void;
  /** The search in the app, when the official lookup is on and the device is online; null searches on pdga.com. */
  search?: InAppSearch | null;
  onSelect: (pdgaNumber: number) => void;
  onClose: () => void;
  onToggleEdit: () => void;
  onSetMe: (pdgaNumber: number) => void;
  onAskRemove: (pdgaNumber: number | null) => void;
  onRemove: (pdgaNumber: number) => void;
  onSave: (pdgaNumber: number) => void;
  onAdd: (pdgaNumber: number) => void;
}

function imported(player: StoredPlayer, now: Date): string {
  return player.import ? t('players.imported', { age: formatAge(player.import.at, now) }) : t('players.notImported');
}

/**
 * The predicted rating with the change under it, as on the Rating tab. The
 * figures are hidden from screen readers, which read a sentence instead.
 */
function predictionColumn({ rating, change }: ListPrediction): HTMLElement {
  const [dir] = direction(change ?? 0);
  const [shown, signed] = [formatRating(rating), change !== null && formatChange(change)];
  return el(
    'span',
    { class: 'player-prediction' },
    el(
      'span',
      { class: 'visually-hidden' },
      signed ? t('players.predictionChange', { rating: shown, change: signed }) : t('players.prediction', { rating: shown }),
    ),
    el('span', { class: 'player-rating', 'aria-hidden': 'true' }, shown),
    signed &&
      el(
        'span',
        { class: `player-change change-${dir}`, 'aria-hidden': 'true' },
        slopeArrow(change ?? 0),
        signed,
      ),
  );
}

/** Selected is marked with a check mark and aria-current, never by colour alone. */
function selectButton(player: StoredPlayer, props: PlayersProps): HTMLElement {
  const selected = player.pdgaNumber === props.selected;
  const prediction = props.predictions.get(player.pdgaNumber);
  return el(
    'button',
    {
      id: playerButtonId(player.pdgaNumber),
      class: 'player-select',
      type: 'button',
      'aria-current': selected ? 'true' : false,
      onclick: () => props.onSelect(player.pdgaNumber),
    },
    el(
      'span',
      { class: 'player-text' },
      el(
        'span',
        { class: 'player-name' },
        selected && el('span', { class: 'player-check wide-only', 'aria-hidden': 'true' }, '✓ '),
        playerLabel(player, props.names?.get(player.pdgaNumber)),
        player.pdgaNumber === props.me && el('span', { class: 'badge' }, t('players.me')),
        selected && el('span', { class: 'badge menu-only' }, t('players.now')),
      ),
      el('span', { class: 'player-meta' }, imported(player, props.now)),
    ),
    prediction && predictionColumn(prediction),
  );
}

function detailsLink(player: StoredPlayer): HTMLElement {
  return el(
    'a',
    {
      class: 'player-details-link',
      href: detailsUrl(player.pdgaNumber),
      rel: 'noreferrer',
      'aria-label': t('players.detailsFor', { player: playerLabel(player) }),
    },
    t('players.details'),
  );
}

/** Removing deletes the player's data, so it asks first, in place rather than with a dialog. */
function editRow(player: StoredPlayer, props: PlayersProps): HTMLElement {
  const { pdgaNumber } = player;
  if (props.confirmRemove === pdgaNumber) {
    return el(
      'div',
      { class: 'confirm', role: 'group', 'aria-labelledby': `remove-question-${pdgaNumber}` },
      el('p', { id: `remove-question-${pdgaNumber}` }, t('players.removeQuestion', { player: playerLabel(player) })),
      el(
        'div',
        { class: 'row' },
        el(
          'button',
          { id: `remove-cancel-${pdgaNumber}`, class: 'button', type: 'button', onclick: () => props.onAskRemove(null) },
          t('players.cancel'),
        ),
        el(
          'button',
          { id: `remove-confirm-${pdgaNumber}`, class: 'button button-danger grow', type: 'button', onclick: () => props.onRemove(pdgaNumber) },
          t('players.removeConfirm'),
        ),
      ),
    );
  }
  return el(
    'div',
    { class: 'row' },
    pdgaNumber !== props.me &&
      el(
        'button',
        { id: `set-me-${pdgaNumber}`, class: 'button button-small', type: 'button', onclick: () => props.onSetMe(pdgaNumber) },
        t('players.setMe'),
      ),
    el(
      'button',
      {
        id: `remove-${pdgaNumber}`,
        class: 'button button-small',
        type: 'button',
        'aria-label': t('players.removeLabel', { player: playerLabel(player) }),
        onclick: () => props.onAskRemove(pdgaNumber),
      },
      t('players.remove'),
    ),
  );
}

function favoriteItem(player: StoredPlayer, props: PlayersProps): HTMLElement {
  const selected = player.pdgaNumber === props.selected;
  return el(
    'li',
    { class: selected ? 'player-item player-selected' : 'player-item' },
    selectButton(player, props),
    detailsLink(player),
    props.editing && editRow(player, props),
  );
}

function unsavedItem(player: StoredPlayer, props: PlayersProps): HTMLElement {
  return el(
    'li',
    { class: player.pdgaNumber === props.selected ? 'player-item player-selected' : 'player-item' },
    selectButton(player, props),
    detailsLink(player),
    el(
      'button',
      { id: `save-${player.pdgaNumber}`, class: 'button button-small', type: 'button', onclick: () => props.onSave(player.pdgaNumber) },
      t('players.save'),
    ),
  );
}

function editButton(props: PlayersProps): HTMLElement {
  return el(
    'button',
    {
      id: 'players-edit',
      class: 'button button-small players-edit',
      type: 'button',
      'aria-pressed': props.editing ? 'true' : 'false',
      onclick: props.onToggleEdit,
    },
    t(props.editing ? 'players.editDone' : 'players.edit'),
  );
}

export function playersPanel(props: PlayersProps): HTMLElement {
  const favorites = sortFavorites(
    props.players.filter((player) => player.favorite),
    props.me,
    props.order,
    deviceLocale(),
  );
  const unsaved = props.players.filter((player) => !player.favorite);
  // Ordering only matters with at least two players after "me".
  const sortable = favorites.filter((player) => player.pdgaNumber !== props.me).length >= 2;
  return el(
    'nav',
    {
      id: PANEL_ID,
      class: 'favorites',
      'aria-labelledby': PANEL_TITLE_ID,
      onkeydown: (event) => {
        if ((event as KeyboardEvent).key === 'Escape') props.onClose();
      },
    },
    // On phones the panel replaces the view to switch player, and the top bar shows its heading next to Close.
    el('h2', { id: PANEL_TITLE_ID, class: 'panel-title wide-only', tabindex: -1 }, t('players.title')),
    sortable && segmented('players.order', 'player-order', ORDER_OPTIONS, props.order, props.onOrder),
    favorites.length > 0
      ? el('ul', { class: 'player-list' }, ...favorites.map((player) => favoriteItem(player, props)))
      : el('p', { class: 'hint' }, t('players.none')),
    favorites.length > 0 &&
      (props.onShare ? shareSection(props.share ?? null, props.onShare, editButton(props)) : editButton(props)),
    props.onCompare &&
      el(
        'button',
        { id: COMPARE_OPEN_ID, class: 'button button-block', type: 'button', onclick: props.onCompare },
        t('compare.open'),
      ),
    unsaved.length > 0 && el('h3', { class: 'players-unsaved' }, t('players.unsaved')),
    unsaved.length > 0 && el('ul', { class: 'player-list' }, ...unsaved.map((player) => unsavedItem(player, props))),
    pdgaNumberForm(null, props.flash, (pdgaNumber) => pdgaNumber !== null && props.onAdd(pdgaNumber), {
      id: ADD_INPUT_ID,
      label: 'players.addLabel',
      submit: 'players.add',
      allowEmpty: false,
    }),
    props.search
      ? playerSearchForm({ ...props.search, id: SEARCH_INPUT_ID, label: 'players.searchLabelApi', hint: 'players.searchHintApi' })
      : // The user picks the player there and runs the bookmarklet.
        nameSearchForm(props.onSearch, { id: SEARCH_INPUT_ID, label: 'players.searchLabel', hint: 'players.searchHint' }),
  );
}

export const TOPBAR_TITLE_ID = 'topbar-title';

export interface TopBarProps {
  open: boolean;
  onToggle: () => void;
  /** The shown player, named in the bar while the Rating tab shows them. */
  player?: { name: string | null; pdgaNumber: number } | null;
  /**
   * The heading of the players panel or another view, such as Settings or the
   * start view, shown in the bar instead of in the view.
   */
  title?: string | null;
}

/**
 * The phone top bar: the view's heading at the left, which on the Rating tab
 * is the shown player's name with the PDGA number on a smaller line under
 * it, and the Players button at the top right, which reads Close while the
 * panel is open and the bar shows the panel's heading. Hidden on wide
 * screens, where each view shows its own heading. The heading takes focus
 * when a view or the panel opens on a phone.
 */
export function topBar({ open, onToggle, player, title }: TopBarProps): HTMLElement {
  const number = player && t('rating.playerNumber', { number: player.pdgaNumber });
  return el(
    'header',
    { class: 'topbar' },
    player
      ? el(
          'h1',
          { id: TOPBAR_TITLE_ID, class: 'topbar-title' },
          // The name, or the number without one, links to the player's profile on pdga.com.
          ...(player.name
            ? [playerLink(player.pdgaNumber, player.name), ' ', el('span', { class: 'topbar-number' }, number)]
            : [playerLink(player.pdgaNumber, number!)]),
        )
      : title && el('h1', { id: TOPBAR_TITLE_ID, class: 'topbar-title', tabindex: -1 }, title),
    el(
      'button',
      {
        id: MENU_BUTTON_ID,
        class: 'button button-small topbar-button',
        type: 'button',
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': PANEL_ID,
        onclick: onToggle,
      },
      !open && el('span', { 'aria-hidden': 'true' }, '☰ '),
      t(open ? 'players.close' : 'players.title'),
    ),
  );
}
