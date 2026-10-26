import { BOOKMARKLET_VERSION } from '../../bookmarklet/version';
import { t } from '../../i18n';
import type { ApiState } from '../api';
import { el } from '../dom';
import { apiConfirm } from './official';
import { detailsLink, nameSearchForm, pdgaNotice, pdgaNumberForm, type PdgaFlash } from './pdga';
import { playerSearchForm, type InAppSearch } from './search';
import { segmented, type Segment } from './segmented';
import { isOlderVersion } from './setup';

/** How the first step finds your PDGA number: typed in, or looked up by name on pdga.com. */
export type StartTab = 'number' | 'name';

export const START_SEARCH_ID = 'start-search';

const TABS: Segment<StartTab>[] = [
  { value: 'number', id: 'start-by-number', label: 'start.byNumber' },
  { value: 'name', id: 'start-by-name', label: 'start.byName' },
];

/** The id of the radio for a tab, so focus can return to it. */
export function startTabId(tab: StartTab): string {
  return TABS.find((option) => option.value === tab)!.id;
}

export interface StartProps {
  /** Your own PDGA number, for the first step. */
  pdgaNumber: number | null;
  /** The selected player, when it has no imported data yet. Null before any player is stored. */
  player: { pdgaNumber: number; label: string } | null;
  flash: PdgaFlash;
  /** The official rating lookup for the selected player, which confirms the number; null or left out when it is off. */
  api?: ApiState | null;
  /** The first step's tab. */
  tab: StartTab;
  onTab: (tab: StartTab) => void;
  onSavePdgaNumber: (pdgaNumber: number | null) => void;
  /** Opens pdga.com's player search. */
  onSearch: (url: string) => void;
  /** The search in the app, when the official lookup is on and the device is online; null searches on pdga.com. */
  search?: InAppSearch | null;
  /** The bookmarklet version of the last hand-off in this browser, or null or left out before one. */
  bookmarklet?: string | null;
  onOpenSetup: () => void;
}

/**
 * The first step: your PDGA number, or a search by name, in the app when it
 * can or on pdga.com, where the PDGA # column shows it.
 */
function numberStep({ pdgaNumber, flash, tab, onTab, onSavePdgaNumber, onSearch, search }: StartProps): HTMLElement {
  return el(
    'li',
    { class: 'step' },
    el('p', { class: 'step-title' }, t('start.stepNumber')),
    segmented('start.findBy', 'start-tab', TABS, tab, onTab, { hideLegend: true }),
    tab === 'number'
      ? pdgaNumberForm(pdgaNumber, flash, onSavePdgaNumber)
      : search
        ? playerSearchForm({ ...search, id: START_SEARCH_ID, label: 'start.searchLabelApi', hint: 'start.searchHintApi' })
        : nameSearchForm(onSearch, { id: START_SEARCH_ID, label: 'start.searchLabel', hint: 'start.searchHint' }),
  );
}

/**
 * The step that opens the setup: install the bookmarklet before any
 * hand-off in this browser, update it when the last one came from an older
 * version, and nothing when it is up to date, so the next step comes first.
 */
function installStep(stored: string | null, onOpenSetup: () => void): HTMLElement | null {
  if (stored !== null && !isOlderVersion(stored)) return null;
  const outdated = stored !== null;
  return el(
    'li',
    { class: 'step' },
    el(
      'p',
      { class: 'step-title' },
      outdated ? t('start.stepUpdate', { version: stored, current: BOOKMARKLET_VERSION }) : t('start.stepInstall'),
    ),
    el(
      'button',
      { id: 'open-setup', class: 'button button-block', type: 'button', onclick: onOpenSetup },
      t(outdated ? 'start.openSetupUpdate' : 'start.openSetup'),
    ),
  );
}

/**
 * The Rating tab while there is no data yet: the steps to get some. Before
 * any player is stored, the first step asks for your own PDGA number; for a
 * player without data, the steps refer to that player. The install step
 * shows only while this browser's bookmarklet is unknown or outdated.
 */
export function startView(props: StartProps): HTMLElement {
  const { pdgaNumber, player, onOpenSetup } = props;
  return el(
    'section',
    { class: 'view', 'aria-labelledby': 'view-title' },
    // On phones the top bar shows the heading.
    el('h1', { id: 'view-title', class: 'wide-only' }, player ? player.label : t('app.name')),
    el('p', { class: 'lead' }, player ? t('start.noData') : t('app.tagline')),
    player && apiConfirm(props.api ?? null, player.pdgaNumber),
    el('h2', {}, t('start.title')),
    el(
      'ol',
      { class: 'steps' },
      !player && numberStep(props),
      installStep(props.bookmarklet ?? null, onOpenSetup),
      el(
        'li',
        { class: 'step' },
        el('p', { class: 'step-title' }, player ? t('start.stepOpenPlayer', { player: player.label }) : t('start.stepOpen')),
        detailsLink(player ? player.pdgaNumber : pdgaNumber),
      ),
    ),
    pdgaNotice(),
  );
}
