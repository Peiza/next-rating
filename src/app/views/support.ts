import { t } from '../../i18n';
import { el, textWithNodes } from '../dom';

export const KOFI_URL = 'https://ko-fi.com/peiza';

/** A plain link to support the app on Ko-fi, opened in the same tab like the pdga.com links. No Ko-fi script or widget. */
export function supportLink(): HTMLElement {
  const link = el('a', { href: KOFI_URL, rel: 'noreferrer' }, t('support.link'));
  return el('p', {}, ...textWithNodes(t('support.text'), { link }));
}
