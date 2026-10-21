import { BOOKMARKLET_VERSION } from '../../bookmarklet/version';
import { t, type MessageKey } from '../../i18n';
import { el, type Child } from '../dom';
import { detailsLink } from './pdga';
import { segmented, type Segment } from './segmented';

/*
 * The bookmarklet setup: the status of the bookmarklet in this browser, then
 * numbered steps for one kind of browser, picked from the device and
 * switchable, from copying the code to trying it on pdga.com.
 */

export const PLATFORMS = ['iphone', 'android', 'computer'] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface SetupProps {
  /** The bookmarklet, a javascript: URL. */
  bookmarklet: string;
  /** The bookmarklet version of the last hand-off, or null before one. */
  stored: string | null;
  /** Whose ratings details "Try it" opens: your own PDGA number, or null before one is saved. */
  pdgaNumber: number | null;
  platform: Platform;
  onPlatform: (platform: Platform) => void;
  onBack: () => void;
}

export const SETUP_ID = 'setup-title';
const CODE_ID = 'bookmarklet-code';

const PLATFORM_OPTIONS: readonly Segment<Platform>[] = [
  { value: 'iphone', id: 'platform-iphone', label: 'setup.platform.iphone' },
  { value: 'android', id: 'platform-android', label: 'setup.platform.android' },
  { value: 'computer', id: 'platform-computer', label: 'setup.platform.computer' },
];

/** The id of a platform's radio, so focus can return to it. */
export function platformId(platform: Platform): string {
  return PLATFORM_OPTIONS.find((option) => option.value === platform)!.id;
}

/**
 * The kind of browser to show steps for. iPads report themselves as a Mac,
 * so a Mac with a touch screen counts as one; their Safari works like the
 * iPhone's.
 */
export function guessPlatform(userAgent: string, maxTouchPoints: number): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'iphone';
  if (/Android/.test(userAgent)) return 'android';
  return 'computer';
}

/** True when a hand-off came from an older bookmarklet than this app's. */
export function isOlderVersion(version: string, current = BOOKMARKLET_VERSION): boolean {
  const ours = current.split('.').map(Number);
  const theirs = version.split('.').map(Number);
  for (let i = 0; i < Math.max(ours.length, theirs.length); i++) {
    const difference = (theirs[i] ?? 0) - (ours[i] ?? 0);
    if (difference !== 0) return difference < 0;
  }
  return false;
}

/**
 * The bookmarklet installed in this browser, as the last hand-off told it,
 * against this app's: up to date, outdated, or not known before an import.
 */
export function bookmarkletStatus(stored: string | null, current = BOOKMARKLET_VERSION): HTMLElement {
  const outdated = stored !== null && isOlderVersion(stored, current);
  const text =
    stored === null
      ? t('setup.statusNone', { current })
      : outdated
        ? t('setup.statusOutdated', { version: stored, current })
        : t('setup.statusCurrent', { version: stored });
  return el('p', { id: 'bookmarklet-status', class: outdated ? 'warning' : 'hint' }, text);
}

/** The steps after copying, as a title and a line saying how. The last one runs it on pdga.com. */
const STEPS: Record<Platform, [title: MessageKey, how: MessageKey][]> = {
  iphone: [
    ['setup.iphone.bookmarkTitle', 'setup.iphone.bookmark'],
    ['setup.iphone.pasteTitle', 'setup.iphone.paste'],
    ['setup.tryTitle', 'setup.iphone.run'],
  ],
  android: [
    ['setup.android.bookmarkTitle', 'setup.android.bookmark'],
    ['setup.android.pasteTitle', 'setup.android.paste'],
    ['setup.tryTitle', 'setup.android.run'],
  ],
  computer: [
    ['setup.computer.bookmarkTitle', 'setup.computer.bookmark'],
    ['setup.tryTitle', 'setup.computer.run'],
  ],
};

const TITLES: Record<Platform, MessageKey> = {
  iphone: 'setup.iphone.title',
  android: 'setup.android.title',
  computer: 'setup.computer.title',
};

const TROUBLE: MessageKey[] = ['setup.trouble.address', 'setup.trouble.browsers', 'setup.trouble.homeScreen', 'setup.trouble.check'];

function step(title: MessageKey, ...body: Child[]): HTMLElement {
  return el('li', { class: 'step' }, el('p', { class: 'step-title' }, t(title)), ...body);
}

/** Step 1 on every platform: the code with its copy button, which falls back to selecting the text. */
function copyStep(bookmarklet: string): HTMLElement {
  const statusId = `${CODE_ID}-status`;
  const code = el('textarea', {
    id: CODE_ID,
    class: 'input code',
    readonly: true,
    rows: 4,
    spellcheck: 'false',
    'aria-describedby': statusId,
    onfocus: () => code.select(),
  });
  code.value = bookmarklet;
  const status = el('p', { id: statusId, class: 'status', role: 'status' });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      status.textContent = t('setup.copied');
    } catch {
      // No clipboard access, as in some in-app browsers: let the user copy.
      code.focus();
      code.select();
      status.textContent = t('setup.copySelect');
    }
  };
  return step(
    'setup.copyTitle',
    el(
      'button',
      { id: 'copy-bookmarklet', class: 'button button-primary button-block', type: 'button', onclick: () => void copy() },
      t('setup.copy'),
    ),
    status,
    el(
      'div',
      { class: 'field' },
      el('label', { for: CODE_ID, class: 'label' }, t('setup.code')),
      code,
      el('p', { id: 'bookmarklet-version', class: 'hint' }, t('setup.version', { version: BOOKMARKLET_VERSION })),
    ),
  );
}

/** The bookmarklet code with a copy button, and numbered steps to install and try it in the chosen browser. */
export function setupView({ bookmarklet, stored, pdgaNumber, platform, onPlatform, onBack }: SetupProps): HTMLElement {
  const steps = STEPS[platform];
  return el(
    'section',
    { class: 'view', 'aria-labelledby': SETUP_ID },
    // On phones the top bar shows the heading instead, so only one h1 shows.
    el('h1', { id: SETUP_ID, class: 'wide-only', tabindex: -1 }, t('setup.title')),
    bookmarkletStatus(stored),
    el('p', { class: 'lead' }, t('setup.intro')),
    el('p', {}, t('setup.reads')),
    segmented('setup.platform', 'platform', PLATFORM_OPTIONS, platform, onPlatform),
    el('h2', { id: 'setup-steps-title' }, t(TITLES[platform])),
    el(
      'ol',
      { id: 'setup-steps', class: 'steps', 'aria-labelledby': 'setup-steps-title' },
      copyStep(bookmarklet),
      ...steps.map(([title, how], i) =>
        i === steps.length - 1
          ? step(title, el('p', {}, t(how)), detailsLink(pdgaNumber), el('p', { class: 'hint' }, t('setup.tryResult')))
          : step(title, el('p', {}, t(how))),
      ),
    ),
    el(
      'details',
      { id: 'setup-trouble', class: 'trouble' },
      el('summary', {}, t('setup.trouble.title')),
      el('ul', { class: 'links' }, ...TROUBLE.map((key) => el('li', {}, t(key)))),
    ),
    el('button', { id: 'setup-back', class: 'button button-block', type: 'button', onclick: onBack }, t('setup.back')),
  );
}
