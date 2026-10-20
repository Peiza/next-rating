/**
 * Parses untrusted HTML, pasted or handed off by the bookmarklet, into an
 * inert document: its scripts never run, nothing in it is loaded, and it is
 * never inserted into the page. It is only read through the extractors,
 * which use textContent.
 */
export function parseInert(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}
