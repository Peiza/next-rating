import type { PlainDate } from '../../engine';
import { languages, resolveLanguage, t, type MessageKey } from '../../i18n';
import { el } from '../dom';
import { formatCount, formatDate } from '../format';
import { DATE_ORDERS, TEXT_SIZES, type DateOrder, type OpenWith, type Theme } from '../storage';
import { sliderValue } from '../text-size';
import { segmented, type Segment } from './segmented';
import { bookmarkletStatus } from './setup';
import { supportLink } from './support';

export interface SettingsProps {
  /** The language override; null follows the device. */
  language: string | null;
  /** The device's preferred languages. */
  preferred: readonly string[];
  /** The theme override; null follows the device. */
  theme: Theme | null;
  /** The text size override in CSS pixels; null follows the device. */
  textSize: number | null;
  /** The device's text size, which the slider shows while it follows the device. */
  deviceTextSize: number;
  /** The date format override; null follows the language and the device's region. */
  dateOrder: DateOrder | null;
  /** Today, which each date format option shows as its example. */
  today: PlainDate;
  /** Whether the app opens on "me" or on the player shown last. */
  openWith: OpenWith;
  persistent: boolean;
  /** The bookmarklet version of the last hand-off, or null before one. */
  bookmarklet: string | null;
  onLanguage: (language: string | null) => void;
  onTheme: (theme: Theme | null) => void;
  onTextSize: (textSize: number | null) => void;
  onDateOrder: (order: DateOrder | null) => void;
  onOpenWith: (openWith: OpenWith) => void;
  onOpenSetup: () => void;
  onOpenGuide: () => void;
}

const THEME_OPTIONS: Segment<Theme | null>[] = [
  { value: null, id: 'theme-device', label: 'settings.themeDevice' },
  { value: 'light', id: 'theme-light', label: 'settings.themeLight' },
  { value: 'dark', id: 'theme-dark', label: 'settings.themeDark' },
];

/** The id of the radio for a theme, so focus can return to it. */
export function themeId(theme: Theme | null): string {
  return THEME_OPTIONS.find((option) => option.value === theme)!.id;
}

const OPEN_WITH_OPTIONS: Segment<OpenWith>[] = [
  { value: 'me', id: 'open-with-me', label: 'settings.openWithMe' },
  { value: 'last', id: 'open-with-last', label: 'settings.openWithLast' },
];

/** The id of the radio for a "When the app opens" choice, so focus can return to it. */
export function openWithId(openWith: OpenWith): string {
  return OPEN_WITH_OPTIONS.find((option) => option.value === openWith)!.id;
}

function languagePicker(language: string | null, preferred: readonly string[], onLanguage: (language: string | null) => void) {
  const all = languages();
  const device = resolveLanguage(preferred, null);
  const deviceName = all.find((entry) => entry.code === device)?.name ?? device;
  return el(
    'div',
    { class: 'field' },
    el('label', { for: 'language', class: 'label' }, t('settings.language')),
    el(
      'select',
      {
        id: 'language',
        class: 'input',
        onchange: (event) => onLanguage((event.target as HTMLSelectElement).value || null),
      },
      el('option', { value: '', selected: language === null }, t('settings.languageDevice', { language: deviceName })),
      ...all.map(({ code, name }) => el('option', { value: code, lang: code, selected: language === code }, name)),
    ),
  );
}

export const DATE_FORMAT_ID = 'date-format';

const DATE_LABELS: Record<DateOrder, MessageKey> = {
  year: 'settings.dateYear',
  day: 'settings.dateDay',
  month: 'settings.dateMonth',
};

/** Each option shows today in its format, Automatic as the device would show it. */
function datePicker(dateOrder: DateOrder | null, today: PlainDate, onDateOrder: (order: DateOrder | null) => void) {
  const hintId = `${DATE_FORMAT_ID}-hint`;
  return el(
    'div',
    { class: 'field' },
    el('label', { for: DATE_FORMAT_ID, class: 'label' }, t('settings.dateFormat')),
    el(
      'select',
      {
        id: DATE_FORMAT_ID,
        class: 'input',
        'aria-describedby': hintId,
        onchange: (event) => {
          const value = (event.target as HTMLSelectElement).value;
          onDateOrder(DATE_ORDERS.find((order) => order === value) ?? null);
        },
      },
      el('option', { value: '', selected: dateOrder === null }, t('settings.dateAuto', { example: formatDate(today, undefined, null) })),
      ...DATE_ORDERS.map((order) =>
        el('option', { value: order, selected: dateOrder === order }, t(DATE_LABELS[order], { example: formatDate(today, undefined, order) })),
      ),
    ),
    el('p', { id: hintId, class: 'hint' }, t('settings.dateFormatHint')),
  );
}

export const TEXT_SIZE_ID = 'text-size';

/**
 * A slider in whole pixels. While it moves, only its value and the sample
 * line change, so the page does not shift under the finger; the whole app
 * changes when it is let go (or with each arrow key step).
 */
function textSizePicker(textSize: number | null, deviceTextSize: number, onTextSize: (textSize: number | null) => void) {
  const [min, max] = TEXT_SIZES;
  const valueText = (size: number, automatic: boolean) =>
    automatic ? t('settings.textSizeAuto', { size: formatCount(size) }) : formatCount(size);
  const start = sliderValue(textSize, deviceTextSize);
  const value = el('output', { id: `${TEXT_SIZE_ID}-value`, for: TEXT_SIZE_ID, class: 'range-value' }, valueText(start, textSize === null));
  const sample = el('p', { id: `${TEXT_SIZE_ID}-sample`, class: 'text-sample' }, t('settings.textSizeSample'));
  const hintId = `${TEXT_SIZE_ID}-hint`;
  const slider = el('input', {
    id: TEXT_SIZE_ID,
    class: 'range',
    type: 'range',
    min,
    max,
    step: 1,
    value: start,
    'aria-valuetext': valueText(start, textSize === null),
    'aria-describedby': hintId,
    oninput: () => show(Number(slider.value), false),
    onchange: () => onTextSize(Number(slider.value)),
  });
  // CSSOM, which the CSP allows (dom.ts sets no style attribute).
  const show = (size: number, automatic: boolean) => {
    value.textContent = valueText(size, automatic);
    slider.setAttribute('aria-valuetext', value.textContent);
    sample.style.fontSize = `${size}px`;
  };
  show(start, textSize === null);
  return el(
    'div',
    { class: 'field' },
    el('div', { class: 'range-head' }, el('label', { for: TEXT_SIZE_ID, class: 'label' }, t('settings.textSize')), value),
    slider,
    el('p', { id: hintId, class: 'hint hint-tight' }, t('settings.textSizeHint')),
    sample,
    el(
      'button',
      {
        id: `${TEXT_SIZE_ID}-reset`,
        class: 'button button-small',
        type: 'button',
        disabled: textSize === null,
        onclick: () => onTextSize(null),
      },
      t('settings.textSizeReset'),
    ),
  );
}

export function settingsView(props: SettingsProps): HTMLElement {
  const { language, preferred, theme, textSize, deviceTextSize, dateOrder, today, openWith, persistent, bookmarklet } = props;
  const { onLanguage, onTheme, onTextSize, onDateOrder, onOpenWith, onOpenSetup, onOpenGuide } = props;
  return el(
    'section',
    { class: 'view', 'aria-labelledby': 'view-title' },
    // On phones the top bar shows the heading instead, so only one h1 shows.
    el('h1', { id: 'view-title', class: 'wide-only', tabindex: -1 }, t('settings.title')),
    !persistent && el('p', { class: 'warning' }, t('settings.storageUnavailable')),
    languagePicker(language, preferred, onLanguage),
    datePicker(dateOrder, today, onDateOrder),
    segmented('settings.theme', 'theme', THEME_OPTIONS, theme, onTheme),
    textSizePicker(textSize, deviceTextSize, onTextSize),
    segmented('settings.openWith', 'open-with', OPEN_WITH_OPTIONS, openWith, onOpenWith),
    el('h2', {}, t('settings.bookmarklet')),
    bookmarkletStatus(bookmarklet),
    el(
      'button',
      { id: 'open-setup', class: 'button button-block', type: 'button', onclick: onOpenSetup },
      t('settings.openSetup'),
    ),
    el('h2', {}, t('settings.about')),
    el('p', {}, t('app.privacy')),
    el('button', { id: 'open-guide', class: 'button button-block', type: 'button', onclick: onOpenGuide }, t('guide.title')),
    el('p', { id: 'version', class: 'hint' }, t('settings.version', { version: __BUILD_ID__ })),
    supportLink(),
    el('p', { class: 'notice' }, t('app.unofficial')),
  );
}
