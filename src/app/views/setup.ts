import { BOOKMARKLET_VERSION } from '../../bookmarklet/version';
import { t, type MessageKey } from '../../i18n';
import { el } from '../dom';

export interface SetupProps {
  /** The bookmarklet, a javascript: URL. */
  bookmarklet: string;
  onBack: () => void;
}

export const SETUP_ID = 'setup-title';
const CODE_ID = 'bookmarklet-code';

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

function instructions(title: MessageKey, steps: MessageKey[]): HTMLElement[] {
  return [
    el('h2', {}, t(title)),
    el('ol', { class: 'instructions' }, ...steps.map((step) => el('li', {}, t(step)))),
  ];
}

/** The bookmarklet code with a copy button, and short steps to install it in each kind of browser. */
export function setupView({ bookmarklet, onBack }: SetupProps): HTMLElement {
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
  return el(
    'section',
    { class: 'view', 'aria-labelledby': SETUP_ID },
    el('h1', { id: SETUP_ID, tabindex: -1 }, t('setup.title')),
    el('p', { class: 'lead' }, t('setup.intro')),
    el('p', {}, t('setup.reads')),
    el('p', { id: 'bookmarklet-version', class: 'hint' }, t('setup.version', { version: BOOKMARKLET_VERSION })),
    el(
      'div',
      { class: 'field' },
      el('label', { for: CODE_ID, class: 'label' }, t('setup.code')),
      code,
    ),
    el('button', { id: 'copy-bookmarklet', class: 'button button-primary button-block', type: 'button', onclick: () => void copy() }, t('setup.copy')),
    status,
    ...instructions('setup.iphone.title', ['setup.stepCopy', 'setup.iphone.bookmark', 'setup.iphone.edit', 'setup.iphone.run']),
    ...instructions('setup.android.title', ['setup.stepCopy', 'setup.android.bookmark', 'setup.android.edit', 'setup.android.run']),
    ...instructions('setup.desktop.title', ['setup.stepCopy', 'setup.desktop.bookmark', 'setup.desktop.run']),
    el('button', { id: 'setup-back', class: 'button button-block', type: 'button', onclick: onBack }, t('setup.back')),
  );
}
