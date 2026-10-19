/*
 * Development helper: builds a hand-off link from pdga.com pages saved in a
 * browser, so the import can be tried before the bookmarklet exists.
 *
 *   npm run handoff -- <saved pages...> [--base http://localhost:4173/]
 *
 * It reads only the files given on the command line. Node cannot run src/
 * directly (its imports have no file extensions), so the npm script first
 * bundles this file with Vite into .cache/handoff/.
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { encodeHandoff, type Envelope } from '../src/handoff';
import {
  detectPage,
  extractEvent,
  extractPlayer,
  extractProfileEvents,
  extractRatingsDetails,
  type PageKind,
} from '../src/parsers';

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const base = baseIndex >= 0 ? args.splice(baseIndex, 2)[1] : 'http://localhost:5173/';
if (args.length === 0 || !base) {
  console.error('Usage: npm run handoff -- <saved pdga.com pages...> [--base <app url>]');
  process.exit(1);
}

let page: PageKind | null = null;
const envelope: Envelope = { v: 1, status: 'ok', page: 'unknown', bookmarklet: '0' };
for (const file of args) {
  const doc = new JSDOM(readFileSync(file, 'utf8')).window.document;
  const kind = detectPage(doc);
  page ??= kind;
  if (kind === 'details') {
    envelope.details = extractRatingsDetails(doc);
  } else if (kind === 'profile') {
    envelope.profileEvents = extractProfileEvents(doc);
  } else if (kind === 'event') {
    envelope.events = [...(envelope.events ?? []), extractEvent(doc)];
    continue;
  } else {
    console.error(`${file}: not a pdga.com player, ratings details or event page (${kind})`);
    process.exit(1);
  }
  const player = extractPlayer(doc);
  if (player) envelope.player = player;
}
envelope.page = page ?? 'unknown';

const payload = await encodeHandoff(envelope);
console.log(`${new URL(base).href}#d=${payload}`);
console.error(`${payload.length} characters`);
