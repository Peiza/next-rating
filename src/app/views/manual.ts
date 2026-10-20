import { compareDates, isPlainDate, subtractMonths, type PlainDate } from '../../engine/dates';
import { t, type MessageKey } from '../../i18n';
import { parseInteger, RANGES } from '../../parsers/values';
import { el } from '../dom';
import { formatDate, formatRating } from '../format';
import type { ManualRoundInput } from '../players';
import { MAX_EVENT_NAME, MAX_FAVORITES, MAX_MANUAL_ROUNDS, type StoredManualRound } from '../storage';

/*
 * Quick manual entry, the content of the "Add a round" card on the Rating
 * tab: a form built for one hand, with the rating first and the Add button
 * last, near the thumb. Below it, the player's manual rounds with a delete
 * button each.
 */

/** The card's header button (cardToggleId('manual')). */
export const MANUAL_TOGGLE_ID = 'manual-toggle';
export const MANUAL_RATING_ID = 'manual-rating';
export const MANUAL_ADD_ID = 'manual-add';
export const MANUAL_CLEAR_ID = 'manual-clear';
export const MANUAL_CLEAR_CANCEL_ID = 'manual-clear-cancel';
export const MANUAL_UNDO_ID = 'manual-undo';

const PANEL_ID = 'manual-panel';
const DATE_ID = 'manual-date';
const EVENT_ID = 'manual-event';
const HOLES_ID = 'manual-holes';
const STATUS_ID = 'manual-status';

/** What has been typed, kept by main.ts so a re-render does not lose it. */
export interface ManualDraft {
  rating: string;
  date: string;
  eventName: string;
  holes: string;
}

export type ManualField = keyof ManualDraft;

/** What the form says after the last action. */
export type ManualFlash =
  | { kind: 'added'; rating: number; savedFavorite: boolean }
  | { kind: 'restored'; rating: number }
  | { kind: 'cleared' | 'favorites-full' | 'rounds-full' }
  | null;

export function emptyDraft(today: PlainDate): ManualDraft {
  return { rating: '', date: today, eventName: '', holes: '' };
}

/** The latest date a manual round can have: one year after today, for a round at an upcoming event. */
export function latestManualDate(today: PlainDate): PlainDate {
  return subtractMonths(today, -12);
}

export type ManualRead = { round: ManualRoundInput } | { field: ManualField; error: MessageKey };

/** A typed whole number within `range`: digits only, so "9.5", "-5" and "1e3" are not read. */
export function readWhole(text: string, range: readonly [number, number]): number | null {
  const digits = text.trim();
  return /^\d{1,4}$/.test(digits) ? parseInteger(digits, range) : null;
}

/** Reads the typed round, or the first field that is not valid and why. */
export function readManualRound(draft: ManualDraft, today: PlainDate): ManualRead {
  const rating = readWhole(draft.rating, RANGES.rating);
  if (rating === null) return { field: 'rating', error: 'manual.ratingInvalid' };
  const date = draft.date.trim();
  if (!isPlainDate(date)) return { field: 'date', error: 'manual.dateMissing' };
  if (compareDates(date, latestManualDate(today)) > 0) return { field: 'date', error: 'manual.dateTooLate' };
  const holes = draft.holes.trim() === '' ? null : readWhole(draft.holes, RANGES.holes);
  if (holes === null && draft.holes.trim() !== '') return { field: 'holes', error: 'manual.holesInvalid' };
  const eventName = draft.eventName.trim().replace(/\s+/g, ' ').slice(0, MAX_EVENT_NAME);
  return { round: { rating, date, eventName, holes } };
}

export interface ManualProps {
  rounds: readonly StoredManualRound[];
  draft: ManualDraft;
  flash: ManualFlash;
  /** "Delete all" waits for confirmation. */
  confirmClear: boolean;
  /** The round just deleted, which Undo puts back. A single delete does not ask first. */
  undo: { rating: number; date: PlainDate } | null;
  /** The player's label, for the message when adding a round saves the player as a favorite. */
  player: string;
  today: PlainDate;
  onDraft: (field: ManualField, value: string) => void;
  onAdd: (round: ManualRoundInput) => void;
  onDelete: (id: string) => void;
  onUndo: () => void;
  onAskClear: (ask: boolean) => void;
  onClear: () => void;
}

const FIELD_IDS: Record<ManualField, string> = {
  rating: MANUAL_RATING_ID,
  date: DATE_ID,
  eventName: EVENT_ID,
  holes: HOLES_ID,
};

function flashText(flash: NonNullable<ManualFlash>, player: string): string {
  switch (flash.kind) {
    case 'added': {
      const rating = formatRating(flash.rating);
      return flash.savedFavorite ? t('manual.addedFavorite', { rating, player }) : t('manual.added', { rating });
    }
    case 'restored':
      return t('manual.restored', { rating: formatRating(flash.rating) });
    case 'cleared':
      return t('manual.cleared');
    case 'favorites-full':
      return t('favorites.full', { max: MAX_FAVORITES });
    case 'rounds-full':
      return t('manual.roundsFull', { max: MAX_MANUAL_ROUNDS });
  }
}

function isError(flash: ManualFlash): boolean {
  return flash?.kind === 'favorites-full' || flash?.kind === 'rounds-full';
}

/** One field with its label above it, and an optional hint. */
function field(id: string, label: MessageKey, input: HTMLInputElement, hint?: MessageKey): HTMLElement {
  if (hint) input.setAttribute('aria-describedby', `${id}-hint ${STATUS_ID}`);
  return el(
    'div',
    { class: 'field' },
    el('label', { for: id, class: 'label' }, t(label)),
    hint && el('p', { id: `${id}-hint`, class: 'hint hint-tight' }, t(hint)),
    input,
  );
}

/** Next to "Removed 985" in the status line, so a mistaken tap on Delete is easy to reverse. */
function undoButton(undo: NonNullable<ManualProps['undo']>, onUndo: () => void): HTMLElement {
  return el(
    'button',
    {
      id: MANUAL_UNDO_ID,
      class: 'button button-small',
      type: 'button',
      'aria-label': t('manual.undoLabel', { rating: formatRating(undo.rating), date: formatDate(undo.date) }),
      onclick: onUndo,
    },
    t('manual.undo'),
  );
}

function entryForm(props: ManualProps): HTMLFormElement {
  const { draft, today } = props;
  const input = (name: ManualField, attrs: Record<string, string | number | boolean>) =>
    el('input', {
      id: FIELD_IDS[name],
      class: 'input',
      autocomplete: 'off',
      value: draft[name],
      'aria-describedby': STATUS_ID,
      oninput: (event) => props.onDraft(name, (event.target as HTMLInputElement).value),
      ...attrs,
    });
  const inputs: Record<ManualField, HTMLInputElement> = {
    rating: input('rating', { type: 'text', inputmode: 'numeric', enterkeyhint: 'done', maxlength: 4 }),
    date: input('date', { type: 'date', max: latestManualDate(today) }),
    eventName: input('eventName', { type: 'text', enterkeyhint: 'done', maxlength: MAX_EVENT_NAME }),
    holes: input('holes', { type: 'text', inputmode: 'numeric', enterkeyhint: 'done', maxlength: 2 }),
  };
  const more = el(
    'details',
    { class: 'manual-more', open: draft.eventName !== '' || draft.holes !== '' },
    el('summary', {}, t('manual.more')),
    field(EVENT_ID, 'manual.eventName', inputs.eventName, 'manual.eventNameHint'),
    field(HOLES_ID, 'manual.holes', inputs.holes),
  );
  const { flash, undo } = props;
  const status = el(
    'p',
    { id: STATUS_ID, class: isError(flash) ? 'status error' : 'status', role: 'status' },
    flash ? flashText(flash, props.player) : undo ? t('manual.removed', { rating: formatRating(undo.rating) }) : '',
  );
  const submit = (event: Event) => {
    event.preventDefault();
    for (const one of Object.values(inputs)) one.removeAttribute('aria-invalid');
    const read = readManualRound(
      {
        rating: inputs.rating.value,
        date: inputs.date.value,
        eventName: inputs.eventName.value,
        holes: inputs.holes.value,
      },
      today,
    );
    if ('error' in read) {
      if (read.field === 'holes') more.open = true;
      inputs[read.field].setAttribute('aria-invalid', 'true');
      status.className = 'status error';
      status.textContent = t(read.error, { max: formatDate(latestManualDate(today)) });
      inputs[read.field].focus();
      return;
    }
    props.onAdd(read.round);
  };
  return el(
    'form',
    { id: PANEL_ID, class: 'manual-form', novalidate: true, onsubmit: submit },
    field(MANUAL_RATING_ID, 'manual.rating', inputs.rating),
    field(DATE_ID, 'manual.date', inputs.date, 'manual.dateHint'),
    more,
    el('button', { id: MANUAL_ADD_ID, class: 'button button-primary button-block', type: 'submit' }, t('manual.add')),
    el('div', { class: 'status-row' }, status, undo && undoButton(undo, props.onUndo)),
  );
}

function roundText(round: StoredManualRound): string {
  return [
    formatDate(round.date),
    round.eventName,
    round.holes !== null && round.holes !== 18 ? t('round.holes', { count: round.holes }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Newest date first; on the same date, the one added last first. */
function newestFirst(rounds: readonly StoredManualRound[]): StoredManualRound[] {
  return rounds
    .map((round, i) => ({ round, i }))
    .sort((a, b) => compareDates(b.round.date, a.round.date) || b.i - a.i)
    .map(({ round }) => round);
}

function roundItem(round: StoredManualRound, onDelete: (id: string) => void): HTMLElement {
  return el(
    'li',
    { class: 'manual-round' },
    el(
      'div',
      { class: 'manual-round-text' },
      el('span', { class: 'round-rating' }, formatRating(round.rating)),
      el('p', { class: 'round-meta' }, roundText(round)),
    ),
    el(
      'button',
      {
        id: `manual-delete-${round.id}`,
        class: 'button button-small',
        type: 'button',
        'aria-label': t('manual.deleteLabel', { rating: formatRating(round.rating), date: formatDate(round.date) }),
        onclick: () => onDelete(round.id),
      },
      t('manual.delete'),
    ),
  );
}

/** Deleting all asks first, in place rather than with a dialog. */
function clearRow(props: ManualProps): HTMLElement {
  if (!props.confirmClear) {
    return el(
      'button',
      { id: MANUAL_CLEAR_ID, class: 'button button-small button-danger', type: 'button', onclick: () => props.onAskClear(true) },
      t('manual.clear'),
    );
  }
  return el(
    'div',
    { class: 'confirm confirm-flush', role: 'group', 'aria-labelledby': 'manual-clear-question' },
    el('p', { id: 'manual-clear-question' }, t('manual.clearQuestion', { count: props.rounds.length })),
    el(
      'div',
      { class: 'row' },
      el(
        'button',
        { id: MANUAL_CLEAR_CANCEL_ID, class: 'button', type: 'button', onclick: () => props.onAskClear(false) },
        t('manual.cancel'),
      ),
      el(
        'button',
        { id: 'manual-clear-confirm', class: 'button button-danger grow', type: 'button', onclick: props.onClear },
        t('manual.clearConfirm'),
      ),
    ),
  );
}

/** The card's content: the form, then the player's manual rounds. */
export function manualEntry(props: ManualProps): HTMLElement[] {
  const { rounds } = props;
  return [
    entryForm(props),
    ...(rounds.length > 0
      ? [
          el(
            'div',
            { class: 'manual-list' },
            el('h3', {}, t('manual.listTitle')),
            el('ul', { class: 'manual-rounds' }, ...newestFirst(rounds).map((round) => roundItem(round, props.onDelete))),
            clearRow(props),
          ),
        ]
      : []),
  ];
}
