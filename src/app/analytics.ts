/*
 * Anonymous visit count with Cloudflare Web Analytics: no cookies, no
 * storage, no individual visitors. Loaded only after takeFragment() has
 * removed a hand-off from the address, and with SPA tracking off, so the
 * script only ever sees the plain app address, never the #d= data.
 */
const SCRIPT_URL = 'https://static.cloudflareinsights.com/beacon.min.js';

/** Adds the counting script once; does nothing without a token (dev server, tests, local builds). */
export function startVisitCount(token: string): void {
  if (!token || location.hash !== '' || document.querySelector(`script[src="${SCRIPT_URL}"]`)) return;
  const script = document.createElement('script');
  script.defer = true;
  script.src = SCRIPT_URL;
  script.dataset.cfBeacon = JSON.stringify({ token, spa: false });
  document.head.append(script);
}
