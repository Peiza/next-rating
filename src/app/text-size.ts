import { GUIDE_TEXT_STEPS, TEXT_SIZES } from './storage';

/*
 * The text size. Settings can fix it in CSS pixels on <html>; otherwise the
 * device decides (styles.css: 17 px on phones, 15 px on wider screens,
 * Dynamic Type on iPhone). Everything sized in rem follows on its own; what
 * is sized in pixels, like the chart, grows by textScale.
 */

/** A phone's size, used when the device's size cannot be read. */
export const PHONE_TEXT_SIZE = 17;

/** Rounds a size to whole pixels within the sizes Settings offers. */
export function clampTextSize(size: number): number {
  const [min, max] = TEXT_SIZES;
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(size) ? size : PHONE_TEXT_SIZE)));
}

/** Where the Settings slider stands: the size picked, or while it follows the device, the device's size. */
export function sliderValue(textSize: number | null, deviceSize: number): number {
  return textSize ?? clampTextSize(deviceSize);
}

/** How much larger than the device's size the text is drawn: 1 while it follows the device. */
export function textScale(textSize: number | null, deviceSize: number): number {
  return textSize === null || !(deviceSize > 0) ? 1 : textSize / deviceSize;
}

/**
 * The factor on rem for headings and large numbers (styles.css
 * --display-scale), so they change by half as much as body text: at 22 px
 * on a 17 px phone, an h1 of 1.75rem is 1.75 × 19.5 px. 1 while it follows
 * the device.
 */
export function displayScale(textSize: number | null, deviceSize: number): number {
  return textSize === null || !(deviceSize > 0) ? 1 : (textSize + deviceSize) / (2 * textSize);
}

/*
 * How it works: A− / A+ add a step to the app's text size (`base`, the size
 * picked in Settings or the device's), for that page only. It may go above
 * the 22 px Settings stops at, for reading.
 */

/** The sizes How it works offers, in CSS pixels. */
export const GUIDE_TEXT_SIZES = [14, 32] as const;

/** 14 to 32 px, widened to include the app's size, so a tap never takes the page past it the wrong way. */
function guideRange(base: number): readonly [number, number] {
  const [min, max] = GUIDE_TEXT_SIZES;
  return [Math.min(min, base), Math.max(max, base)];
}

function clamp(value: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, value));
}

/** The page's size: the app's size at step 0, otherwise whole pixels within the range. */
export function guideTextSize(base: number, step: number): number {
  return step === 0 ? base : clamp(Math.round(base) + step, guideRange(base));
}

/**
 * The step after A− (delta -1) or A+ (+1): one pixel from the size shown,
 * not from the step stored, which the range may have cut (22 + 18 shows 32,
 * and A− shows 31).
 */
export function nextGuideStep(base: number, step: number, delta: number): number {
  const size = clamp(Math.round(guideTextSize(base, step)) + delta, guideRange(base));
  return clamp(size - Math.round(base), GUIDE_TEXT_STEPS);
}

/** Whether A− or A+ changes the size shown; at a limit its button is disabled. */
export function canStepGuide(base: number, step: number, delta: number): boolean {
  return guideTextSize(base, nextGuideStep(base, step, delta)) !== guideTextSize(base, step);
}
