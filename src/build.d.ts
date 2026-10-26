/** The short commit id of the build, or "dev". Set by `define` in vite.config.ts. */
declare const __BUILD_ID__: string;

/** The UTC day of the build, such as "2026-10-26", or null under Vitest. Set by `define` in vite.config.ts. */
declare const __BUILD_DATE__: string | null;

/** The app's address, which the bookmarklet hands off to. Set by scripts/bookmarklet.ts, only in the bookmarklet build. */
declare const __APP_URL__: string;

/** The built bookmarklet, a javascript: URL. Served by the bookmarklet plugin in vite.config.ts. */
declare module 'virtual:bookmarklet' {
  const bookmarklet: string;
  export default bookmarklet;
}
