import { t, type MessageKey } from '../../i18n';
import { readSearch, SEARCH_LIMIT, type SearchPlayer, type SearchQuery } from '../api';
import { el } from '../dom';
import { formatRating } from '../format';
import { playerSearchUrl, playerUrl } from './pdga';

/*
 * The player search in the app: a name or PDGA number goes to the app's own
 * Worker, which asks PDGA's official API, and the players it finds show as
 * a list to pick from. The results live in memory only while shown. When
 * the search cannot be done, a link opens pdga.com's player search instead.
 */

/** Where a search is: what was typed and what the last search found. */
export type SearchStatus =
  | { kind: 'idle' }
  | { kind: 'invalid' }
  | { kind: 'loading' }
  | { kind: 'ok'; players: SearchPlayer[] }
  | { kind: 'unavailable'; query: SearchQuery };

export interface SearchState {
  text: string;
  status: SearchStatus;
}

export interface PlayerSearchProps {
  /** The input's id; the hint, button, status and results take ids derived from it. */
  id: string;
  label: MessageKey;
  hint: MessageKey;
  state: SearchState;
  onText: (text: string) => void;
  /** Runs a search; null when the text is empty or not a name or number. */
  onSearch: (query: SearchQuery | null) => void;
  onPick: (player: SearchPlayer) => void;
  /** Opens pdga.com in this tab: its player search, or the player's profile for a number. */
  onPdga: (url: string) => void;
}

/** What a view passes to the search: everything but the ids and texts, which each view picks. */
export type InAppSearch = Omit<PlayerSearchProps, 'id' | 'label' | 'hint'>;

export function resultButtonId(formId: string, pdgaNumber: number): string {
  return `${formId}-pick-${pdgaNumber}`;
}

/** pdga.com's page for a search that could not be done here. */
export function pdgaFallbackUrl(query: SearchQuery): string | null {
  if ('pdgaNumber' in query) return playerUrl(query.pdgaNumber);
  return playerSearchUrl([query.firstName, query.lastName].filter(Boolean).join(' '));
}

function meta(player: SearchPlayer): string {
  const number = t('rating.playerNumber', { number: player.pdgaNumber });
  return player.location ? t('search.meta', { number, location: player.location }) : number;
}

/** One player found: the name with the number and location under it, and the rating at the right. A button, not a link. */
function resultItem(player: SearchPlayer, { id, onPick }: PlayerSearchProps): HTMLElement {
  const name = player.name ?? t('rating.playerNumber', { number: player.pdgaNumber });
  return el(
    'li',
    { class: 'player-item' },
    el(
      'button',
      { id: resultButtonId(id, player.pdgaNumber), class: 'player-select', type: 'button', onclick: () => onPick(player) },
      el('span', { class: 'player-text' }, el('span', { class: 'player-name' }, name), el('span', { class: 'player-meta' }, meta(player))),
      player.rating !== null
        ? el(
            'span',
            { class: 'player-prediction' },
            el('span', { class: 'visually-hidden' }, t('search.rating', { rating: formatRating(player.rating) })),
            el('span', { class: 'player-rating', 'aria-hidden': 'true' }, formatRating(player.rating)),
          )
        : el('span', { class: 'player-meta' }, t('search.noRating')),
    ),
  );
}

function statusText(status: SearchStatus): string {
  switch (status.kind) {
    case 'invalid':
      return t('search.invalid');
    case 'loading':
      return t('search.searching');
    case 'unavailable':
      return t('search.unavailable');
    case 'ok':
      if (status.players.length === 0) return t('search.none');
      return status.players.length >= SEARCH_LIMIT
        ? t('search.first', { count: status.players.length })
        : t('search.found', { count: status.players.length });
    default:
      return '';
  }
}

/** A field for a name or PDGA number, the status of the last search and the players it found. */
export function playerSearchForm(props: PlayerSearchProps): HTMLElement {
  const { id, label, hint, state, onText, onSearch, onPdga } = props;
  const statusId = `${id}-status`;
  const { status } = state;
  const error = status.kind === 'invalid' || status.kind === 'unavailable';
  const input = el('input', {
    id,
    class: 'input',
    type: 'search',
    autocomplete: 'off',
    autocapitalize: 'words',
    enterkeyhint: 'search',
    maxlength: 100,
    value: state.text,
    'aria-invalid': status.kind === 'invalid' ? 'true' : false,
    'aria-describedby': `${id}-hint ${statusId}`,
    oninput: (event) => onText((event.currentTarget as HTMLInputElement).value),
  });
  const submit = (event: Event) => {
    event.preventDefault();
    onText(input.value);
    onSearch(readSearch(input.value));
  };
  const fallback = status.kind === 'unavailable' ? pdgaFallbackUrl(status.query) : null;
  return el(
    'div',
    { class: 'player-search' },
    el(
      'form',
      { class: 'field', novalidate: true, onsubmit: submit },
      el('label', { for: id, class: 'label' }, t(label)),
      el('p', { id: `${id}-hint`, class: 'hint' }, t(hint)),
      el(
        'div',
        { class: 'row' },
        input,
        el('button', { id: `${id}-submit`, class: 'button', type: 'submit' }, t('players.search')),
      ),
      el('p', { id: statusId, class: error ? 'status error' : 'status', role: 'status' }, statusText(status)),
    ),
    fallback &&
      el(
        'button',
        { id: `${id}-pdga`, class: 'button button-small', type: 'button', onclick: () => onPdga(fallback) },
        t('search.onPdga'),
      ),
    status.kind === 'ok' &&
      status.players.length > 0 &&
      el(
        'ul',
        { id: `${id}-results`, class: 'player-list search-results', 'aria-label': t('search.results') },
        ...status.players.map((player) => resultItem(player, props)),
      ),
  );
}
