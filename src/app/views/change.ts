import { svg } from '../dom';

/** The class suffix and arrow for a change. The arrow and a sign carry it, never colour alone. */
export function direction(value: number): ['up' | 'down' | 'none', string] {
  return value > 0 ? ['up', '↑'] : value < 0 ? ['down', '↓'] : ['none', '→'];
}

/** A change's size in whole rating points, rounded as formatChange shows it. */
function shownSize(value: number): number {
  return Math.round(Math.abs(value));
}

/**
 * How steep a change's arrow is, in degrees up from flat (negative is down):
 * 0 for none, 45 at 5, 90 from 10, linear in between, so 9 degrees a point.
 */
export function arrowAngle(value: number): number {
  const size = Math.min(shownSize(value), 10);
  return size === 0 ? 0 : Math.sign(value) * size * 9;
}

/** How strong a change's tone is: 0 for none, 1 for 1–2, 2 for 3–9, 3 for 10 and more. */
export type Strength = 0 | 1 | 2 | 3;

export function strength(value: number): Strength {
  const size = shownSize(value);
  return size === 0 ? 0 : size < 3 ? 1 : size < 10 ? 2 : 3;
}

/**
 * The arrow for a change as a small drawing, since there is no character
 * for every slope: one arrow pointing right, turned by arrowAngle. The turn
 * is an SVG attribute, which the CSP allows where an inline style is
 * blocked. Hidden from screen readers, which read the sign.
 */
export function slopeArrow(value: number): SVGElement {
  const angle = arrowAngle(value);
  return svg(
    'svg',
    { class: 'slope-arrow', viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: 'M3 10h13M11 5l5 5-5 5', transform: angle === 0 ? false : `rotate(${-angle} 10 10)` }),
  );
}
