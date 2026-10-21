import { collect, packEnvelope } from './collect';

/*
 * The bookmarklet's entry point, built by scripts/bookmarklet.ts into a
 * self-contained javascript: URL. It shows no text of its own, only a thin
 * progress bar, and always hands off to the app with a status code, so the
 * app shows every message in the user's language. The hand-off navigates
 * this tab, since browsers block window.open after async work.
 */

const BAR_ID = 'next-rating-progress';

async function run(): Promise<void> {
  // A second tap while the first run is still fetching does nothing.
  if (document.getElementById(BAR_ID)) return;
  const bar = document.createElement('div');
  bar.id = BAR_ID;
  // A progress bar goes from 0 to 100 unless it says otherwise. ARIA
  // reflection sets the attributes, as in every browser that runs the hand-off.
  bar.role = 'progressbar';
  // CSSOM, which page Content Security Policies allow, unlike a style attribute.
  // Fixed and empty, it starts 0 wide.
  bar.style.cssText = 'position:fixed;top:0;left:0;height:4px;background:#1a7f37;z-index:2147483647';
  document.body.append(bar);

  let payload = '';
  try {
    const envelope = await collect(document, location.href, {
      fetch: (path) => fetch(path),
      parse: (html) => new DOMParser().parseFromString(html, 'text/html'),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: new Date(),
      progress: (done, planned) => {
        const percent = Math.round((done / planned) * 100);
        // vw, the viewport the fixed bar spans, needs no escape in the URL, unlike %.
        bar.style.width = `${percent}vw`;
        bar.ariaValueNow = `${percent}`;
      },
    });
    payload = await packEnvelope(envelope);
  } catch {
    // Without compression streams, an empty payload makes the app explain
    // that this browser cannot read imports.
  }
  location.assign(`${__APP_URL__}#d=${payload}`);
}

void run();
