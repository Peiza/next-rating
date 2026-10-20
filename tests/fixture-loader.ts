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

/** A player's saved ratings details and profile pages, for the rule check. */
export interface FixturePlayer {
  /** A label without personal data, such as "own" or "other2". */
  label: string;
  details: string;
  profile: string;
}

export interface Expected {
  files: Record<FixtureName, string>;
  /** Players for the rule check, own player included. */
  players?: FixturePlayer[];
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

export interface LoadedPlayer {
  label: string;
  /** Null when either page is missing, so the player is reported as missing, not failed. */
  html: { details: string; profile: string } | null;
}

/** The rule-check players from expected.json, with their pages when both are saved. */
export function fixturePlayers(): LoadedPlayer[] {
  return (fixtures?.expected.players ?? []).map(({ label, details, profile }) => {
    const paths = [join(DIR, details), join(DIR, profile)];
    if (!paths.every((path) => existsSync(path))) return { label, html: null };
    const [detailsHtml, profileHtml] = paths.map((path) => readFileSync(path, 'utf8'));
    return { label, html: { details: detailsHtml!, profile: profileHtml! } };
  });
}
