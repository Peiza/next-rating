import { t, type MessageKey } from '../../i18n';
import { API_URL } from '../api';
import { el, textWithNodes, type Child } from '../dom';
import { formatCount } from '../format';
import { canStepGuide, displayScale, guideTextSize, nextGuideStep } from '../text-size';
import { pdgaNotice } from './pdga';
import { supportLink } from './support';
import { GMS_URL } from './top8';

/*
 * "How it works": short sections on what the app does, where the data comes
 * from and the rules it follows. Opened from Settings, and from the card
 * explanations on the Rating tab at the matching section.
 */

export const GUIDE_SECTIONS = ['about', 'data', 'rules', 'rounds', 'xtier', 'why', 'chart', 'target', 'top8'] as const;
export type GuideSection = (typeof GUIDE_SECTIONS)[number];

export const GUIDE_ID = 'guide-title';

/** The section heading's id, which gets focus when a card opens the guide there. */
export function guideSectionId(section: GuideSection): string {
  return `guide-${section}`;
}

export interface GuideProps {
  /** The app's text size in CSS pixels: the size picked in Settings, or the device's. */
  baseTextSize: number;
  /** The device's text size, which headings change half as much from (text-size.ts displayScale). */
  deviceTextSize: number;
  /** The pixels A− / A+ have added to this page's text size. */
  textStep: number;
  onTextStep: (step: number) => void;
  onBack: () => void;
}

export const GUIDE_TEXT_ID = 'guide-text';

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
    body: () => [paragraph('guide.about.text'), pdgaNotice('notice-inline')],
  },
  data: {
    title: 'guide.data.title',
    // The online lookup only where the build has one.
    body: () =>
      API_URL === ''
        ? [paragraph('guide.data.bookmarklet'), paragraph('guide.data.device')]
        : [paragraph('guide.data.bookmarklet'), paragraph('api.guide.text'), paragraph('guide.data.deviceApi')],
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
      paragraph('guide.xtier.choose'),
      el(
        'ul',
        { class: 'guide-list' },
        ...(['guide.xtier.late', 'guide.xtier.league', 'guide.xtier.rule'] as const).map((key) => el('li', {}, t(key))),
      ),
      paragraph('guide.xtier.tier'),
      paragraph('guide.xtier.official'),
      paragraph('guide.xtier.top8'),
    ],
  },
  why: {
    title: 'guide.why.title',
    body: () => [paragraph('guide.why.compare'), paragraph('guide.why.net'), paragraph('guide.why.difference')],
  },
  chart: {
    title: 'guide.chart.title',
    body: () => [paragraph('guide.chart.points'), paragraph('guide.chart.lines'), paragraph('guide.chart.read')],
  },
  target: {
    title: 'guide.target.title',
    body: () => [paragraph('guide.target.how'), paragraph('guide.target.answers'), paragraph('guide.target.examples')],
  },
  top8: {
    title: 'guide.top8.title',
    body: () => [paragraph('guide.top8.idea', { gms: link(GMS_URL, 'top8.gms') }), paragraph('guide.top8.rounds')],
  },
};

/**
 * A− / A+ and Reset for this page's text size. They change the page in
 * place, so it is not rebuilt and scroll and focus stay. The toolbar keeps
 * the app's size (styles.css), so the buttons do not move under the finger.
 */
function textTools(page: HTMLElement, props: GuideProps): HTMLElement {
  const { baseTextSize: base, deviceTextSize, onTextStep } = props;
  let step = props.textStep;
  const labelId = `${GUIDE_TEXT_ID}-label`;
  const value = el('output', { id: `${GUIDE_TEXT_ID}-value`, class: 'guide-tools-value' });
  const button = (id: string, text: MessageKey, label: MessageKey | null, onclick: () => void) =>
    el('button', { id: `${GUIDE_TEXT_ID}-${id}`, class: 'button button-small', type: 'button', 'aria-label': label && t(label), onclick }, t(text));
  const smaller = button('smaller', 'guide.textSmaller', 'guide.textSmallerLabel', () => change(nextGuideStep(base, step, -1)));
  const larger = button('larger', 'guide.textLarger', 'guide.textLargerLabel', () => change(nextGuideStep(base, step, 1)));
  const reset = button('reset', 'guide.textReset', null, () => change(0));
  // CSSOM, which the CSP allows (dom.ts sets no style attribute). At step 0 the page follows <html>.
  const show = () => {
    const size = guideTextSize(base, step);
    if (step === 0) {
      page.style.fontSize = '';
      page.style.removeProperty('--display-scale');
    } else {
      page.style.fontSize = `${size}px`;
      // Headings change by half as much, as in the rest of the app.
      page.style.setProperty('--display-scale', String(displayScale(size, deviceTextSize)));
    }
    value.textContent = formatCount(size);
    smaller.disabled = !canStepGuide(base, step, -1);
    larger.disabled = !canStepGuide(base, step, 1);
    reset.disabled = step === 0;
  };
  const change = (next: number) => {
    step = next;
    onTextStep(step);
    show();
    // A button that has just been disabled loses focus: the other size button gets it.
    const focused = document.activeElement;
    if (focused instanceof HTMLButtonElement && focused.disabled) (focused === larger || larger.disabled ? smaller : larger).focus();
  };
  show();
  return el(
    'div',
    { class: 'guide-tools', role: 'group', 'aria-labelledby': labelId },
    el('span', { id: labelId, class: 'guide-tools-label' }, t('guide.textSize')),
    value,
    smaller,
    larger,
    reset,
  );
}

export function guideView(props: GuideProps): HTMLElement {
  const page = el('section', { class: 'view guide', 'aria-labelledby': GUIDE_ID });
  page.append(
    // On phones the top bar shows the heading instead, so only one h1 shows.
    el('h1', { id: GUIDE_ID, class: 'wide-only', tabindex: -1 }, t('guide.title')),
    textTools(page, props),
    ...GUIDE_SECTIONS.map((section) =>
      el(
        'section',
        { class: 'guide-section', 'aria-labelledby': guideSectionId(section) },
        el('h2', { id: guideSectionId(section), tabindex: -1 }, t(CONTENT[section].title)),
        ...CONTENT[section].body(),
      ),
    ),
    supportLink(),
    el('button', { id: 'guide-back', class: 'button button-block', type: 'button', onclick: props.onBack }, t('setup.back')),
  );
  return page;
}
