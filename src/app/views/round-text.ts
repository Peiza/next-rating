import { t } from '../../i18n';
import type { ListedRound } from '../../parsers';
import { formatDate } from '../format';
import { isXTier } from '../model';

/*
 * How a round is named in a list, shared by Why it changed and the target
 * calculator's rounds that leave the window.
 */

/** A round number as "Round 2"; a named round such as "Finals" as it is. */
export function roundLabel(label: string): string {
  return /^\d+$/.test(label) ? t('round.number', { number: label }) : label;
}

/** An unofficial round of an X-tier event counts, but PDGA may leave it out (Competition Manual 5.10). */
export function xTierNote(round: ListedRound): string {
  return round.source === 'unofficial' && isXTier(round.tier) ? t('round.xTier') : '';
}

/** "Event · Round 2 · date", leaving out the parts a round does not have. */
export function roundWhere(round: ListedRound): string {
  const parts = [round.eventName, round.roundLabel && roundLabel(round.roundLabel), formatDate(round.date), xTierNote(round)];
  return parts.filter(Boolean).join(' · ');
}
