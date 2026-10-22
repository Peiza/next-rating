import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEXT_SIZES } from '../../src/app/storage';
import { clampTextSize, displayScale, sliderValue, textScale } from '../../src/app/text-size';

const css = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'app', 'styles.css'), 'utf8');

describe('text size', () => {
  it('offers 14 to 22 px', () => {
    expect(TEXT_SIZES).toEqual([14, 22]);
  });

  it('rounds to whole pixels within the range', () => {
    expect(clampTextSize(16.8)).toBe(17);
    expect(clampTextSize(13)).toBe(14);
    expect(clampTextSize(25)).toBe(22);
    expect(clampTextSize(Number.NaN)).toBe(17);
  });

  it('puts the slider at the size picked, or at the device size while it follows the device', () => {
    expect(sliderValue(19, 17)).toBe(19);
    expect(sliderValue(null, 15)).toBe(15);
    expect(sliderValue(null, 16.8)).toBe(17);
    expect(sliderValue(null, 28)).toBe(22);
    expect(sliderValue(null, Number.NaN)).toBe(17);
  });

  it('scales pixel sizes by the size picked against the device size', () => {
    expect(textScale(null, 15)).toBe(1);
    expect(textScale(17, 17)).toBe(1);
    expect(textScale(22, 17)).toBeCloseTo(22 / 17);
    expect(textScale(15, 15)).toBe(1);
    expect(textScale(20, Number.NaN)).toBe(1);
  });

  it('changes headings and large numbers by half as much as body text', () => {
    expect(displayScale(null, 17)).toBe(1);
    expect(displayScale(17, 17)).toBe(1);
    // At 22 px on a 17 px phone, an h1 of 1.75rem is 1.75 × 19.5 px, halfway between 17 and 22.
    expect(displayScale(22, 17)).toBeCloseTo(39 / 44);
    expect(1.75 * 22 * displayScale(22, 17)).toBeCloseTo(1.75 * 19.5);
    expect(displayScale(14, 17)).toBeCloseTo(31 / 28);
    expect(displayScale(20, Number.NaN)).toBe(1);
  });

  it('scales every size of 1.25rem or more in styles.css by --display-scale', () => {
    const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1]!);
    const large = sizes.filter((value) => [...value.matchAll(/([\d.]+)rem/g)].some((rem) => Number(rem[1]) >= 1.25));
    expect(large).toHaveLength(6);
    for (const value of large) expect(value).toContain('var(--display-scale, 1)');
  });
});
