import { defineConfig, type Plugin } from 'vitest/config';

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

export default defineConfig({
  // Relative asset paths, so dist/ works on any static host and under any path.
  base: './',
  // Shown in Settings, so it is clear which version is live. GitHub Actions sets GITHUB_SHA.
  define: {
    __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'),
  },
  plugins: [contentSecurityPolicy()],
  build: {
    // Small assets would become data: URIs, which the policy blocks.
    assetsInlineLimit: 0,
    // The polyfill is injected as an inline script.
    modulePreload: { polyfill: false },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
