import { isPlainDate, MAX_TARGET_ROUND } from '../../engine';
import { t, type MessageKey } from '../../i18n';
import type { ListedRound } from '../../parsers';
import { el } from '../dom';
import { dateInput } from './date-input';
import { formatDate, formatDayMonth, formatRating } from '../format';
import {
  readTarget,
  type TargetAnswer,
  type TargetDates,
  type TargetDraft,
  type TargetField,
  type TargetQuery,
} from '../target';
import { roundWhere } from './round-text';

/*
 * The target calculator, the content of the "Reach a target rating" card on
 * the Rating tab: a short form with the target first and Calculate last,
 * near the thumb. The answer shows in the status line under it, with the
 * rounds that leave the window because of the date.
 */

/** The card's header button (cardToggleId('target')). */
export const TARGET_TOGGLE_ID = 'target-toggle';
export const TARGET_RATING_ID = 'target-rating';
export const TARGET_STATUS_ID = 'target-status';

const PANEL_ID = 'target-panel';
const COUNT_ID = 'target-count';
const DATE_ID = 'target-date';
const HINT_ID = 'target-hint';

export interface TargetProps {
  draft: TargetDraft;
  /** The dates the last new round can have. */
  dates: TargetDates;
  /** The answer to the last calculation, or null before one. */
  answer: TargetAnswer | null;
  onDraft: (field: TargetField, value: string) => void;
  onCalculate: (query: TargetQuery) => void;
}

const FIELD_IDS: Record<TargetField, string> = { target: TARGET_RATING_ID, count: COUNT_ID, date: DATE_ID };

const DASH = '–';

/** The hint under the fields, with the typed date once it is one. */
function hintText(date: string): string {
  return isPlainDate(date) ? t('target.assumes', { date: formatDate(date) }) : t('target.assumesNoDate');
}

const line = (className: string, text: string) => el('p', { class: className }, text);

/**
 * The answer, key result first: one large figure (the average needed, or
 * the rating already reached) with a sentence saying what it is, then muted
 * notes. The figure is the only bold; out of reach has no figure, and its
 * first line is the bold one instead.
 */
function answerLines({ query, update, missed, result }: TargetAnswer): HTMLElement[] {
  const params = {
    count: query.count,
    target: formatRating(query.target),
    update: formatDayMonth(update.update),
  };
  const date = formatDate(query.date);
  const best = () =>
    t('target.outOfReachBest', {
      ...params,
      max: formatRating(MAX_TARGET_ROUND),
      rating: result.rating === null ? DASH : formatRating(result.rating),
    });
  const lines: HTMLElement[] = [];
  if (result.reached && result.without !== null) {
    lines.push(line('target-figure', formatRating(result.without)), line('target-lead', t('target.reached', params)));
    if (result.average === null) lines.push(line('target-note', t('target.outOfReach', params)), line('target-note', best()));
    else if (result.average === 0) lines.push(line('target-note', t('target.keepAny', params)));
    else lines.push(line('target-note', t('target.keep', { ...params, average: formatRating(result.average) })));
  } else if (result.average === null) {
    lines.push(line('target-strong', t('target.outOfReach', params)), line('target-lead', best()));
  } else {
    lines.push(line('target-figure', formatRating(result.average)), line('target-lead', t('target.needed', params)));
  }
  lines.push(
    line(
      'target-note',
      missed === null
        ? t('target.update', { ...params, date, deadline: formatDayMonth(update.deadline) })
        : t('target.missed', { ...params, date, deadline: formatDayMonth(missed) }),
    ),
  );
  return lines;
}

function leavingItem(round: ListedRound): HTMLElement {
  return el(
    'li',
    { class: 'leaving-round' },
    el('span', { class: 'leaving-rating' }, formatRating(round.rating!)),
    el('p', { class: 'leaving-meta' }, roundWhere(round)),
  );
}

/** The rounds that leave the window because of the date, so an early or a late date's answer is explained. */
function leavingList({ query, leaving }: TargetAnswer): HTMLElement[] {
  const date = formatDate(query.date);
  if (leaving.length === 0) return [line('target-note', t('target.leavingNone', { date }))];
  return [
    el('p', { id: 'target-leaving-title', class: 'target-note' }, t('target.leavingTitle', { date })),
    el('ul', { class: 'leaving-rounds', 'aria-labelledby': 'target-leaving-title' }, ...leaving.map(leavingItem)),
  ];
}

/** One field with its label above it. */
function field(id: string, label: MessageKey, input: HTMLInputElement): HTMLElement {
  const control = input.type === 'date' ? dateInput(input) : input;
  return el('div', { class: 'field' }, el('label', { for: id, class: 'label' }, t(label)), control);
}

/** The card's content. */
export function targetCalculator(props: TargetProps): HTMLFormElement {
  const { draft, dates, answer } = props;
  const hint = el('p', { id: HINT_ID, class: 'hint hint-tight' }, hintText(draft.date));
  const input = (name: TargetField, attrs: Record<string, string | number>) =>
    el('input', {
      id: FIELD_IDS[name],
      class: 'input',
      autocomplete: 'off',
      value: draft[name],
      'aria-describedby': `${HINT_ID} ${TARGET_STATUS_ID}`,
      oninput: (event) => {
        const value = (event.target as HTMLInputElement).value;
        if (name === 'date') hint.textContent = hintText(value);
        props.onDraft(name, value);
      },
      ...attrs,
    });
  const numeric = { type: 'text', inputmode: 'numeric', enterkeyhint: 'done' };
  const inputs: Record<TargetField, HTMLInputElement> = {
    target: input('target', { ...numeric, maxlength: 4 }),
    count: input('count', { ...numeric, maxlength: 2 }),
    date: input('date', { type: 'date', min: dates.min, max: dates.max }),
  };
  const status = el(
    'div',
    { id: TARGET_STATUS_ID, class: 'status target-answer', role: 'status', tabindex: -1 },
    ...(answer ? [...answerLines(answer), ...leavingList(answer)] : []),
  );
  const submit = (event: Event) => {
    event.preventDefault();
    for (const one of Object.values(inputs)) one.removeAttribute('aria-invalid');
    const read = readTarget({ target: inputs.target.value, count: inputs.count.value, date: inputs.date.value }, dates);
    if ('error' in read) {
      inputs[read.field].setAttribute('aria-invalid', 'true');
      status.className = 'status target-answer error';
      status.replaceChildren(el('p', {}, t(read.error, { min: formatDate(dates.min), max: formatDate(dates.max) })));
      inputs[read.field].focus();
      return;
    }
    props.onCalculate(read.query);
  };
  return el(
    'form',
    { id: PANEL_ID, class: 'target-form', novalidate: true, onsubmit: submit },
    field(TARGET_RATING_ID, 'target.target', inputs.target),
    field(COUNT_ID, 'target.count', inputs.count),
    field(DATE_ID, 'target.date', inputs.date),
    hint,
    el('button', { id: 'target-calculate', class: 'button button-primary button-block', type: 'submit' }, t('target.calculate')),
    status,
  );
}
