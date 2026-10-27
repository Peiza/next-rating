/**
 * A season is a player's results of an earlier year, which the profile links
 * to (/player/<nr>/stats/<year>); the history is the official rating after
 * each update (/player/<nr>/history); the wins are the career wins page
 * (/player/<nr>/wins).
 */
export type PageKind = 'details' | 'profile' | 'season' | 'history' | 'wins' | 'event' | 'challenge' | 'unknown';

/**
 * Tells which kind of pdga.com page a document is, from its URL. Without a
 * URL, the page's canonical link is used. A Cloudflare challenge is
 * recognised by its own markers; "cdn-cgi" is not one of them, since normal
 * pdga.com pages load scripts from there too.
 */
export function detectPage(doc: Document, url?: string): PageKind {
  if (
    /^just a moment/i.test(doc.title.trim()) ||
    doc.querySelector('#challenge-form, script[src*="challenge-platform"]')
  ) {
    return 'challenge';
  }
  const href = url ?? doc.querySelector('link[rel=canonical]')?.getAttribute('href') ?? '';
  const match = /^(?:https?:\/\/(?:www\.)?pdga\.com)?(\/[^?#]*)/i.exec(href);
  const path = match?.[1] ?? '';
  if (/^\/player\/\d+\/details\/?$/.test(path)) return 'details';
  if (/^\/player\/\d+\/?$/.test(path)) return 'profile';
  if (/^\/player\/\d+\/stats\/\d{4}\/?$/.test(path)) return 'season';
  if (/^\/player\/\d+\/history\/?$/.test(path)) return 'history';
  if (/^\/player\/\d+\/wins\/?$/.test(path)) return 'wins';
  if (/^\/tour\/event\/\d+\/?$/.test(path)) return 'event';
  return 'unknown';
}
