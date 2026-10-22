import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDE_TEXT_STEPS, TEXT_SIZES } from '../../src/app/storage';
import {
  canStepGuide,
  clampTextSize,
  displayScale,
  GUIDE_TEXT_SIZES,
  guideTextSize,
  nextGuideStep,
  sliderValue,
  textScale,
} from '../../src/app/text-size';

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

  it('scales every size of 1.25rem or 1.25em or more in styles.css by --display-scale', () => {
    const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1]!);
    const large = sizes.filter((value) => [...value.matchAll(/([\d.]+)r?em/g)].some((size) => Number(size[1]) >= 1.25));
    // Seven in rem, and How it works' h1 and h2 in em.
    expect(large).toHaveLength(9);
    for (const value of large) expect(value).toContain('var(--display-scale, 1)');
  });
});

describe('How it works text size', () => {
  it('offers steps from -8 to +18 and sizes from 14 to 32 px', () => {
    expect(GUIDE_TEXT_STEPS).toEqual([-8, 18]);
    expect(GUIDE_TEXT_SIZES).toEqual([14, 32]);
  });

  it('shows the app’s size at step 0, and adds the step in whole pixels within 14 to 32', () => {
    expect(guideTextSize(17, 0)).toBe(17);
    expect(guideTextSize(16.8, 0)).toBe(16.8);
    expect(guideTextSize(17, 3)).toBe(20);
    expect(guideTextSize(16.8, 1)).toBe(18);
    expect(guideTextSize(22, 14)).toBe(32);
    expect(guideTextSize(22, 18)).toBe(32);
    expect(guideTextSize(14, 18)).toBe(32);
    expect(guideTextSize(22, -8)).toBe(14);
    expect(guideTextSize(15, -8)).toBe(14);
  });

  it('never takes the page past an app size outside 14 to 32 the wrong way', () => {
    // A large iPhone accessibility size.
    expect(guideTextSize(33, 0)).toBe(33);
    expect(guideTextSize(33, 3)).toBe(33);
    expect(guideTextSize(33, -3)).toBe(30);
    expect(guideTextSize(12, -2)).toBe(12);
    expect(guideTextSize(12, 1)).toBe(13);
  });

  it('steps one pixel from the size shown', () => {
    expect(nextGuideStep(17, 0, 1)).toBe(1);
    expect(nextGuideStep(17, 0, -1)).toBe(-1);
    expect(nextGuideStep(16.8, 0, 1)).toBe(1);
    // 22 + 18 shows 32: A− shows 31, and A+ changes nothing.
    expect(nextGuideStep(22, 18, -1)).toBe(9);
    expect(guideTextSize(22, nextGuideStep(22, 18, 1))).toBe(32);
    // From 23 px (Dynamic Type), the smallest step shows 15.
    expect(nextGuideStep(23, -8, -1)).toBe(-8);
  });

  it('disables A− and A+ where they would change nothing', () => {
    expect([canStepGuide(17, 0, -1), canStepGuide(17, 0, 1)]).toEqual([true, true]);
    expect(canStepGuide(17, 11, 1)).toBe(true);
    expect(canStepGuide(17, 15, 1)).toBe(false);
    expect(canStepGuide(22, 18, -1)).toBe(true);
    expect(canStepGuide(22, -8, -1)).toBe(false);
    expect(canStepGuide(23, -8, -1)).toBe(false);
    expect(canStepGuide(33, 0, 1)).toBe(false);
    expect(canStepGuide(33, 0, -1)).toBe(true);
  });
});
