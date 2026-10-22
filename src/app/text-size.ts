import { TEXT_SIZES } from './storage';

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
