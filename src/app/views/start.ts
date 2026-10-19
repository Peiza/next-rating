import { t } from '../../i18n';
import { el } from '../dom';
import { detailsLink, pdgaNumberForm, type PdgaFlash } from './pdga';

export interface StartProps {
  pdgaNumber: number | null;
  flash: PdgaFlash;
  onSavePdgaNumber: (pdgaNumber: number | null) => void;
  onOpenImport: () => void;
}

/** The Rating tab while there is no data yet: the steps to get some. */
export function startView({ pdgaNumber, flash, onSavePdgaNumber, onOpenImport }: StartProps): HTMLElement {
  return el(
    'section',
    { class: 'view', 'aria-labelledby': 'view-title' },
    el('h1', { id: 'view-title' }, t('app.name')),
    el('p', { class: 'lead' }, t('app.tagline')),
    el('h2', {}, t('start.title')),
    el(
      'ol',
      { class: 'steps' },
      el(
        'li',
        { class: 'step' },
        el('p', { class: 'step-title' }, t('start.stepNumber')),
        pdgaNumberForm(pdgaNumber, flash, onSavePdgaNumber),
      ),
      el('li', { class: 'step' }, el('p', { class: 'step-title' }, t('start.stepOpen')), detailsLink(pdgaNumber)),
      el(
        'li',
        { class: 'step' },
        el('p', { class: 'step-title' }, t('start.stepPaste')),
        el(
          'button',
          { id: 'open-import', class: 'button button-block', type: 'button', onclick: onOpenImport },
          t('start.openImport'),
        ),
      ),
    ),
    el('p', { class: 'notice' }, t('app.unofficial')),
  );
}
