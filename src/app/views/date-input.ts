import { el, svg } from '../dom';

/**
 * A date field with a calendar icon after it. Safari on iPhone draws a date
 * field like plain text, so nothing tells that a tap opens a picker; the icon
 * shows only there (styles.css), as other browsers draw their own. Taps go
 * through the icon to the field, and screen readers skip it.
 */
export function dateInput(input: HTMLInputElement): HTMLElement {
  return el(
    'span',
    { class: 'date-input' },
    input,
    svg(
      'svg',
      { class: 'date-icon', viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' },
      svg('rect', { x: 2.5, y: 4, width: 15, height: 13.5, rx: 2 }),
      svg('path', { d: 'M2.5 8.5h15M6.5 2v4M13.5 2v4' }),
    ),
  );
}
