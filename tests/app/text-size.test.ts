import { describe, expect, it } from 'vitest';
import { TEXT_SIZES } from '../../src/app/storage';
import { clampTextSize, sliderValue, textScale } from '../../src/app/text-size';

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
});
