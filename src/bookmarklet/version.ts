/**
 * The bookmarklet's version, sent with every hand-off. Bump it whenever the
 * code in src/bookmarklet/ changes what it sends, so the app can tell users
 * with an older copy to reinstall it. Parser changes need no bump: the app
 * parses the HTML.
 */
export const BOOKMARKLET_VERSION = '1.1.0';
