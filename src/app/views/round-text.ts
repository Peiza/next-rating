import { t, type MessageKey } from '../../i18n';
import type { ListedRound } from '../../parsers';
import { formatDate } from '../format';
import { isLeague, isXTier, type ListedResult } from '../model';

/*
 * How a round is named in a list, shared by Why it changed and the target
 * calculator's rounds that leave the window.
 */

/** A round number as "Round 2"; a named round such as "Finals" as it is. */
export function roundLabel(label: string): string {
  return /^\d+$/.test(label) ? t('round.number', { number: label }) : label;
}

/**
 * Why the next update may not count an unofficial event, from its tier: an
 * X-tier event may be left out (Competition Manual 5.10), a league counts
 * only once it is finished and reported. '' for any other tier.
 */
export function eventNote(tier: string | undefined): string {
  if (isXTier(tier)) return t('round.xTier');
  if (isLeague(tier)) return t('round.league');
  return '';
}

/** The event note for an unofficial round; official and manual rounds have none. */
export function tierNote(round: ListedRound): string {
  return round.source === 'unofficial' ? eventNote(round.tier) : '';
}

/**
 * The round's status, for the Rounds card and the chart. A round after the
 * following update's deadline too counts in a later update, not the
 * following one.
 */
export function statusKey({ result, later }: ListedResult): MessageKey {
  return later ? 'round.status.later' : `round.status.${result.status}`;
}

/** "Event · Round 2 · date", leaving out the parts a round does not have. */
export function roundWhere(round: ListedRound): string {
  const parts = [round.eventName, round.roundLabel && roundLabel(round.roundLabel), formatDate(round.date), tierNote(round)];
  return parts.filter(Boolean).join(' · ');
}
