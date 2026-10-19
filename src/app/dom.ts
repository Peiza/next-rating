/*
 * The only way the app builds DOM. Text always goes in as text nodes and
 * attributes through setAttribute, so imported data can never become
 * markup. There are no inline styles: the CSP blocks them.
 */

type Handler = (event: Event) => void;
type Attribute = string | number | boolean | null | undefined;
export type Props = Record<string, Attribute | Handler>;
export type Child = Node | string | null | undefined | false;

/** Links may only go to https:// pages. */
function checkHref(href: string): string {
  if (!/^https:\/\//i.test(href)) throw new Error(`Refusing link to ${href}`);
  return href;
}

/**
 * Creates an element. Props starting with "on" add event listeners; true
 * adds an empty attribute; false, null and undefined leave it out.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (typeof value === 'function') {
      if (!name.startsWith('on')) throw new Error(`Handler without "on": ${name}`);
      node.addEventListener(name.slice(2), value);
    } else if (name === 'style') {
      throw new Error('Inline styles are blocked by the CSP');
    } else if (value === true) {
      node.setAttribute(name, '');
    } else if (value !== false && value !== null && value !== undefined) {
      node.setAttribute(name, name === 'href' ? checkHref(String(value)) : String(value));
    }
  }
  node.append(...children.filter((child): child is Node | string => child !== null && child !== undefined && child !== false));
  return node;
}
