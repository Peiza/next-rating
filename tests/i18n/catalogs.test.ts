import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findIssues } from '../../src/i18n/check';
import { languages } from '../../src/i18n';

const DIR = join(import.meta.dirname, '..', '..', 'src', 'i18n', 'locales');
const read = (file: string) => JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Record<string, unknown>;
const english = read('en.json');
const others = readdirSync(DIR).filter((file) => file.endsWith('.json') && file !== 'en.json');

/*
 * Missing keys fall back to English, so only Swedish, which ships with the
 * app, has to be complete. Extra keys and broken placeholders are always
 * errors. `npm run check:i18n` prints the same lists.
 */
describe('translation catalogs', () => {
  it.each(others)('%s has no extra keys or broken placeholders', (file) => {
    const { extra, invalid } = findIssues(english, read(file));
    expect({ extra, invalid }).toEqual({ extra: [], invalid: [] });
  });

  it('Swedish is complete', () => {
    expect(findIssues(english, read('sv.json')).missing).toEqual([]);
  });

  it('every catalog is loaded and names its language', () => {
    const loaded = languages();
    expect(loaded.map((language) => `${language.code}.json`).sort()).toEqual(['en.json', ...others].sort());
    for (const { code, name } of loaded) expect(name, code).not.toBe(code);
  });
});
