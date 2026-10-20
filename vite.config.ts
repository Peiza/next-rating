import { defineConfig, type Plugin } from 'vitest/config';
import { buildBookmarklet } from './scripts/bookmarklet.ts';
import { serviceWorker } from './scripts/service-worker.ts';

/*
 * The app's address. It is hard-coded in every installed bookmarklet, so it
 * must never change. NEXT_RATING_APP_URL overrides it for local testing
 * only, such as http://localhost:4173/ with `npm run preview`.
 */
const APP_URL = process.env.NEXT_RATING_APP_URL || 'https://peiza.github.io/next-rating/';

/*
 * GitHub Pages cannot send headers, so the policy is a meta tag. It is only
 * added to the build: the dev server injects CSS through inline <style>
 * elements, which this policy blocks. `npm run preview` serves the real one.
 * frame-ancestors is ignored in a meta tag, so it is not listed.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  };
}

const BOOKMARKLET_ID = 'virtual:bookmarklet';

/** Serves the built bookmarklet to the app, rebuilt whenever one of its sources changes. */
function bookmarklet(): Plugin {
  return {
    name: 'bookmarklet',
    resolveId: (source) => (source === BOOKMARKLET_ID ? `\0${BOOKMARKLET_ID}` : undefined),
    async load(id) {
      if (id !== `\0${BOOKMARKLET_ID}`) return undefined;
      const { url, modules } = await buildBookmarklet(APP_URL);
      for (const module of modules) this.addWatchFile(module);
      return `export default ${JSON.stringify(url)};`;
    },
  };
}

/**
 * Shown in Settings, so it is clear which version is live. GitHub Actions
 * sets GITHUB_SHA. Vitest runs with mode "test", where it is always "dev",
 * so tests give the same result locally and in CI.
 */
function buildId(mode: string): string {
  if (mode === 'test') return 'dev';
  return process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev';
}

export default defineConfig(({ mode }) => ({
  // Relative asset paths, so dist/ works on any static host and under any path.
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(buildId(mode)),
  },
  plugins: [contentSecurityPolicy(), bookmarklet(), serviceWorker()],
  build: {
    // Small assets would become data: URIs, which the policy blocks.
    assetsInlineLimit: 0,
    // The polyfill is injected as an inline script.
    modulePreload: { polyfill: false },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
