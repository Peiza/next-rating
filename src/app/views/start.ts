import { t } from '../../i18n';
import { el } from '../dom';
import { detailsLink, pdgaNumberForm, type PdgaFlash } from './pdga';

export interface StartProps {
  /** Your own PDGA number, for the first step. */
  pdgaNumber: number | null;
  /** The selected player, when it has no imported data yet. Null before any player is stored. */
  player: { pdgaNumber: number; label: string } | null;
  flash: PdgaFlash;
  onSavePdgaNumber: (pdgaNumber: number | null) => void;
  onOpenSetup: () => void;
}

/**
 * The Rating tab while there is no data yet: the steps to get some. Before
 * any player is stored, the first step asks for your own PDGA number; for a
 * player without data, the steps refer to that player.
 */
export function startView({ pdgaNumber, player, flash, onSavePdgaNumber, onOpenSetup }: StartProps): HTMLElement {
  return el(
    'section',
    { class: 'view', 'aria-labelledby': 'view-title' },
    // On phones the top bar shows the heading.
    el('h1', { id: 'view-title', class: 'wide-only' }, player ? player.label : t('app.name')),
    el('p', { class: 'lead' }, player ? t('start.noData') : t('app.tagline')),
    el('h2', {}, t('start.title')),
    el(
      'ol',
      { class: 'steps' },
      !player &&
        el(
          'li',
          { class: 'step' },
          el('p', { class: 'step-title' }, t('start.stepNumber')),
          pdgaNumberForm(pdgaNumber, flash, onSavePdgaNumber),
        ),
      el(
        'li',
        { class: 'step' },
        el('p', { class: 'step-title' }, t('start.stepInstall')),
        el(
          'button',
          { id: 'open-setup', class: 'button button-block', type: 'button', onclick: onOpenSetup },
          t('start.openSetup'),
        ),
      ),
      el(
        'li',
        { class: 'step' },
        el('p', { class: 'step-title' }, player ? t('start.stepOpenPlayer', { player: player.label }) : t('start.stepOpen')),
        detailsLink(player ? player.pdgaNumber : pdgaNumber),
      ),
    ),
    el('p', { class: 'notice' }, t('app.unofficial')),
  );
}
