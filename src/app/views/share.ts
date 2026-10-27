import { t } from '../../i18n';
import { el } from '../dom';
import type { ShareOffer } from '../share';
import { MAX_FAVORITES } from '../storage';

/*
 * Sharing the favorites list as a link, and the question a shared link asks
 * when it is opened.
 */

export const SHARE_BUTTON_ID = 'players-share';
export const SHARE_LINK_ID = 'players-share-link';
export const OFFER_ID = 'share-offer';
export const OFFER_ADD_ID = 'share-offer-add';

/** What the share button did: the link was copied, or the browser let nothing copy it, so it shows to copy by hand. */
export type ShareStatus = { kind: 'copied' } | { kind: 'manual'; link: string } | null;

/** The Share list button on one row after `before` (Edit list), with what it did under it. */
export function shareSection(status: ShareStatus, onShare: () => void, before?: HTMLElement): HTMLElement {
  return el(
    'div',
    { class: 'players-share' },
    el(
      'div',
      { class: 'players-actions' },
      before,
      el(
        'button',
        { id: SHARE_BUTTON_ID, class: 'button button-small', type: 'button', onclick: onShare },
        t('share.button'),
      ),
    ),
    status?.kind === 'copied' && el('p', { class: 'status', role: 'status' }, t('share.copied')),
    status?.kind === 'manual' &&
      el(
        'div',
        { class: 'field' },
        el('label', { class: 'label', for: SHARE_LINK_ID }, t('share.copyLabel')),
        el('input', {
          id: SHARE_LINK_ID,
          class: 'input',
          type: 'text',
          readonly: true,
          value: status.link,
          onfocus: (event) => (event.target as HTMLInputElement).select(),
        }),
      ),
    el('p', { class: 'hint' }, t('share.hint')),
  );
}

/** "#1001, #1002" */
function numberList(numbers: readonly number[]): string {
  return numbers.map((number) => t('rating.playerNumber', { number })).join(', ');
}

/** Asks before a shared link adds anyone. It gets focus when it shows, and Cancel adds no one. */
export function offerView(offer: ShareOffer, onAdd: () => void, onCancel: () => void): HTMLElement {
  return el(
    'div',
    { id: OFFER_ID, class: 'banner banner-info', tabindex: -1, role: 'group', 'aria-labelledby': `${OFFER_ID}-question` },
    el('p', { id: `${OFFER_ID}-question`, class: 'banner-message' }, t('share.question', { count: offer.numbers.length })),
    el('p', {}, numberList(offer.numbers)),
    offer.known > 0 && el('p', {}, t('share.known', { count: offer.known })),
    offer.overflow > 0 && el('p', {}, t('share.overflow', { count: offer.overflow, max: MAX_FAVORITES })),
    el(
      'div',
      { class: 'row' },
      el('button', { id: `${OFFER_ID}-cancel`, class: 'button', type: 'button', onclick: onCancel }, t('share.cancel')),
      el('button', { id: OFFER_ADD_ID, class: 'button button-primary grow', type: 'button', onclick: onAdd }, t('share.add')),
    ),
  );
}
