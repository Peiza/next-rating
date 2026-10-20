/*
 * Development helper: builds a hand-off link from pdga.com pages saved in a
 * browser, with the HTML the bookmarklet would send, so the import can be
 * tried without running the bookmarklet on pdga.com.
 *
 *   npm run handoff -- <saved pages...> [--base http://localhost:4173/]
 *
 * It reads only the files given on the command line. Node cannot run src/
 * directly (its imports have no file extensions), so the npm script first
 * bundles this file with Vite into .cache/handoff/.
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { pageHtml } from '../src/bookmarklet/collect';
import { BOOKMARKLET_VERSION } from '../src/bookmarklet/version';
import { encodeHandoff, PDGA_PAGE, type Envelope, type HandoffPage } from '../src/handoff';
import { detectPage } from '../src/parsers';

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const base = baseIndex >= 0 ? args.splice(baseIndex, 2)[1] : 'http://localhost:5173/';
if (args.length === 0 || !base) {
  console.error('Usage: npm run handoff -- <saved pdga.com pages...> [--base <app url>]');
  process.exit(1);
}

const pages: HandoffPage[] = [];
const envelope: Envelope = { v: 2, status: 'ok', page: 'unknown', bookmarklet: BOOKMARKLET_VERSION, pages };
for (const file of args) {
  const doc = new JSDOM(readFileSync(file, 'utf8')).window.document;
  const kind = detectPage(doc);
  const url = doc.querySelector('link[rel=canonical]')?.getAttribute('href') ?? '';
  if ((kind !== 'details' && kind !== 'profile' && kind !== 'event') || !PDGA_PAGE.test(url)) {
    console.error(`${file}: not a pdga.com player, ratings details or event page (${kind})`);
    process.exit(1);
  }
  if (envelope.page === 'unknown') envelope.page = kind;
  // Event pages are sent whole, as when the bookmarklet runs on one.
  pages.push({ url, html: pageHtml(doc, kind) });
}

const payload = await encodeHandoff(envelope);
console.log(`${new URL(base).href}#d=${payload}`);
console.error(`${payload.length} characters`);
