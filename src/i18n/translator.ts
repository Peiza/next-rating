/*
 * Message lookup without any I/O, so it can be tested with small catalogs.
 * A catalog is a flat map from key to text. Text can hold placeholders such
 * as "{name}". A message that depends on a number has one key per plural
 * category, such as "rounds.one" and "rounds.other".
 */

export type Catalog = Readonly<Record<string, string>>;
export type Params = Readonly<Record<string, string | number>>;

export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

export const PLACEHOLDER = /\{(\w+)\}/g;

function interpolate(text: string, params: Params | undefined): string {
  if (!params) return text;
  return text.replace(PLACEHOLDER, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

function lookup(catalog: Catalog, language: string, key: string, count: number | undefined): string | undefined {
  if (count !== undefined) {
    const category = new Intl.PluralRules(language).select(count);
    const text = catalog[`${key}.${category}`] ?? catalog[`${key}.other`];
    if (text !== undefined) return text;
  }
  return Object.hasOwn(catalog, key) ? catalog[key] : undefined;
}

/**
 * Looks a key up in each language in turn, normally the active language and
 * then English. A numeric `count` parameter selects the plural form. A key
 * that no catalog has comes back as itself.
 */
export function translate(
  chain: readonly (readonly [language: string, catalog: Catalog])[],
  key: string,
  params?: Params,
): string {
  const count = typeof params?.count === 'number' ? params.count : undefined;
  for (const [language, catalog] of chain) {
    const text = lookup(catalog, language, key, count);
    if (text !== undefined) return interpolate(text, params);
  }
  return key;
}

/**
 * The language to show: the override when there is a catalog for it,
 * otherwise the first preferred language with a catalog, matching "sv-SE"
 * to "sv", otherwise the fallback.
 */
export function pickLanguage(
  preferred: readonly string[],
  available: readonly string[],
  override: string | null,
  fallback: string,
): string {
  const codes = new Set(available);
  if (override !== null && codes.has(override)) return override;
  for (const tag of preferred) {
    const lower = tag.toLowerCase();
    if (codes.has(lower)) return lower;
    const base = lower.split('-')[0]!;
    if (codes.has(base)) return base;
  }
  return fallback;
}
