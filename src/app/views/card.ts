import { t, type MessageKey } from '../../i18n';
import { el, type Child } from '../dom';
import type { CardName } from '../storage';

/*
 * The one pattern for every section of the Rating tab: a frame around a
 * header and its content. The header is a disclosure button inside a
 * heading, with the title, an optional teaser while closed, and an arrow
 * that turns when the card opens. The content is built only while open.
 */

export interface CardProps {
  name: CardName;
  title: MessageKey;
  open: boolean;
  /** One line under the title while the card is closed, such as the largest effect. */
  teaser?: string | false;
  onToggle: (name: CardName) => void;
}

/** The header button's id, so focus can return to it after a render. */
export function cardToggleId(name: CardName): string {
  return `${name}-toggle`;
}

export function card({ name, title, open, teaser, onToggle }: CardProps, body: () => Child[]): HTMLElement {
  const titleId = `${name}-title`;
  const bodyId = `${name}-body`;
  return el(
    'section',
    { id: name, class: 'card', 'aria-labelledby': titleId },
    el(
      'h2',
      { class: 'card-heading' },
      el(
        'button',
        {
          id: cardToggleId(name),
          class: 'card-toggle',
          type: 'button',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': open ? bodyId : false,
          onclick: () => onToggle(name),
        },
        el(
          'span',
          { class: 'card-label' },
          el('span', { id: titleId, class: 'card-title' }, t(title)),
          !open && teaser && el('span', { class: 'card-teaser' }, teaser),
        ),
        el('span', { class: 'card-arrow', 'aria-hidden': 'true' }),
      ),
    ),
    open && el('div', { id: bodyId, class: 'card-body' }, ...body()),
  );
}

/** The one-line explanation at the top of a card's content. */
export function cardIntro(...children: Child[]): HTMLElement {
  return el('p', { class: 'card-intro' }, ...children);
}
