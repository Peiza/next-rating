import { isPlainDate, type PlainDate } from '../../engine';
import { t, type MessageKey } from '../../i18n';
import type { Params } from '../../i18n/translator';
import type { RawEvent } from '../../parsers/types';
import { LIMITS } from '../../parsers/values';
import { el } from '../dom';
import { today } from '../format';
import { readPdgaNumber } from './pdga';

export interface PasteMessage {
  key: MessageKey;
  params?: Params;
  error?: boolean;
}

export interface ImportProps {
  /** Pasted event results waiting for their date. */
  pendingEvent: RawEvent | null;
  /** The number of rounds in a pasted ratings details table that has no player header. */
  pendingDetails: number | null;
  /** The default player, offered as the owner of a pasted table. */
  pdgaNumber: number | null;
  message: PasteMessage | null;
  /** On touch devices, pdga.com tables cannot be selected for copying, so the bookmarklet is offered first. */
  touch: boolean;
  onPaste: (html: string, text: string) => void;
  onOpenSetup: () => void;
  onAddEvent: (date: PlainDate, name: string) => void;
  onImportDetails: (owner: number) => void;
  onCancel: () => void;
}

export const PASTE_ID = 'paste-target';
export const EVENT_DATE_ID = 'paste-date';
export const OWNER_ID = 'paste-owner';

function showError(input: HTMLInputElement, key: MessageKey): void {
  input.setAttribute('aria-invalid', 'true');
  const status = document.getElementById('paste-status');
  if (status) {
    status.classList.add('error');
    status.textContent = t(key);
  }
  input.focus();
}

function formButtons(submitId: string, submitKey: MessageKey, onCancel: () => void): HTMLElement {
  return el(
    'div',
    { class: 'row' },
    el('button', { id: 'paste-cancel', class: 'button', type: 'button', onclick: onCancel }, t('paste.cancel')),
    el('button', { id: submitId, class: 'button button-primary grow', type: 'submit' }, t(submitKey)),
  );
}

function status(message: PasteMessage | null): HTMLElement {
  return el(
    'p',
    { id: 'paste-status', class: message?.error ? 'status error' : 'status', role: 'status' },
    message ? t(message.key, message.params) : '',
  );
}

function touchHint(onOpenSetup: () => void): HTMLElement {
  return el(
    'div',
    { class: 'field' },
    el('p', { id: 'paste-touch', class: 'hint' }, t('paste.touchHint')),
    el(
      'button',
      { id: 'paste-setup', class: 'button button-block', type: 'button', onclick: onOpenSetup },
      t('paste.openSetup'),
    ),
  );
}

function pasteForm({ message, touch, onPaste, onOpenSetup }: ImportProps): HTMLElement {
  const target = el('textarea', {
    id: PASTE_ID,
    class: 'input paste',
    rows: 6,
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-describedby': touch ? 'paste-help paste-touch paste-status' : 'paste-help paste-status',
    onpaste: (event) => {
      const data = (event as ClipboardEvent).clipboardData;
      if (!data) return;
      event.preventDefault();
      onPaste(data.getData('text/html'), data.getData('text/plain'));
    },
  });
  return el(
    'div',
    { class: 'field' },
    touch && touchHint(onOpenSetup),
    el('label', { for: PASTE_ID, class: 'label' }, t('paste.label')),
    target,
    status(message),
    el(
      'button',
      { id: 'paste-read', class: 'button button-block', type: 'button', onclick: () => onPaste('', target.value) },
      t('paste.read'),
    ),
  );
}

/** Pasted results have no date, so the user gives the last day of the event, and optionally its name. */
function eventForm({ pendingEvent, message, onAddEvent, onCancel }: ImportProps): HTMLElement {
  const date = el('input', {
    id: EVENT_DATE_ID,
    class: 'input',
    type: 'date',
    required: true,
    value: today(),
    'aria-describedby': 'paste-status',
  });
  const name = el('input', {
    id: 'paste-name',
    class: 'input',
    type: 'text',
    autocomplete: 'off',
    maxlength: LIMITS.text,
    value: pendingEvent?.name ?? '',
  });
  const submit = (event: Event) => {
    event.preventDefault();
    if (!isPlainDate(date.value)) {
      showError(date, 'paste.dateInvalid');
      return;
    }
    onAddEvent(date.value, name.value.replace(/\s+/g, ' ').trim());
  };
  return el(
    'form',
    { class: 'field', novalidate: true, onsubmit: submit },
    el('p', { class: 'step-title' }, t('paste.eventFound')),
    el('div', { class: 'field' }, el('label', { for: EVENT_DATE_ID, class: 'label' }, t('paste.eventDate')), date),
    el('div', { class: 'field' }, el('label', { for: 'paste-name', class: 'label' }, t('paste.eventName')), name),
    status(message),
    formButtons('paste-add', 'paste.eventAdd', onCancel),
  );
}

/**
 * A pasted ratings details table does not say whose rounds it holds, so the
 * user confirms the player, starting from the default PDGA number.
 */
function ownerForm({ pendingDetails, pdgaNumber, message, onImportDetails, onCancel }: ImportProps): HTMLElement {
  const input = el('input', {
    id: OWNER_ID,
    class: 'input',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    maxlength: 12,
    value: pdgaNumber ?? '',
    'aria-describedby': 'paste-owner-help paste-status',
  });
  const submit = (event: Event) => {
    event.preventDefault();
    const { empty, pdgaNumber: owner } = readPdgaNumber(input.value);
    if (owner === null) {
      showError(input, empty ? 'paste.ownerMissing' : 'pdga.invalid');
      return;
    }
    onImportDetails(owner);
  };
  return el(
    'form',
    { class: 'field', novalidate: true, onsubmit: submit },
    el('p', { class: 'step-title' }, t('paste.ownerFound', { count: pendingDetails ?? 0 })),
    el('p', { id: 'paste-owner-help' }, t('paste.ownerQuestion')),
    el('div', { class: 'field' }, el('label', { for: OWNER_ID, class: 'label' }, t('pdga.label')), input),
    status(message),
    formButtons('paste-import', 'paste.ownerImport', onCancel),
  );
}

/** The Import tab: paste a table copied from pdga.com. */
export function importView(props: ImportProps): HTMLElement {
  return el(
    'section',
    { class: 'view', 'aria-labelledby': 'view-title' },
    el('h1', { id: 'view-title' }, t('import.title')),
    el('h2', {}, t('paste.title')),
    el('p', { id: 'paste-help' }, t('paste.help')),
    props.pendingEvent ? eventForm(props) : props.pendingDetails !== null ? ownerForm(props) : pasteForm(props),
  );
}
