import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildBookmarklet, checkAppUrl, toBookmarkletUrl } from '../../scripts/bookmarklet';

/*
 * The built bookmarklet, as users paste it into a bookmark. It runs on
 * pdga.com in the user's session, so it may only read page content: a scan
 * of the minified code, where property names stay readable, keeps it away
 * from cookies, storage, form fields and clicks.
 */

const APP_URL = 'https://example.github.io/next-rating/';
const TARGET_BYTES = 5 * 1024;
const FORBIDDEN = ['cookie', 'Storage', 'indexedDB', 'innerText', '.click(', 'window.open', '.value', 'eval', 'Function(', 'import('];

describe('built bookmarklet', async () => {
  const { url, modules } = await buildBookmarklet(APP_URL);
  const code = decodeURIComponent(url.slice('javascript:'.length));

  it(`is a javascript: URL under ${TARGET_BYTES} bytes`, () => {
    console.info(`Bookmarklet: ${url.length} bytes`);
    expect(url.startsWith('javascript:')).toBe(true);
    expect(url.length).toBeLessThan(TARGET_BYTES);
    expect(url).not.toMatch(/[\r\n]/);
  });

  it('is a script that compiles and ends without a value', () => {
    expect(() => new Script(code)).not.toThrow();
    expect(code.endsWith(';void 0')).toBe(true);
  });

  it('hands off to the app URL and bundles no parser', () => {
    expect(code).toContain(`${APP_URL}#d=`);
    expect(modules.some((id) => /parsers\/(?:details|event|player|values)\.ts$/.test(id))).toBe(false);
  });

  it.each(FORBIDDEN)('does not use %s', (token) => {
    expect(code).not.toContain(token);
  });
});

describe('bookmarklet URL', () => {
  it('percent-encodes "%" and line breaks only', () => {
    expect(toBookmarkletUrl('a("50%");\nb()')).toBe('javascript:a("50%25");%0Ab();void 0');
  });

  it.each(['https://peiza.github.io/next-rating/', 'http://localhost:4173/', 'http://192.168.1.20:5173/'])('accepts %s', (url) => {
    expect(checkAppUrl(url)).toBe(url);
  });

  it.each(['http://example.com/', 'https://peiza.github.io/next-rating', 'https://example.com/?x=1#y', 'javascript:alert(1)//'])(
    'rejects %s',
    (url) => {
      expect(() => checkAppUrl(url)).toThrow();
    },
  );
});
