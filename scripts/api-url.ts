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

/** The app's policy, which lets the app call the lookup's origin and nothing else. */
export function contentSecurityPolicy(origin: string): string {
  return [
    "default-src 'self'",
    ...(origin ? [`connect-src 'self' ${origin}`] : []),
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
}
