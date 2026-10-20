import { t } from '../../i18n';
import { el } from '../dom';
import { formatAge } from '../format';
import { playerName } from '../players';
import type { StoredPlayer } from '../storage';
import { detailsUrl, pdgaNumberForm, type PdgaFlash } from './pdga';

/*
 * The players panel: favorites, the unsaved player and a form to add one.
 * On wide screens it is a sidebar next to the current view; on phones the
 * menu button in the top bar shows it in place of the view.
 */

export const PANEL_ID = 'favorites';
export const PANEL_TITLE_ID = 'favorites-title';
export const MENU_BUTTON_ID = 'players-menu';
export const ADD_INPUT_ID = 'player-add';

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
  now: Date;
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
      selected && el('span', { class: 'player-check', 'aria-hidden': 'true' }, '✓ '),
      playerLabel(player),
      player.pdgaNumber === props.me && el('span', { class: 'badge' }, t('players.me')),
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

export function playersPanel(props: PlayersProps): HTMLElement {
  const favorites = props.players.filter((player) => player.favorite);
  const unsaved = props.players.filter((player) => !player.favorite);
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
    el(
      'div',
      { class: 'panel-head' },
      el('h2', { id: PANEL_TITLE_ID, tabindex: -1 }, t('players.title')),
      el(
        'button',
        { id: 'players-close', class: 'button button-small menu-only', type: 'button', onclick: props.onClose },
        t('players.close'),
      ),
    ),
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
  );
}

/** The phone top bar with the menu button. The view's heading names the player. Hidden on wide screens. */
export function topBar(open: boolean, onToggle: () => void): HTMLElement {
  return el(
    'header',
    { class: 'topbar' },
    el(
      'button',
      {
        id: MENU_BUTTON_ID,
        class: 'button button-small',
        type: 'button',
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': PANEL_ID,
        onclick: onToggle,
      },
      el('span', { 'aria-hidden': 'true' }, '☰ '),
      t('players.title'),
    ),
  );
}
