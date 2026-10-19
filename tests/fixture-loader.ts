import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DetailsRound } from '../src/parsers/types';

/*
 * The fixtures are pdga.com pages saved from a browser, and expected.json
 * holds the values the tests expect from them. Both are local only
 * (git-ignored, see CLAUDE.md), so committed tests never contain their
 * personal data, and fixture tests are skipped when any file is missing.
 */

export type FixtureName = 'details' | 'profile' | 'eventRated' | 'eventUnofficial';

export interface ExpectedEvent {
  eventId: number;
  date: string;
  divisions: number;
  rows: number;
}

export interface Expected {
  files: Record<FixtureName, string>;
  /** The player of the details and profile pages. */
  pdgaNumber: number;
  details: {
    rows: number;
    included: number;
    events: number;
    first: DetailsRound;
    /** An event whose rounds are not 18 holes. */
    otherHoles: { eventId: number; holes: number; rounds: number };
    /** Events with a round labelled "Finals" instead of a number. */
    finals: { eventIds: number[]; round: number };
  };
  profile: { events: number };
  eventRated: ExpectedEvent;
  eventUnofficial: ExpectedEvent & {
    rowsWithoutPdgaNumber: number;
    player: { pdgaNumber: number; ratings: number[] };
  };
}

export interface Fixtures {
  expected: Expected;
  html: Record<FixtureName, string>;
}

// Plain paths: Vite rewrites new URL(..., import.meta.url) into an http URL.
const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function load(): Fixtures | null {
  const expectedFile = join(DIR, 'expected.json');
  if (!existsSync(expectedFile)) return null;
  const expected = JSON.parse(readFileSync(expectedFile, 'utf8')) as Expected;
  const html = {} as Record<FixtureName, string>;
  for (const [name, file] of Object.entries(expected.files) as [FixtureName, string][]) {
    const path = join(DIR, file);
    if (!existsSync(path)) return null;
    html[name] = readFileSync(path, 'utf8');
  }
  return { expected, html };
}

/** The fixtures, or null when they are not available (as in CI). */
export const fixtures = load();
