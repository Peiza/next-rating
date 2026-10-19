import { isPlainDate, type PlainDate } from '../../engine';
import { t, type MessageKey } from '../../i18n';
import type { Params } from '../../i18n/translator';
import type { RawEvent } from '../../parsers/types';
import { LIMITS } from '../../parsers/values';
import { el } from '../dom';
import { today } from '../format';

export interface PasteMessage {
  key: MessageKey;
  params?: Params;
  error?: boolean;
}

export interface ImportProps {
  /** Pasted event results waiting for their date. */
  pendingEvent: RawEvent | null;
  message: PasteMessage | null;
  onPaste: (html: string, text: string) => void;
  onAddEvent: (date: PlainDate, name: string) => void;
  onCancelEvent: () => void;
}

export const PASTE_ID = 'paste-target';
export const EVENT_DATE_ID = 'paste-date';

function status(message: PasteMessage | null): HTMLElement {
  return el(
    'p',
    { id: 'paste-status', class: message?.error ? 'status error' : 'status', role: 'status' },
    message ? t(message.key, message.params) : '',
  );
}

function pasteForm({ message, onPaste }: ImportProps): HTMLElement {
  const target = el('textarea', {
    id: PASTE_ID,
    class: 'input paste',
    rows: 6,
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-describedby': 'paste-help paste-status',
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
function eventForm({ pendingEvent, message, onAddEvent, onCancelEvent }: ImportProps): HTMLElement {
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
      date.setAttribute('aria-invalid', 'true');
      const status = document.getElementById('paste-status');
      if (status) {
        status.classList.add('error');
        status.textContent = t('paste.dateInvalid');
      }
      date.focus();
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
    el(
      'div',
      { class: 'row' },
      el('button', { id: 'paste-cancel', class: 'button', type: 'button', onclick: onCancelEvent }, t('paste.cancel')),
      el('button', { id: 'paste-add', class: 'button button-primary grow', type: 'submit' }, t('paste.eventAdd')),
    ),
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
    props.pendingEvent ? eventForm(props) : pasteForm(props),
  );
}
