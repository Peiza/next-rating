/*
 * Lists, per translation catalog, the keys that differ from English.
 * Missing keys only warn, since they fall back to English. Extra keys and
 * broken placeholders fail the check.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findIssues } from '../src/i18n/check.ts';

const dir = join(import.meta.dirname, '..', 'src', 'i18n', 'locales');
const read = (file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>;
const english = read('en.json');

let failed = false;
for (const file of readdirSync(dir).filter((name) => name.endsWith('.json') && name !== 'en.json')) {
  const { missing, extra, invalid } = findIssues(english, read(file));
  const list = (label: string, keys: string[]) => {
    if (keys.length > 0) console.log(`  ${label} (${keys.length}):\n${keys.map((key) => `    ${key}`).join('\n')}`);
  };
  console.log(missing.length + extra.length + invalid.length === 0 ? `${file}: complete` : `${file}:`);
  list('missing, shown in English', missing);
  list('not in English', extra);
  list('not text, or placeholders differ from English', invalid);
  if (extra.length > 0 || invalid.length > 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
