import type { PlainDate } from '../../engine';
import { languages, resolveLanguage, t, type MessageKey } from '../../i18n';
import { el } from '../dom';
import { formatDate } from '../format';
import { DATE_ORDERS, type DateOrder, type OpenWith, type Theme } from '../storage';
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

export function settingsView(props: SettingsProps): HTMLElement {
  const { language, preferred, theme, dateOrder, today, openWith, persistent, bookmarklet } = props;
  const { onLanguage, onTheme, onDateOrder, onOpenWith, onOpenSetup, onOpenGuide } = props;
  return el(
    'section',
    { class: 'view', 'aria-labelledby': 'view-title' },
    // On phones the top bar shows the heading instead, so only one h1 shows.
    el('h1', { id: 'view-title', class: 'wide-only', tabindex: -1 }, t('settings.title')),
    !persistent && el('p', { class: 'warning' }, t('settings.storageUnavailable')),
    languagePicker(language, preferred, onLanguage),
    datePicker(dateOrder, today, onDateOrder),
    segmented('settings.theme', 'theme', THEME_OPTIONS, theme, onTheme),
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
