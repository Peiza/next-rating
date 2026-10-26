import { t, type MessageKey } from '../../i18n';
import { parseInteger, RANGES } from '../../parsers/values';
import { el, textWithNodes } from '../dom';
import { MAX_FAVORITES } from '../storage';

/** What the PDGA number form says after a save. */
export type PdgaFlash = 'saved' | 'removed' | 'full' | null;

const FLASH: Record<NonNullable<PdgaFlash>, MessageKey> = {
  saved: 'pdga.saved',
  removed: 'pdga.removed',
  full: 'favorites.full',
};

export const PDGA_INPUT_ID = 'pdga-number';
export const PDGA_SAVE_ID = `${PDGA_INPUT_ID}-save`;

export const PDGA_URL = 'https://www.pdga.com/';

/** The player's profile on pdga.com, which the player's name links to. */
export function playerUrl(pdgaNumber: number): string {
  return `https://www.pdga.com/player/${pdgaNumber}`;
}

/** The player's name, or the number without one, linked to the player's pdga.com profile. */
export function playerLink(pdgaNumber: number, text: string): HTMLElement {
  return el('a', { class: 'player-link', href: playerUrl(pdgaNumber), rel: 'noreferrer' }, text);
}

/**
 * The line at the bottom of each view: the attribution PDGA asks for, linked
 * to pdga.com and always in English, then that the app is unofficial and not
 * endorsed by the PDGA.
 */
export function pdgaNotice(className = 'notice'): HTMLElement {
  const link = el('a', { href: PDGA_URL, rel: 'noreferrer' }, t('app.attributionLink'));
  return el('p', { class: className }, ...textWithNodes(t('app.attribution'), { link }), ' ', t('app.unofficial'));
}

export function detailsUrl(pdgaNumber: number): string {
  return `https://www.pdga.com/player/${pdgaNumber}/details`;
}

/** pdga.com's ratings history: the official rating after each update, as a chart and a table. */
export function historyUrl(pdgaNumber: number): string {
  return `https://www.pdga.com/player/${pdgaNumber}/history`;
}

export function eventUrl(eventId: number): string {
  return `https://www.pdga.com/tour/event/${eventId}`;
}

/**
 * pdga.com's player search for a typed name, or null without one. One word
 * is searched as the last name; with more, the first word is the first name
 * and the rest the last name. pdga.com matches parts of names.
 */
export function playerSearchUrl(text: string): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const params = new URLSearchParams();
  if (words.length > 1) params.set('FirstName', words.shift()!);
  params.set('LastName', words.join(' '));
  return `https://www.pdga.com/players?${params}`;
}

/** Reads a typed PDGA number. Spaces and "#" are ignored, so a number copied from pdga.com works. */
export function readPdgaNumber(text: string): { empty: boolean; pdgaNumber: number | null } {
  const digits = text.replace(/[\s#]/g, '');
  return { empty: digits === '', pdgaNumber: digits === '' ? null : parseInteger(digits, RANGES.id) };
}

export interface PdgaFormOptions {
  /** The input's id; the button and the status take ids derived from it. */
  id?: string;
  label?: MessageKey;
  submit?: MessageKey;
  /** False when an empty field is an error rather than a way to remove the number. */
  allowEmpty?: boolean;
}

/** A PDGA number field with a button. By default your own number, where an empty field removes it. */
export function pdgaNumberForm(
  value: number | null,
  flash: PdgaFlash,
  onSave: (pdgaNumber: number | null) => void,
  { id = PDGA_INPUT_ID, label = 'pdga.label', submit: submitKey = 'pdga.save', allowEmpty = true }: PdgaFormOptions = {},
): HTMLFormElement {
  const statusId = `${id}-status`;
  const input = el('input', {
    id,
    class: 'input',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    enterkeyhint: 'done',
    maxlength: 12,
    value: value ?? '',
    'aria-describedby': statusId,
  });
  const status = el(
    'p',
    { id: statusId, class: flash === 'full' ? 'status error' : 'status', role: 'status' },
    flash && t(FLASH[flash], { max: MAX_FAVORITES }),
  );
  const submit = (event: Event) => {
    event.preventDefault();
    const { empty, pdgaNumber } = readPdgaNumber(input.value);
    if (pdgaNumber === null && (!empty || !allowEmpty)) {
      input.setAttribute('aria-invalid', 'true');
      status.classList.add('error');
      status.textContent = t('pdga.invalid');
      input.focus();
      return;
    }
    onSave(pdgaNumber);
  };
  return el(
    'form',
    { class: 'field', novalidate: true, onsubmit: submit },
    el('label', { for: id, class: 'label' }, t(label)),
    el(
      'div',
      { class: 'row' },
      input,
      el('button', { id: `${id}-save`, class: 'button', type: 'submit' }, t(submitKey)),
    ),
    status,
  );
}

export interface NameSearchOptions {
  /** The input's id; the hint, button and status take ids derived from it. */
  id: string;
  label: MessageKey;
  hint: MessageKey;
}

/** Opens pdga.com's player search for a typed name, through onSearch with its URL. */
export function nameSearchForm(onSearch: (url: string) => void, { id, label, hint }: NameSearchOptions): HTMLFormElement {
  const statusId = `${id}-status`;
  const input = el('input', {
    id,
    class: 'input',
    type: 'search',
    autocomplete: 'off',
    enterkeyhint: 'search',
    maxlength: 100,
    'aria-describedby': `${id}-hint ${statusId}`,
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
    el('label', { for: id, class: 'label' }, t(label)),
    el('p', { id: `${id}-hint`, class: 'hint' }, t(hint)),
    el(
      'div',
      { class: 'row' },
      input,
      el('button', { id: `${id}-submit`, class: 'button', type: 'submit' }, t('players.search')),
    ),
    status,
  );
}

/** Opens the player's ratings details on pdga.com; disabled until there is a number. */
export function detailsLink(pdgaNumber: number | null): HTMLElement {
  if (pdgaNumber === null) {
    const hintId = 'details-link-hint';
    return el(
      'div',
      {},
      el(
        'button',
        { id: 'details-link', class: 'button button-block', type: 'button', disabled: true, 'aria-describedby': hintId },
        t('pdga.openDetails'),
      ),
      el('p', { id: hintId, class: 'hint' }, t('pdga.needNumber')),
    );
  }
  return el(
    'a',
    {
      id: 'details-link',
      class: 'button button-primary button-block',
      href: detailsUrl(pdgaNumber),
      rel: 'noreferrer',
    },
    t('pdga.openDetails'),
  );
}
