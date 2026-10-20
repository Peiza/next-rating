import { t, type MessageKey } from '../../i18n';
import { parseInteger, RANGES } from '../../parsers/values';
import { el } from '../dom';
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

export function detailsUrl(pdgaNumber: number): string {
  return `https://www.pdga.com/player/${pdgaNumber}/details`;
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
    flash ? t(FLASH[flash], { max: MAX_FAVORITES }) : '',
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
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    t('pdga.openDetails'),
  );
}
