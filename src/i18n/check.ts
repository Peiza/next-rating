/*
 * Compares a translation catalog with the English one. Used by
 * `npm run check:i18n` and by the tests, so it imports nothing: Node runs
 * the script directly, without a bundler.
 */

type Catalog = Readonly<Record<string, unknown>>;

export interface CatalogIssues {
  /** English keys the catalog lacks; these show in English. */
  missing: string[];
  /** Keys English does not have, usually a typo or a removed message. */
  extra: string[];
  /** Keys whose text is not a string, or uses a placeholder English does not have. */
  invalid: string[];
}

const PLURAL = /^(.+)\.(zero|one|two|few|many|other)$/;

function placeholders(text: string): Set<string> {
  return new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!));
}

/** Plural keys grouped by their base key, so "rounds.one" and "rounds.other" count as "rounds". */
function groups(catalog: Catalog): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const key of Object.keys(catalog)) {
    const base = PLURAL.exec(key)?.[1] ?? key;
    result.set(base, [...(result.get(base) ?? []), key]);
  }
  return result;
}

/**
 * Languages have different plural categories: Swedish needs "one" and
 * "other", other languages need "few" or "many" too. So a plural message is
 * complete when it has an "other" form, and any category is allowed.
 */
export function findIssues(english: Catalog, catalog: Catalog): CatalogIssues {
  const issues: CatalogIssues = { missing: [], extra: [], invalid: [] };
  const englishGroups = groups(english);
  const catalogGroups = groups(catalog);

  for (const [base, keys] of englishGroups) {
    const own = catalogGroups.get(base);
    const plural = keys.some((key) => key !== base);
    if (!own) issues.missing.push(...keys);
    else if (plural && !own.includes(`${base}.other`)) issues.missing.push(`${base}.other`);
  }

  for (const [base, keys] of catalogGroups) {
    const englishKeys = englishGroups.get(base);
    if (!englishKeys) {
      issues.extra.push(...keys);
      continue;
    }
    const allowed = new Set(englishKeys.flatMap((key) => [...placeholders(String(english[key]))]));
    for (const key of keys) {
      const text = catalog[key];
      const plural = key !== base;
      if (typeof text !== 'string' || (plural !== englishKeys.some((k) => k !== base))) {
        issues.invalid.push(key);
        continue;
      }
      const used = placeholders(text);
      const unknown = [...used].some((name) => !allowed.has(name));
      // A plural form may leave out {count}, as in "one round"; other text must keep every placeholder.
      const dropped = !plural && [...allowed].some((name) => !used.has(name));
      if (unknown || dropped) issues.invalid.push(key);
    }
  }
  return issues;
}
