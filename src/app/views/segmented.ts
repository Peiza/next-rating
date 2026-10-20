import { t, type MessageKey } from '../../i18n';
import { el } from '../dom';

export interface Segment<T> {
  value: T;
  /** The radio's id, so focus can return to it after a render. */
  id: string;
  label: MessageKey;
}

/** A segmented control of native radios, such as the theme picker. */
export function segmented<T>(
  legend: MessageKey,
  name: string,
  segments: readonly Segment<T>[],
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  return el(
    'fieldset',
    { class: 'segmented' },
    el('legend', { class: 'label' }, t(legend)),
    el(
      'div',
      { class: 'segments' },
      ...segments.flatMap((segment) => [
        el('input', {
          id: segment.id,
          type: 'radio',
          name,
          value: String(segment.value ?? ''),
          checked: segment.value === value,
          onchange: () => onChange(segment.value),
        }),
        el('label', { for: segment.id }, t(segment.label)),
      ]),
    ),
  );
}
