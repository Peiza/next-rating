import { t } from '../../i18n';
import { el } from '../dom';
import { deviceLocale, formatAge } from '../format';
import { playerName, sortFavorites } from '../players';
import type { PlayerOrder, StoredPlayer } from '../storage';
import { detailsUrl, pdgaNumberForm, playerSearchUrl, type PdgaFlash } from './pdga';
import { segmented, type Segment } from './segmented';

/*
 * The players panel: favorites, the unsaved player, a form to add one by
 * number and a search by name on pdga.com.
 * On wide screens it is a sidebar next to the current view; on phones the
 * menu button in the top bar shows it in place of the view.
 */

export const PANEL_ID = 'favorites';
export const PANEL_TITLE_ID = 'favorites-title';
export const MENU_BUTTON_ID = 'players-menu';
export const ADD_INPUT_ID = 'player-add';
export const SEARCH_INPUT_ID = 'player-search';

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

/** "Name #12345", or "#12345" before the first import. */
export function playerLabel(player: StoredPlayer): string {
  const name = playerName(player);
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
  onOrder: (order: PlayerOrder) => void;
  /** Opens pdga.com's player search. */
  onSearch: (url: string) => void;
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

/** Selected is marked with a check mark and aria-current, never by colour alone. */
function selectButton(player: StoredPlayer, props: PlayersProps): HTMLElement {
  const selected = player.pdgaNumber === props.selected;
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
      { class: 'player-name' },
      selected && el('span', { class: 'player-check wide-only', 'aria-hidden': 'true' }, '✓ '),
      playerLabel(player),
      player.pdgaNumber === props.me && el('span', { class: 'badge' }, t('players.me')),
      selected && el('span', { class: 'badge menu-only' }, t('players.now')),
    ),
    el('span', { class: 'player-meta' }, imported(player, props.now)),
  );
}

function detailsLink(player: StoredPlayer): HTMLElement {
  return el(
    'a',
    {
      class: 'player-link',
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

/** Opens pdga.com's player search for a name; the user picks the player there and runs the bookmarklet. */
function searchForm(onSearch: (url: string) => void): HTMLFormElement {
  const statusId = `${SEARCH_INPUT_ID}-status`;
  const input = el('input', {
    id: SEARCH_INPUT_ID,
    class: 'input',
    type: 'search',
    autocomplete: 'off',
    enterkeyhint: 'search',
    maxlength: 100,
    'aria-describedby': `${SEARCH_INPUT_ID}-hint ${statusId}`,
  });
  const status = el('p', { id: statusId, class: 'status', role: 'status' });
  const submit = (event: Event) => {
    event.preventDefault();
    const url = playerSearchUrl(input.value);
    if (url === null) {
      input.setAttribute('aria-invalid', 'true');
      status.classList.add('error');
      status.textContent = t('players.searchEmpty');
      input.focus();
      return;
    }
    onSearch(url);
  };
  return el(
    'form',
    { class: 'field', novalidate: true, onsubmit: submit },
    el('label', { for: SEARCH_INPUT_ID, class: 'label' }, t('players.searchLabel')),
    el('p', { id: `${SEARCH_INPUT_ID}-hint`, class: 'hint' }, t('players.searchHint')),
    el(
      'div',
      { class: 'row' },
      input,
      el('button', { id: `${SEARCH_INPUT_ID}-submit`, class: 'button', type: 'submit' }, t('players.search')),
    ),
    status,
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
    // On phones the panel replaces the view to switch player, and the top bar's button closes it.
    el(
      'h2',
      { id: PANEL_TITLE_ID, class: 'panel-title', tabindex: -1 },
      el('span', { class: 'menu-only' }, t('players.switch')),
      el('span', { class: 'wide-only' }, t('players.title')),
    ),
    sortable && segmented('players.order', 'player-order', ORDER_OPTIONS, props.order, props.onOrder),
    favorites.length > 0
      ? el('ul', { class: 'player-list' }, ...favorites.map((player) => favoriteItem(player, props)))
      : el('p', { class: 'hint' }, t('players.none')),
    favorites.length > 0 &&
      el(
        'button',
        {
          id: 'players-edit',
          class: 'button button-small',
          type: 'button',
          'aria-pressed': props.editing ? 'true' : 'false',
          onclick: props.onToggleEdit,
        },
        t(props.editing ? 'players.editDone' : 'players.edit'),
      ),
    unsaved.length > 0 && el('h3', {}, t('players.unsaved')),
    unsaved.length > 0 && el('ul', { class: 'player-list' }, ...unsaved.map((player) => unsavedItem(player, props))),
    pdgaNumberForm(null, props.flash, (pdgaNumber) => pdgaNumber !== null && props.onAdd(pdgaNumber), {
      id: ADD_INPUT_ID,
      label: 'players.addLabel',
      submit: 'players.add',
      allowEmpty: false,
    }),
    searchForm(props.onSearch),
  );
}

export const TOPBAR_TITLE_ID = 'topbar-title';

export interface TopBarProps {
  open: boolean;
  onToggle: () => void;
  /** The shown player, named in the bar while the Rating tab shows them; other views have their own heading. */
  player?: { name: string | null; pdgaNumber: number } | null;
}

/**
 * The phone top bar: the shown player's name as the heading, with the PDGA
 * number on a smaller line under it, and the Players button at the top
 * right, which reads Close while the panel is open. Hidden on wide screens,
 * where the Rating view's own heading names the player.
 */
export function topBar({ open, onToggle, player }: TopBarProps): HTMLElement {
  const number = player && t('rating.playerNumber', { number: player.pdgaNumber });
  return el(
    'header',
    { class: 'topbar' },
    player &&
      el(
        'h1',
        { id: TOPBAR_TITLE_ID, class: 'topbar-title' },
        ...(player.name ? [player.name, ' ', el('span', { class: 'topbar-number' }, number)] : [number]),
      ),
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
