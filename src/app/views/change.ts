import { svg } from '../dom';

/** The class suffix and arrow for a change. The arrow and a sign carry it, never colour alone. */
export function direction(value: number): ['up' | 'down' | 'none', string] {
  return value > 0 ? ['up', '↑'] : value < 0 ? ['down', '↓'] : ['none', '→'];
}

/** How steep a change's arrow is: 0 flat for none, 1 shallow for 1–2, 2 diagonal for 3–9, 3 straight for 10 and more. */
export type Slope = 0 | 1 | 2 | 3;

export function slope(value: number): Slope {
  const size = Math.abs(value);
  return size === 0 ? 0 : size < 3 ? 1 : size < 10 ? 2 : 3;
}

/**
 * The arrow for a change as a small drawing, since there is no character
 * for a shallow arrow: one arrow pointing right, which styles.css turns up
 * or down by its slope. Hidden from screen readers, which read the sign.
 */
export function slopeArrow(value: number): SVGElement {
  const [dir] = direction(value);
  const level = slope(value);
  return svg(
    'svg',
    {
      class: level === 0 ? 'slope-arrow' : `slope-arrow slope-${dir}-${level}`,
      viewBox: '0 0 20 20',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    svg('path', { d: 'M3 10h13M11 5l5 5-5 5' }),
  );
}
