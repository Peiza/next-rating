import { t, type MessageKey } from '../../i18n';
import { el, textWithNodes, type Child } from '../dom';
import { GMS_URL } from './top8';

/*
 * "How it works": short sections on what the app does, where the data comes
 * from and the rules it follows. Opened from Settings, and from the card
 * explanations on the Rating tab at the matching section.
 */

export const GUIDE_SECTIONS = ['about', 'data', 'rules', 'rounds', 'xtier', 'why', 'target', 'top8'] as const;
export type GuideSection = (typeof GUIDE_SECTIONS)[number];

export const GUIDE_ID = 'guide-title';

/** The section heading's id, which gets focus when a card opens the guide there. */
export function guideSectionId(section: GuideSection): string {
  return `guide-${section}`;
}

export interface GuideProps {
  onBack: () => void;
}

const RATINGS_GUIDE_URL = 'https://www.pdga.com/ratings/guide';
const UPDATES_URL = 'https://www.pdga.com/faq/ratings/when-updated';

function link(href: string, text: MessageKey): HTMLElement {
  return el('a', { href, rel: 'noreferrer' }, t(text));
}

function paragraph(key: MessageKey, nodes: Record<string, Node> = {}): HTMLElement {
  return el('p', {}, ...textWithNodes(t(key), nodes));
}

/** Each section's title and content, in order. */
const CONTENT: Record<GuideSection, { title: MessageKey; body: () => Child[] }> = {
  about: {
    title: 'guide.about.title',
    body: () => [paragraph('guide.about.text'), el('p', { class: 'notice-inline' }, t('app.unofficial'))],
  },
  data: {
    title: 'guide.data.title',
    body: () => [paragraph('guide.data.bookmarklet'), paragraph('guide.data.device')],
  },
  rules: {
    title: 'guide.rules.title',
    body: () => [
      paragraph('guide.rules.intro', { guide: link(RATINGS_GUIDE_URL, 'guide.rules.guideLink') }),
      el(
        'ul',
        { class: 'guide-list' },
        ...(['guide.rules.window', 'guide.rules.drop', 'guide.rules.double', 'guide.rules.holes', 'guide.rules.dnf'] as const).map(
          (key) => el('li', {}, t(key)),
        ),
      ),
      paragraph('guide.rules.result'),
      paragraph('guide.rules.noNew'),
      paragraph('guide.rules.verified'),
      paragraph('guide.rules.decimals'),
    ],
  },
  rounds: {
    title: 'guide.rounds.title',
    body: () => [
      paragraph('guide.rounds.official'),
      paragraph('guide.rounds.unofficial'),
      paragraph('guide.rounds.manual'),
      paragraph('guide.rounds.deadline', { rule: link(UPDATES_URL, 'guide.rounds.ruleLink') }),
    ],
  },
  xtier: {
    title: 'guide.xtier.title',
    body: () => [
      paragraph('guide.xtier.rule'),
      paragraph('guide.xtier.official'),
      paragraph('guide.xtier.unofficial'),
      paragraph('guide.xtier.top8'),
    ],
  },
  why: {
    title: 'guide.why.title',
    body: () => [paragraph('guide.why.compare'), paragraph('guide.why.net'), paragraph('guide.why.difference')],
  },
  target: {
    title: 'guide.target.title',
    body: () => [paragraph('guide.target.how'), paragraph('guide.target.answers')],
  },
  top8: {
    title: 'guide.top8.title',
    body: () => [paragraph('guide.top8.idea', { gms: link(GMS_URL, 'top8.gms') }), paragraph('guide.top8.rounds')],
  },
};

export function guideView({ onBack }: GuideProps): HTMLElement {
  return el(
    'section',
    { class: 'view guide', 'aria-labelledby': GUIDE_ID },
    el('h1', { id: GUIDE_ID, tabindex: -1 }, t('guide.title')),
    ...GUIDE_SECTIONS.map((section) =>
      el(
        'section',
        { class: 'guide-section', 'aria-labelledby': guideSectionId(section) },
        el('h2', { id: guideSectionId(section), tabindex: -1 }, t(CONTENT[section].title)),
        ...CONTENT[section].body(),
      ),
    ),
    el('button', { id: 'guide-back', class: 'button button-block', type: 'button', onclick: onBack }, t('setup.back')),
  );
}
