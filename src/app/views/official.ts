import type { PlainDate } from '../../engine';
import { t } from '../../i18n';
import { newerOfficial, type ApiPlayer, type ApiState } from '../api';
import { el, textWithNodes } from '../dom';
import { formatDate, formatDateTime, formatRating } from '../format';
import { playerLink } from './pdga';

/*
 * What the official rating lookup (api.ts) adds to the views. It is always
 * quiet: nothing shows while it loads, offline or with the lookup off, and
 * the imported data stays the main view.
 */

export const API_CONFIRM_ID = 'api-confirm';
export const API_NEWER_ID = 'api-newer';
export const API_MEMBERSHIP_ID = 'api-membership';

/** "Name, rating 950 (date)", the name linked to the player's pdga.com profile: confirms a typed number. */
export function apiConfirm(state: ApiState | null, pdgaNumber: number): HTMLElement | false {
  if (state?.kind === 'not-found') {
    return el('p', { id: API_CONFIRM_ID, class: 'status error' }, t('api.notFound', { number: pdgaNumber }));
  }
  if (state?.kind !== 'ok') return false;
  const { player } = state;
  const name = playerLink(pdgaNumber, player.name ?? t('rating.playerNumber', { number: pdgaNumber }));
  const text =
    player.rating !== null && player.ratingDate !== null
      ? t('api.confirm', { name: '{name}', rating: formatRating(player.rating), date: formatDate(player.ratingDate) })
      : t('api.confirmNoRating', { name: '{name}' });
  return el('p', { id: API_CONFIRM_ID, class: 'api-confirm' }, ...textWithNodes(text, { name }));
}

function membershipText(player: ApiPlayer): string {
  const { membership, membershipExpires } = player;
  if (membership === 'current') {
    return membershipExpires
      ? t('api.membership.current', { date: formatDate(membershipExpires) })
      : t('api.membership.currentNoDate');
  }
  if (membership === 'expired' && membershipExpires) return t('api.membership.expired', { date: formatDate(membershipExpires) });
  return t('api.membership.none');
}

/**
 * Under the official line on the Rating tab: a notice when PDGA has
 * published a newer rating than the imported one, the membership with when
 * it was checked, or one muted line when the lookup failed.
 */
export function apiSummary(state: ApiState | null, importedDate: PlainDate | null): (HTMLElement | false)[] {
  if (state?.kind === 'unavailable') return [el('p', { id: 'api-unavailable', class: 'hint' }, t('api.unavailable'))];
  if (state?.kind !== 'ok') return [];
  const { player } = state;
  return [
    newerOfficial(player, importedDate) &&
      el(
        'p',
        { id: API_NEWER_ID, class: 'warning' },
        t('api.newerOfficial', { date: formatDate(player.ratingDate!), rating: formatRating(player.rating!) }),
      ),
    el(
      'p',
      { id: API_MEMBERSHIP_ID, class: 'hint' },
      membershipText(player),
      ' ',
      t('api.checkedAt', { time: formatDateTime(player.fetchedAt) }),
    ),
  ];
}
