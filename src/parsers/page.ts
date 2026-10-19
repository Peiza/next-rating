export type PageKind = 'details' | 'profile' | 'event' | 'challenge' | 'unknown';

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
  if (/^\/tour\/event\/\d+\/?$/.test(path)) return 'event';
  return 'unknown';
}
