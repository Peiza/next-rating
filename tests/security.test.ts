import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Imported data is untrusted and only ever rendered as text. These APIs turn
 * strings into markup or code, so none of them may appear in the source.
 */

const SRC = join(import.meta.dirname, '..', 'src');
const FORBIDDEN = [
  /\.innerHTML\b/,
  /\.outerHTML\b/,
  /\binsertAdjacentHTML\b/,
  /\bdocument\.write(?:ln)?\b/,
  /\beval\s*\(/,
  /\bnew\s+Function\b/,
  /\bcreateContextualFragment\b/,
  /\bsrcdoc\b/,
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(?:ts|js|html)$/.test(entry.name) ? [path] : [];
  });
}

describe('source code', () => {
  it('never turns strings into markup or code', () => {
    const hits = files(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          FORBIDDEN.some((pattern) => pattern.test(line)) ? [`${relative(SRC, file)}:${i + 1}: ${line.trim()}`] : [],
        ),
    );
    expect(hits).toEqual([]);
  });
});
