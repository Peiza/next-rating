import { t, type MessageKey } from '../../i18n';
import type { Params } from '../../i18n/translator';
import { el } from '../dom';

/** A message about the latest import, shown above the current view until it is closed. */
export interface Banner {
  message: MessageKey;
  params?: Params;
  tone: 'info' | 'warning' | 'error';
  /** pdga.com pages that could not be fetched. */
  failed?: readonly string[];
  /** The hand-off came from an older bookmarklet. */
  outdated?: boolean;
  /** The import could not be saved, so it lasts only until the page is closed. */
  storageFull?: boolean;
}

export const BANNER_ID = 'import-banner';

function pageLabel(url: string): string {
  if (url.endsWith('/details')) return t('import.page.details');
  const event = /\/tour\/event\/(\d+)$/.exec(url);
  return event ? t('import.page.event', { id: event[1]! }) : t('import.page.profile');
}

/** The banner gets focus after an import, so the message is read out and seen first. */
export function bannerView(banner: Banner, onClose: () => void, onOpenSetup: () => void): HTMLElement {
  const failed = banner.failed ?? [];
  return el(
    'div',
    { id: BANNER_ID, class: `banner banner-${banner.tone}`, tabindex: -1, role: banner.tone === 'info' ? 'status' : 'alert' },
    el('p', { class: 'banner-message' }, t(banner.message, banner.params)),
    failed.length > 0 && el('p', {}, t('import.failed', { count: failed.length })),
    failed.length > 0 &&
      el(
        'ul',
        { class: 'links' },
        ...failed.map((url) =>
          el('li', {}, el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, pageLabel(url))),
        ),
      ),
    banner.storageFull && el('p', {}, t('import.storageFull')),
    banner.outdated && el('p', {}, t('import.outdated')),
    el(
      'div',
      { class: 'row' },
      banner.outdated &&
        el('button', { id: 'banner-setup', class: 'button', type: 'button', onclick: onOpenSetup }, t('import.openSetup')),
      el('button', { id: 'banner-close', class: 'button', type: 'button', onclick: onClose }, t('import.close')),
    ),
  );
}
