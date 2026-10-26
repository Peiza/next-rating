/*
 * The address of the official rating lookup (worker/), a build-time
 * setting: the NEXT_RATING_API_URL repository variable in CI. Empty turns
 * every lookup off, and the Content Security Policy then allows no other
 * origin.
 */

const LOCAL = /^(?:localhost|127\.0\.0\.1|\[::1\])$/;

/** The origin of the lookup's address, '' when none is set; anything but https (or http on localhost) fails the build. */
export function apiOrigin(value: string | undefined): string {
  const text = value?.trim() ?? '';
  if (text === '') return '';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`NEXT_RATING_API_URL is not a URL: ${text}`);
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL.test(url.hostname));
  if (!secure || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error(`NEXT_RATING_API_URL must be an https origin, such as https://name.example.workers.dev: ${text}`);
  }
  return url.origin;
}

/** Cloudflare Web Analytics: the script's origin and the origin it reports to. */
export const ANALYTICS_SCRIPT_ORIGIN = 'https://static.cloudflareinsights.com';
export const ANALYTICS_REPORT_ORIGIN = 'https://cloudflareinsights.com';

/**
 * The app's policy, which lets the app call the lookup's origin and nothing
 * else, plus Cloudflare Web Analytics' script and report origins when the
 * anonymous visit count is on.
 */
export function contentSecurityPolicy(origin: string, analytics = false): string {
  const connect = [origin, analytics ? ANALYTICS_REPORT_ORIGIN : ''].filter(Boolean);
  return [
    "default-src 'self'",
    ...(analytics ? [`script-src 'self' ${ANALYTICS_SCRIPT_ORIGIN}`] : []),
    ...(connect.length ? [`connect-src 'self' ${connect.join(' ')}`] : []),
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
}
