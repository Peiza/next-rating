// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readPages } from '../../src/app/handoff';
import {
  collect,
  dateKey,
  keepPlayerRows,
  MAX_EVENT_PAGES,
  isChallenge,
  newEventIds,
  packEnvelope,
  pageHtml,
  pageKind,
  previousSeasonPath,
  REQUEST_GAP,
  type CollectDeps,
} from '../../src/bookmarklet/collect';
import { BOOKMARKLET_VERSION } from '../../src/bookmarklet/version';
import { decodeHandoff, MAX_PAGES, type Envelope } from '../../src/handoff';
import { detectPage } from '../../src/parsers/page';
import {
  detailsRow,
  detailsTable,
  eventDivision,
  eventPage,
  eventRow,
  historyTable,
  layoutTooltip,
  page,
  parseHtml,
  playerHeader,
  profileRow,
  profileTable,
  yearLinks,
} from '../parsers/html';

/* All names, numbers and results here are invented. */

const ORIGIN = 'https://www.pdga.com';
const DETAILS = `${ORIGIN}/player/100001/details`;
const PROFILE = `${ORIGIN}/player/100001`;
const HISTORY_PATH = '/player/100001/history';
const HISTORY = ORIGIN + HISTORY_PATH;
const eventUrl = (id: string) => `${ORIGIN}/tour/event/${id}`;

function detailsHtml(extra = ''): string {
  const tooltip = 'layout-details-900001-MA1-round-1';
  return page(
    playerHeader() +
      detailsTable([detailsRow({ eventId: '900001', date: '1-Aug to 2-Aug-2026', tooltip: `#${tooltip}` })]) +
      layoutTooltip(tooltip, 9) +
      extra,
    DETAILS,
  );
}

function profileHtml(events: [id: string, date: string][]): string {
  return page(playerHeader() + profileTable('MA1', events.map(([id, date]) => profileRow(id, 'MA1', date)).join('')), PROFILE);
}

function eventHtml(id: string, rating = '960'): string {
  return eventPage({
    eventId: id,
    mode: 'live',
    date: '5-Sep-2026',
    body: eventDivision('MA1', [''], [
      eventRow({ name: 'Other Player', pdgaNumber: '100002', rounds: [['50', '990']] }),
      eventRow({ rounds: [['54', rating]] }),
    ]),
  });
}

const historyHtml = page(
  playerHeader() + historyTable([['8-Sep-2026', '950', '20'], ['11-Aug-2026', '947', '18']]),
  HISTORY,
);

type Served = string | Response | Error;

/** Serves the pages, and the history page unless `served` answers it. */
function setup(pages: Record<string, Served>, now = new Date(2026, 9, 12)) {
  const served: Record<string, Served> = { [HISTORY_PATH]: historyHtml, ...pages };
  const requests: string[] = [];
  const waits: number[] = [];
  const progress: [number, number][] = [];
  const deps: CollectDeps = {
    fetch: async (path) => {
      requests.push(path);
      const answer = served[path];
      if (answer instanceof Error) throw answer;
      if (answer instanceof Response) return answer;
      return answer === undefined ? new Response('Not found', { status: 404 }) : new Response(answer);
    },
    parse: parseHtml,
    wait: async (ms) => {
      waits.push(ms);
    },
    progress: (done, planned) => progress.push([done, planned]),
    now,
  };
  return { deps, requests, waits, progress };
}

/** What the app makes of an envelope: through the fragment encoding and the page reader. */
async function received(envelope: Envelope) {
  const decoded = await decodeHandoff(await packEnvelope(envelope));
  return { decoded, ...readPages(decoded.pages ?? []) };
}

const profileWithNewEvent = profileHtml([
  ['900001', '02-Aug-2026'],
  ['900002', '01-Jul-2026'],
  ['900003', '05-Sep-2026'],
]);

describe('bookmarklet on a player page', () => {
  it('sends the ratings details, the profile, new events with only the player\'s rows and the history', async () => {
    const { deps, requests, waits, progress } = setup({
      '/player/100001': profileWithNewEvent,
      '/tour/event/900003': eventHtml('900003'),
    });
    const envelope = await collect(parseHtml(detailsHtml()), DETAILS, deps);

    expect(requests).toEqual(['/player/100001', '/tour/event/900003', HISTORY_PATH]);
    expect(waits).toEqual([REQUEST_GAP, REQUEST_GAP, REQUEST_GAP]);
    expect(progress.at(-1)).toEqual([4, 4]);
    expect(envelope).toMatchObject({ v: 2, status: 'ok', page: 'details', bookmarklet: BOOKMARKLET_VERSION });
    expect(envelope.failed).toBeUndefined();
    expect(envelope.pages!.map(({ url }) => url)).toEqual([DETAILS, PROFILE, eventUrl('900003'), HISTORY]);
    expect(envelope.pages![2]!.html).not.toContain('Other Player');
    expect(envelope.pages![3]!.html).toContain('id="player-results-history"');

    const { parts, owner, unreadable } = await received(envelope);
    expect(owner).toBe(100001);
    expect(unreadable).toEqual([]);
    expect(parts.player?.pdgaNumber).toBe('100001');
    expect(parts.details).toHaveLength(1);
    expect(parts.details![0]!.holes).toBe('9');
    expect(parts.profileEvents).toHaveLength(3);
    expect(parts.events).toHaveLength(1);
    expect(parts.events![0]!.divisions[0]!.rows).toEqual([
      { pdgaNumber: '100001', name: 'Test Player', rounds: [{ score: '54', rating: '960' }] },
    ]);
    expect(parts.history).toEqual([
      { date: '8-Sep-2026', rating: '950', rounds: '20' },
      { date: '11-Aug-2026', rating: '947', rounds: '18' },
    ]);
  });

  it('starts from the profile page just as well', async () => {
    const { deps, requests } = setup({
      '/player/100001/details': detailsHtml(),
      '/tour/event/900003': eventHtml('900003'),
    });
    const envelope = await collect(parseHtml(profileWithNewEvent), PROFILE, deps);
    expect(requests).toEqual(['/player/100001/details', '/tour/event/900003', HISTORY_PATH]);
    expect(envelope.page).toBe('profile');
    expect(envelope.pages!.map(({ url }) => url)).toEqual([PROFILE, DETAILS, eventUrl('900003'), HISTORY]);
  });

  it('keeps the events when only the history fails', async () => {
    const { deps } = setup({
      '/player/100001': profileWithNewEvent,
      '/tour/event/900003': eventHtml('900003'),
      [HISTORY_PATH]: new Response('Server error', { status: 500 }),
    });
    const envelope = await collect(parseHtml(detailsHtml()), DETAILS, deps);
    expect(envelope.status).toBe('partial');
    expect(envelope.failed).toEqual([HISTORY]);
    expect(envelope.pages!.map(({ url }) => url)).toEqual([DETAILS, PROFILE, eventUrl('900003')]);
  });

  it('keeps only the parts the app reads', async () => {
    const html = pageHtml(parseHtml(detailsHtml('<nav>Main menu</nav><script>track()</script>')), 'details');
    expect(html).toContain('id="page-title"');
    expect(html).toContain('class="current-rating"');
    expect(html).toContain('id="player-results-details"');
    expect(html).toContain('class="tooltip-templates"');
    expect(html).not.toContain('Main menu');
    expect(html).not.toContain('<script');
  });

  it('reads round ratings that are hidden behind the toggle', async () => {
    const hidden = eventHtml('900003').replace('<td class="round-rating">960', '<td class="round-rating" hidden>960');
    const envelope = await collect(parseHtml(hidden), eventUrl('900003'), setup({}).deps);
    const { parts } = await received(envelope);
    expect(parts.events![0]!.divisions[0]!.rows[1]!.rounds[0]!.rating).toBe('960');
  });
});

describe('telling pages apart', () => {
  it.each([
    '/player/100001',
    '/player/100001/',
    '/player/100001/details',
    '/player/100001/details/',
    '/player/100001/history',
    '/player/100001/stats/2025',
    '/player/100001/stats/2025/',
    '/player/100001/stats/2025/MPO',
    '/player/100001/stats',
    '/player/100001/wins',
    '/player/100001/Details',
    '/player/abc',
    '/tour/event/900001',
    '/tour/event/900001/',
    '/tour/event/900001/results',
    '/tour/events',
    '/user/login',
    '/',
  ])('tells %s as the app does', (path) => {
    expect(pageKind(path)).toBe(detectPage(parseHtml(page('')), ORIGIN + path));
  });

  it('recognises a challenge as the app does', () => {
    const pages = [
      page('<form id="challenge-form"></form>'),
      page('', '', 'Just a moment...'),
      page('<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>'),
      page('<script src="/cdn-cgi/scripts/email-decode.min.js"></script>'),
      detailsHtml(),
    ];
    for (const html of pages) {
      const doc = parseHtml(html);
      expect(isChallenge(doc)).toBe(detectPage(doc, DETAILS) === 'challenge');
    }
  });
});

describe('picking events', () => {
  const pick = (details: [string, string][], profile: [string, string][]) =>
    newEventIds(
      parseHtml(page(detailsTable(details.map(([eventId, date]) => detailsRow({ eventId, date }))))),
      parseHtml(profileHtml(profile)),
    );

  it('reads pdga.com dates as sortable numbers, ranges by their last day', () => {
    expect(dateKey('6-Aug-2026')).toBe(20260806);
    expect(dateKey('09-May-2026')).toBe(20260509);
    expect(dateKey('30-Dec-2025 to 2-Jan-2026')).toBe(20260102);
    expect(dateKey('Example Open 2026')).toBe(0);
  });

  it('skips events in the details and events before the newest rated round', () => {
    const ids = pick(
      [['900001', '2-Aug-2026'], ['900005', '10-Aug-2026']],
      [['900001', '02-Aug-2026'], ['900002', '01-Jul-2026'], ['900003', '10-Aug-2026'], ['900004', '30-Aug to 1-Sep-2026']],
    );
    expect(ids).toEqual(['900004', '900003']);
  });

  it('lists each event once, newest first, at most 10', () => {
    const profile: [string, string][] = Array.from({ length: 12 }, (_, i) => [String(900100 + i), `${i + 1}-Sep-2026`]);
    const ids = pick([['900001', '2-Aug-2026']], [...profile, ['900111', '12-Sep-2026']]);
    expect(ids).toHaveLength(MAX_EVENT_PAGES);
    expect(ids[0]).toBe('900111');
    expect(new Set(ids).size).toBe(ids.length);
    expect(MAX_PAGES).toBe(MAX_EVENT_PAGES + 4);
  });

  it('takes every season event for a player without rated rounds', () => {
    expect(pick([], [['900002', '01-Jul-2026'], ['900003', '05-Sep-2026']])).toEqual(['900003', '900002']);
  });
});

describe('the previous season in January', () => {
  const SEASON_PATH = '/player/100001/stats/2026';
  const SEASON = ORIGIN + SEASON_PATH;
  const JANUARY = new Date(2027, 0, 5);
  /** The 2027 profile, which lists only 2027 and links to the earlier seasons. */
  const profile2027 = page(
    playerHeader() + yearLinks('100001', 2027, [2026, 2025]) + profileTable('MA1', profileRow('900008', 'MA1', '03-Jan-2027')),
    PROFILE,
  );
  // A December event not rated yet; the details' newest event is from August.
  const season2026 = page(
    playerHeader() +
      yearLinks('100001', 2027, [2026, 2025]) +
      profileTable('MA1', profileRow('900001', 'MA1', '02-Aug-2026') + profileRow('900007', 'MA1', '13-Dec-2026')),
    SEASON,
  );

  it('fetches the previous season from 1 January to the January update when the profile links to it', () => {
    const doc = parseHtml(profile2027);
    expect(previousSeasonPath(doc, '100001', new Date(2027, 0, 1))).toBe(SEASON_PATH);
    // 12 January 2027 is the second Tuesday, the update day.
    expect(previousSeasonPath(doc, '100001', new Date(2027, 0, 12, 23, 59))).toBe(SEASON_PATH);
    expect(previousSeasonPath(doc, '100001', new Date(2027, 0, 13))).toBeNull();
    expect(previousSeasonPath(doc, '100001', new Date(2027, 1, 1))).toBeNull();
    expect(previousSeasonPath(doc, '100001', new Date(2026, 11, 31))).toBeNull();
    // 13 January 2026 was the second Tuesday of that year.
    const doc2026 = parseHtml(page(yearLinks('100001', 2026, [2025]), PROFILE));
    expect(previousSeasonPath(doc2026, '100001', new Date(2026, 0, 13))).toBe('/player/100001/stats/2025');
    expect(previousSeasonPath(doc2026, '100001', new Date(2026, 0, 14))).toBeNull();
  });

  it('fetches nothing more without a link to that season', () => {
    // A new player, or a profile that still shows last season.
    expect(previousSeasonPath(parseHtml(profileWithNewEvent), '100001', JANUARY)).toBeNull();
    expect(previousSeasonPath(parseHtml(page(yearLinks('100001', 2026, [2025]), PROFILE)), '100001', JANUARY)).toBeNull();
    expect(previousSeasonPath(parseHtml(page(yearLinks('100002', 2027, [2026]), PROFILE)), '100001', JANUARY)).toBeNull();
  });

  it('sends the season and picks its new events with the profile\'s', async () => {
    const { deps, requests, waits, progress } = setup(
      {
        '/player/100001': profile2027,
        [SEASON_PATH]: season2026,
        '/tour/event/900008': eventHtml('900008'),
        '/tour/event/900007': eventHtml('900007'),
      },
      JANUARY,
    );
    const envelope = await collect(parseHtml(detailsHtml()), DETAILS, deps);
    expect(requests).toEqual(['/player/100001', SEASON_PATH, '/tour/event/900008', '/tour/event/900007', HISTORY_PATH]);
    expect(waits).toHaveLength(5);
    expect(progress.at(-1)).toEqual([6, 6]);
    expect(envelope.status).toBe('ok');
    expect(envelope.pages!.map(({ url }) => url)).toEqual([
      DETAILS,
      PROFILE,
      SEASON,
      eventUrl('900008'),
      eventUrl('900007'),
      HISTORY,
    ]);
    expect(envelope.pages![2]!.html).not.toContain('year-link');

    const { parts, unreadable } = await received(envelope);
    expect(unreadable).toEqual([]);
    expect(parts.player?.pdgaNumber).toBe('100001');
    expect(parts.profileEvents!.map((event) => event.eventId)).toEqual(['900008', '900001', '900007']);
    expect(parts.events).toHaveLength(2);
  });

  it('fetches no season outside January', async () => {
    const { deps, requests } = setup({ '/player/100001': profile2027, '/tour/event/900008': eventHtml('900008') }, new Date(2027, 0, 13));
    await collect(parseHtml(detailsHtml()), DETAILS, deps);
    expect(requests).toEqual(['/player/100001', '/tour/event/900008', HISTORY_PATH]);
  });

  it('stops at a challenge on the season page', async () => {
    const challenge = new Response('<title>Just a moment...</title>', { status: 403, headers: { 'cf-mitigated': 'challenge' } });
    const { deps, requests } = setup({ '/player/100001': profile2027, [SEASON_PATH]: challenge }, JANUARY);
    const envelope = await collect(parseHtml(detailsHtml()), DETAILS, deps);
    expect(requests).toEqual(['/player/100001', SEASON_PATH]);
    expect(envelope.status).toBe('challenge');
    expect(envelope.failed).toEqual([SEASON, eventUrl('900008'), HISTORY]);
  });

  it('works from the profile page too', async () => {
    const { deps, requests } = setup({ '/player/100001/details': detailsHtml(), [SEASON_PATH]: season2026 }, JANUARY);
    const envelope = await collect(parseHtml(profile2027), PROFILE, deps);
    expect(requests.slice(0, 2)).toEqual(['/player/100001/details', SEASON_PATH]);
    expect(envelope.pages!.map(({ url }) => url).slice(0, 3)).toEqual([PROFILE, DETAILS, SEASON]);
  });
});

describe('stopping', () => {
  it('stops at a Cloudflare challenge and lists the pages it did not read', async () => {
    const challenge = new Response('<title>Just a moment...</title>', { status: 403, headers: { 'cf-mitigated': 'challenge' } });
    const twoNew = profileHtml([['900003', '05-Sep-2026'], ['900004', '06-Sep-2026']]);
    const { deps, requests } = setup({ '/player/100001': twoNew, '/tour/event/900004': challenge });
    const envelope = await collect(parseHtml(detailsHtml()), DETAILS, deps);
    expect(requests).toEqual(['/player/100001', '/tour/event/900004']);
    expect(envelope.status).toBe('challenge');
    expect(envelope.failed).toEqual([eventUrl('900004'), eventUrl('900003'), HISTORY]);
    expect(envelope.pages).toHaveLength(2);
  });

  it('recognises a challenge page without the header', async () => {
    const { deps } = setup({ '/player/100001': page('<form id="challenge-form"></form>', '', 'Just a moment...') });
    const envelope = await collect(parseHtml(detailsHtml()), DETAILS, deps);
    expect(envelope.status).toBe('challenge');
    expect(envelope.failed).toEqual([PROFILE, HISTORY]);
    expect(envelope.pages!.map(({ url }) => url)).toEqual([DETAILS]);
  });

  it.each([
    ['an HTTP error', new Response('Server error', { status: 500 })],
    ['a network error', new TypeError('Failed to fetch')],
  ])('stops after %s with status partial', async (_, answer) => {
    const { deps, requests } = setup({ '/player/100001': answer });
    const envelope = await collect(parseHtml(detailsHtml()), DETAILS, deps);
    expect(requests).toEqual(['/player/100001']);
    expect(envelope.status).toBe('partial');
    expect(envelope.failed).toEqual([PROFILE, HISTORY]);
  });

  it('treats a redirect to another kind of page as a failure', async () => {
    const login = new Response(page('<form id="user-login"></form>'));
    Object.defineProperties(login, { redirected: { value: true }, url: { value: `${ORIGIN}/user/login` } });
    const { deps } = setup({ '/player/100001': login });
    const envelope = await collect(parseHtml(detailsHtml()), DETAILS, deps);
    expect(envelope.status).toBe('partial');
    expect(envelope.failed).toEqual([PROFILE, HISTORY]);
  });
});

describe('other pages', () => {
  it('sends an event page whole, without fetching anything', async () => {
    const { deps, requests } = setup({});
    const envelope = await collect(parseHtml(eventHtml('900003')), eventUrl('900003'), deps);
    expect(requests).toEqual([]);
    expect(envelope).toMatchObject({ status: 'ok', page: 'event' });
    const { parts } = await received(envelope);
    expect(parts.events![0]!.divisions[0]!.rows).toHaveLength(2);
  });

  it('sends the history page alone, without fetching anything', async () => {
    const { deps, requests } = setup({});
    const envelope = await collect(parseHtml(historyHtml), HISTORY, deps);
    expect(requests).toEqual([]);
    expect(envelope).toMatchObject({ status: 'ok', page: 'history' });
    expect(envelope.pages!.map(({ url }) => url)).toEqual([HISTORY]);
    const { parts, owner, unreadable } = await received(envelope);
    expect(owner).toBe(100001);
    expect(unreadable).toEqual([]);
    expect(parts.player?.currentRating).toBe('950');
    expect(parts.history).toHaveLength(2);
    expect(parts.details).toBeUndefined();
  });

  it('sends any other page of a player alone, for an app that can read it later', async () => {
    const { deps, requests } = setup({});
    const wins = `${ORIGIN}/player/100001/wins`;
    const envelope = await collect(parseHtml(page(`${playerHeader()}<script>track()</script><p>Wins</p>`, wins)), `${wins}/`, deps);
    expect(requests).toEqual([]);
    expect(envelope).toMatchObject({ status: 'ok', page: 'unknown' });
    expect(envelope.pages![0]!.url).toBe(wins);
    expect(envelope.pages![0]!.html).toContain('<p>Wins</p>');
    expect(envelope.pages![0]!.html).not.toContain('<script');
    const { unreadable } = await received(envelope);
    expect(unreadable).toEqual([wins]);
  });

  it('reports a challenge page with its address', async () => {
    const doc = parseHtml(page('<form id="challenge-form"></form>', '', 'Just a moment...'));
    const envelope = await collect(doc, `${DETAILS}?__cf_chl_rt_tk=abc`, setup({}).deps);
    expect(envelope).toMatchObject({ status: 'challenge', page: 'challenge', failed: [DETAILS] });
  });

  it.each([`${ORIGIN}/news`, `${ORIGIN}/player/100001/Wins`, `${ORIGIN}/player/100001/stats/2025/MPO`, `${ORIGIN}/players`])(
    'reports %s as unsupported',
    async (url) => {
      const { deps, requests } = setup({});
      const envelope = await collect(parseHtml(page('<h1>News</h1>')), url, deps);
      expect(requests).toEqual([]);
      expect(envelope).toEqual({ v: 2, status: 'unsupported-page', page: 'unknown', bookmarklet: BOOKMARKLET_VERSION });
    },
  );

  it('reports an error when reading the page fails', async () => {
    const { deps } = setup({});
    let calls = 0;
    deps.progress = () => {
      if (calls++ === 0) throw new Error('broken');
    };
    const envelope = await collect(parseHtml(detailsHtml()), DETAILS, deps);
    expect(envelope.status).toBe('error');
  });
});

describe('after a markup change on pdga.com', () => {
  it('sends the whole body without scripts and styles, and leaves the page alone', async () => {
    const changed = detailsHtml('<script>track()</script><style>p { color: red }</style>').replace(
      'id="player-results-details"',
      'id="ratings-table"',
    );
    const doc = parseHtml(changed);
    const { deps, requests } = setup({ '/player/100001': profileWithNewEvent });
    const envelope = await collect(doc, DETAILS, deps);

    // Without a readable details table, no event can be told to be new.
    expect(requests).toEqual(['/player/100001', HISTORY_PATH]);
    const html = envelope.pages![0]!.html;
    expect(html).toContain('<link rel="canonical"');
    expect(html).toContain('id="ratings-table"');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<style');
    expect(doc.querySelectorAll('script, style')).toHaveLength(2);

    // The extractors find the table by its headers, so today's app still reads it.
    const { parts } = await received(envelope);
    expect(parts.details).toHaveLength(1);
  });

  it('leaves event rows alone without PDGA number cells', () => {
    const doc = parseHtml(eventHtml('900003').replaceAll('pdga-number', 'member'));
    keepPlayerRows(doc, '100001');
    expect(doc.querySelectorAll('td.player')).toHaveLength(2);
  });
});

describe('fragment limit', () => {
  /** Text that does not compress, so it keeps its size in the fragment. */
  function noise(length: number, seed: number): string {
    let x = seed;
    return Array.from({ length }, () => {
      x = (x * 1103515245 + 12345) % 2147483648;
      return String.fromCharCode(97 + (x % 26));
    }).join('');
  }

  it('drops event pages from the end, lists them as failed, and keeps the rest', async () => {
    const envelope: Envelope = {
      v: 2,
      status: 'ok',
      page: 'details',
      bookmarklet: BOOKMARKLET_VERSION,
      pages: [
        { url: DETAILS, html: detailsHtml() },
        { url: PROFILE, html: profileWithNewEvent },
        { url: eventUrl('900003'), html: noise(4000, 1) },
        { url: eventUrl('900004'), html: noise(4000, 2) },
      ],
    };
    const payload = await packEnvelope(envelope, 5000);
    expect(payload.length).toBeLessThanOrEqual(5000);
    expect(envelope.pages!.map(({ url }) => url)).toEqual([DETAILS, PROFILE, eventUrl('900003')]);
    expect(envelope.failed).toEqual([eventUrl('900004')]);
    expect(envelope.status).toBe('partial');
    expect((await decodeHandoff(payload)).failed).toEqual([eventUrl('900004')]);
  });

  it('keeps the history after the event pages', async () => {
    const envelope: Envelope = {
      v: 2,
      status: 'ok',
      page: 'details',
      bookmarklet: BOOKMARKLET_VERSION,
      pages: [
        { url: DETAILS, html: detailsHtml() },
        { url: PROFILE, html: profileWithNewEvent },
        { url: eventUrl('900003'), html: noise(4000, 1) },
        { url: eventUrl('900004'), html: noise(4000, 2) },
        { url: HISTORY, html: historyHtml },
      ],
    };
    const payload = await packEnvelope(envelope, 5000);
    expect(payload.length).toBeLessThanOrEqual(5000);
    expect(envelope.pages!.map(({ url }) => url)).toEqual([DETAILS, PROFILE, eventUrl('900003'), HISTORY]);
    expect(envelope.failed).toEqual([eventUrl('900004')]);
  });

  it('never drops the page it ran on', async () => {
    const envelope: Envelope = {
      v: 2,
      status: 'ok',
      page: 'event',
      bookmarklet: BOOKMARKLET_VERSION,
      pages: [{ url: eventUrl('900003'), html: noise(4000, 3) }],
    };
    const payload = await packEnvelope(envelope, 1000);
    expect(payload.length).toBeGreaterThan(1000);
    expect(envelope.pages).toHaveLength(1);
    expect(envelope.status).toBe('ok');
  });
});
