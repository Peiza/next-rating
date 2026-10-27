/*
 * Helpers for the extract layer, which only reads pages. Validation belongs
 * in the normalize layer.
 */

/** Text content with runs of whitespace, including no-break spaces, collapsed. */
export function cellText(node: Node | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The event id in an href such as "/tour/event/900001#MA1", or "". */
export function eventIdOf(href: string | null | undefined): string {
  return /\/tour\/event\/(\d+)/.exec(href ?? '')?.[1] ?? '';
}

/**
 * Hole counts from the hidden layout tooltips that pdga.com shows when
 * hovering a round, keyed by the "#id" that the round cell refers to.
 * The tooltip text reads like "Course - Layout; 18 holes; Par 60; 2,000 m".
 */
export function tooltipHoles(root: ParentNode): Map<string, string> {
  const holes = new Map<string, string>();
  for (const template of root.querySelectorAll('.tooltip-templates [id]')) {
    holes.set(`#${template.id}`, /(\d+) holes/.exec(template.textContent ?? '')?.[1] ?? '');
  }
  return holes;
}

/**
 * Course and layout names from the same tooltips, such as "Example Park -
 * Main", keyed like tooltipHoles.
 */
export function tooltipLayouts(root: ParentNode): Map<string, string> {
  const layouts = new Map<string, string>();
  for (const template of root.querySelectorAll('.tooltip-templates [id]')) {
    const layout = cellText(template).split(';')[0]!.trim();
    if (layout) layouts.set(`#${template.id}`, layout);
  }
  return layouts;
}

/** The tooltip reference of a cell, for example "#layout-details-900001-MA1-round-1". */
export function tooltipOf(cell: Element | null | undefined): string {
  return cell?.getAttribute('data-tooltip-content') ?? '';
}
