import { t } from '../../i18n';
import { parseInteger, RANGES } from '../../parsers/values';
import { el } from '../dom';

/** What the PDGA number form says after a save. */
export type PdgaFlash = 'saved' | 'removed' | null;

export const PDGA_INPUT_ID = 'pdga-number';
export const PDGA_SAVE_ID = 'pdga-number-save';

export function detailsUrl(pdgaNumber: number): string {
  return `https://www.pdga.com/player/${pdgaNumber}/details`;
}

/** Reads a typed PDGA number. Spaces and "#" are ignored, so a number copied from pdga.com works. */
export function readPdgaNumber(text: string): { empty: boolean; pdgaNumber: number | null } {
  const digits = text.replace(/[\s#]/g, '');
  return { empty: digits === '', pdgaNumber: digits === '' ? null : parseInteger(digits, RANGES.id) };
}

/** The default player's PDGA number. An empty field removes the number. */
export function pdgaNumberForm(
  value: number | null,
  flash: PdgaFlash,
  onSave: (pdgaNumber: number | null) => void,
): HTMLFormElement {
  const statusId = `${PDGA_INPUT_ID}-status`;
  const input = el('input', {
    id: PDGA_INPUT_ID,
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
    { id: statusId, class: 'status', role: 'status' },
    flash === 'saved' ? t('pdga.saved') : flash === 'removed' ? t('pdga.removed') : '',
  );
  const submit = (event: Event) => {
    event.preventDefault();
    const { empty, pdgaNumber } = readPdgaNumber(input.value);
    if (!empty && pdgaNumber === null) {
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
    el('label', { for: PDGA_INPUT_ID, class: 'label' }, t('pdga.label')),
    el(
      'div',
      { class: 'row' },
      input,
      el('button', { id: PDGA_SAVE_ID, class: 'button', type: 'submit' }, t('pdga.save')),
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
