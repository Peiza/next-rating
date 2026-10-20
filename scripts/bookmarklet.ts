/*
 * Builds the bookmarklet: src/bookmarklet/main.ts and everything it imports,
 * bundled with the pinned Vite into one minified script, as a javascript:
 * URL. The vite.config.ts plugin serves the result to the app as
 * "virtual:bookmarklet", so no built copy is kept in git.
 */
import { fileURLToPath } from 'node:url';
import { build, type Rolldown } from 'vite';

const ENTRY = fileURLToPath(new URL('../src/bookmarklet/main.ts', import.meta.url));

/** Accepts https, or http on localhost or a LAN address for local testing, ending in "/". */
const APP_URL = /^(?:https:\/\/[^/?#\s]+|http:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(?::\d+)?)\/(?:[^?#\s]*\/)?$/;

export function checkAppUrl(url: string): string {
  if (!APP_URL.test(url)) throw new Error(`The app URL must use https (or http on localhost) and end in "/": ${url}`);
  return url;
}

/**
 * Makes a javascript: URL. The script ends with `void 0`, since a script that
 * ends in a string would replace the page with that string. Browsers
 * percent-decode the URL before running it, so "%" is encoded, and line
 * breaks too, which bookmark fields drop.
 */
export function toBookmarkletUrl(code: string): string {
  const script = `${code.trim().replace(/;$/, '')};void 0`;
  return `javascript:${script.replace(/[%\r\n\t]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)}`;
}

export interface BuiltBookmarklet {
  url: string;
  /** The source files in the bundle, so the dev server can watch them. */
  modules: string[];
}

export async function buildBookmarklet(appUrl: string): Promise<BuiltBookmarklet> {
  const output = (await build({
    configFile: false,
    envFile: false,
    publicDir: false,
    logLevel: 'silent',
    define: { __APP_URL__: JSON.stringify(checkAppUrl(appUrl)) },
    build: {
      write: false,
      minify: true,
      target: 'es2022',
      modulePreload: false,
      rolldownOptions: {
        input: ENTRY,
        output: { format: 'iife' },
      },
    },
  })) as Rolldown.RolldownOutput;
  const chunk = output.output.find((item): item is Rolldown.OutputChunk => item.type === 'chunk');
  if (!chunk) throw new Error('The bookmarklet build produced no script');
  return { url: toBookmarkletUrl(chunk.code), modules: chunk.moduleIds.filter((id) => !id.startsWith('\0')) };
}
