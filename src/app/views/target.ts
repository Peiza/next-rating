import { MAX_TARGET_ROUND } from '../../engine';
import { t, type MessageKey } from '../../i18n';
import { el } from '../dom';
import { formatDayMonth, formatRating } from '../format';
import { readTarget, type TargetAnswer, type TargetDraft, type TargetField, type TargetQuery } from '../target';

/*
 * The target calculator on the Rating tab: a "Reach a target rating" button
 * opens a short form with the target first and Calculate last, near the
 * thumb. The answer shows in the status line under it.
 */

export const TARGET_TOGGLE_ID = 'target-toggle';
export const TARGET_RATING_ID = 'target-rating';
export const TARGET_STATUS_ID = 'target-status';

const PANEL_ID = 'target-panel';
const COUNT_ID = 'target-count';
const HINT_ID = 'target-hint';

export interface TargetProps {
  open: boolean;
  draft: TargetDraft;
  /** The answer to the last calculation, or null before one. */
  answer: TargetAnswer | null;
  onToggle: () => void;
  onDraft: (field: TargetField, value: string) => void;
  onCalculate: (query: TargetQuery) => void;
}

const FIELD_IDS: Record<TargetField, string> = { target: TARGET_RATING_ID, count: COUNT_ID };

const DASH = '–';

/** The answer as sentences, each its own paragraph. */
function answerLines({ query, update, following, missed, result }: TargetAnswer): string[] {
  const params = {
    count: query.count,
    target: formatRating(query.target),
    update: formatDayMonth(update.update),
  };
  const lines: string[] = [];
  if (following) {
    lines.push(t('target.following', { deadline: formatDayMonth(missed), update: params.update }));
  }
  if (result.reached && result.without !== null) {
    lines.push(t('target.reached', { rating: formatRating(result.without), update: params.update }));
  }
  if (result.average === null) {
    const rating = result.rating === null ? DASH : formatRating(result.rating);
    lines.push(t('target.outOfReach', { ...params, max: formatRating(MAX_TARGET_ROUND), rating }));
  } else if (!result.reached) {
    lines.push(t('target.needed', { ...params, average: formatRating(result.average) }));
  } else if (result.average === 0) {
    lines.push(t('target.keepAny', params));
  } else {
    lines.push(t('target.keep', { ...params, average: formatRating(result.average) }));
  }
  return lines;
}

/** One field with its label above it. */
function field(id: string, label: MessageKey, input: HTMLInputElement): HTMLElement {
  return el('div', { class: 'field' }, el('label', { for: id, class: 'label' }, t(label)), input);
}

function calculatorForm(props: TargetProps): HTMLFormElement {
  const { draft, answer } = props;
  const input = (name: TargetField, maxlength: number) =>
    el('input', {
      id: FIELD_IDS[name],
      class: 'input',
      type: 'text',
      inputmode: 'numeric',
      enterkeyhint: 'done',
      autocomplete: 'off',
      maxlength,
      value: draft[name],
      'aria-describedby': `${HINT_ID} ${TARGET_STATUS_ID}`,
      oninput: (event) => props.onDraft(name, (event.target as HTMLInputElement).value),
    });
  const inputs: Record<TargetField, HTMLInputElement> = { target: input('target', 4), count: input('count', 2) };
  const status = el(
    'div',
    { id: TARGET_STATUS_ID, class: 'status target-answer', role: 'status', tabindex: -1 },
    ...(answer ? answerLines(answer).map((line) => el('p', {}, line)) : []),
  );
  const submit = (event: Event) => {
    event.preventDefault();
    for (const one of Object.values(inputs)) one.removeAttribute('aria-invalid');
    const read = readTarget({ target: inputs.target.value, count: inputs.count.value });
    if ('error' in read) {
      inputs[read.field].setAttribute('aria-invalid', 'true');
      status.className = 'status target-answer error';
      status.replaceChildren(el('p', {}, t(read.error)));
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
    el('p', { id: HINT_ID, class: 'hint hint-tight' }, t('target.assumes')),
    el('button', { id: 'target-calculate', class: 'button button-primary button-block', type: 'submit' }, t('target.calculate')),
    status,
  );
}

export function targetCalculator(props: TargetProps): HTMLElement {
  return el(
    'section',
    { id: 'target', class: 'target', 'aria-label': t('target.title') },
    el(
      'button',
      {
        id: TARGET_TOGGLE_ID,
        class: 'button button-block',
        type: 'button',
        'aria-expanded': props.open ? 'true' : 'false',
        'aria-controls': PANEL_ID,
        onclick: props.onToggle,
      },
      t('target.toggle'),
    ),
    props.open && calculatorForm(props),
  );
}
