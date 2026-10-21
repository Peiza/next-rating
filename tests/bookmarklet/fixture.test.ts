// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readPages } from '../../src/app/handoff';
import { applyImport } from '../../src/app/import';
import { buildModel } from '../../src/app/model';
import { collect, keepPlayerRows, packEnvelope, pageHtml, previousSeasonPath, type CollectDeps } from '../../src/bookmarklet/collect';
import { decodeHandoff, MAX_PAYLOAD } from '../../src/handoff';
import { detectPage, parsePlayer } from '../../src/parsers';
import { fixtures, seasonFixture } from '../fixture-loader';
import { parseHtml } from '../parsers/html';

/*
 * The whole path on real pdga.com pages: the bookmarklet's collection, the
 * fragment encoding, the app's page reader, the stored import and the
 * prediction. The expected rating is the one the profile page shows.
 */
describe.skipIf(!fixtures)('bookmarklet on pdga.com pages', () => {
  // A skipped suite is still collected, so stop before reading the fixtures.
  if (!fixtures) return;
  const { expected, html } = fixtures;
  const AT = '2026-10-01T10:00:00.000Z';
  const base = `https://www.pdga.com/player/${expected.pdgaNumber}`;

  async function fromPayload(payload: string) {
    return readPages((await decodeHandoff(payload)).pages ?? []);
  }

  it('hands off the ratings details and the profile, and reproduces the official rating', async () => {
    const requests: string[] = [];
    const deps: CollectDeps = {
      fetch: async (path) => {
        requests.push(path);
        return path === `/player/${expected.pdgaNumber}` ? new Response(html.profile) : new Response('', { status: 404 });
      },
      parse: parseHtml,
      wait: async () => {},
      progress: () => {},
      now: new Date(AT),
    };
    const envelope = await collect(parseHtml(html.details), `${base}/details`, deps);
    expect(envelope.status).toBe('ok');
    // Every event on the saved profile page is already in the saved details.
    expect(requests).toEqual([`/player/${expected.pdgaNumber}`]);

    const payload = await packEnvelope(envelope);
    console.info(`Hand-off from the ratings details page: ${payload.length} characters`);
    expect(payload.length).toBeLessThan(MAX_PAYLOAD / 4);

    const { parts, owner, unreadable } = await fromPayload(payload);
    expect(unreadable).toEqual([]);
    expect(parts.profileEvents).toHaveLength(expected.profile.events);
    const model = buildModel(applyImport(null, parts, AT, owner!)!, owner!, new Date(AT));
    const official = parsePlayer(parseHtml(html.profile))!.currentRating;
    expect(official).not.toBeNull();
    expect(model.prediction.rating).toBe(official);
    expect(model.rows).toHaveLength(expected.details.rows);
  });

  it("keeps only the player's rows of a fetched event, with their unofficial round ratings", async () => {
    const { pdgaNumber, ratings } = expected.eventUnofficial.player;
    const doc = parseHtml(html.eventUnofficial);
    keepPlayerRows(doc, String(pdgaNumber));
    const url = `https://www.pdga.com/tour/event/${expected.eventUnofficial.eventId}`;
    const { parts } = readPages([{ url, html: pageHtml(doc, 'event') }]);
    const rows = parts.events![0]!.divisions.flatMap((division) => division.rows);
    expect(rows.map((row) => row.pdgaNumber)).toEqual([String(pdgaNumber)]);
    const model = buildModel(applyImport(null, parts, AT, pdgaNumber)!, pdgaNumber, new Date(AT));
    expect(model.rows.map(({ round }) => round.rating)).toEqual(ratings);
  });

  it('hands off a whole event page when run on it', async () => {
    const url = `https://www.pdga.com/tour/event/${expected.eventUnofficial.eventId}`;
    const deps: CollectDeps = { fetch: async () => new Response(''), parse: parseHtml, wait: async () => {}, progress: () => {}, now: new Date(AT) };
    const payload = await packEnvelope(await collect(parseHtml(html.eventUnofficial), url, deps));
    console.info(`Hand-off from an event page: ${payload.length} characters`);
    const { parts } = await fromPayload(payload);
    const event = parts.events![0]!;
    expect(event.eventId).toBe(String(expected.eventUnofficial.eventId));
    expect(event.status).toBe('unofficial');
    expect(event.divisions).toHaveLength(expected.eventUnofficial.divisions);
    expect(event.divisions.flatMap((division) => division.rows)).toHaveLength(expected.eventUnofficial.rows);
  });
});

describe.skipIf(!fixtures)('the previous season on pdga.com pages', () => {
  if (!fixtures) return;
  const { expected, html } = fixtures;

  it("finds the link to the previous season on the profile's season tabs", () => {
    const profile = parseHtml(html.profile);
    const current = Number(profile.querySelector('.year-link a.active')?.textContent);
    expect(current).toBeGreaterThan(2000);
    const path = previousSeasonPath(profile, String(expected.pdgaNumber), new Date(current, 0, 5));
    expect(path).toBe(`/player/${expected.pdgaNumber}/stats/${current - 1}`);
    expect(previousSeasonPath(profile, String(expected.pdgaNumber), new Date(current, 1, 1))).toBeNull();
  });

  const season = seasonFixture();
  it.skipIf(!season)('reads the events of a saved previous-season page', () => {
    const { year, events, html: seasonHtml } = season!;
    const url = `https://www.pdga.com/player/${expected.pdgaNumber}/stats/${year}`;
    const doc = parseHtml(seasonHtml);
    expect(detectPage(doc, url)).toBe('season');
    const { parts, unreadable } = readPages([{ url, html: pageHtml(doc, 'season') }]);
    expect(unreadable).toEqual([]);
    expect(parts.profileEvents).toHaveLength(events);
    expect(parts.profileEvents!.every((event) => event.date.includes(String(year)))).toBe(true);
    expect(parts.profileEvents!.every((event) => event.tier !== '')).toBe(true);
  });

  it.skipIf(!season)('fetches and sends the saved previous season in January, cut to its results tables', async () => {
    const { year, events, html: seasonHtml } = season!;
    const seasonPath = `/player/${expected.pdgaNumber}/stats/${year}`;
    const requests: string[] = [];
    const deps: CollectDeps = {
      fetch: async (path) => {
        requests.push(path);
        if (path === `/player/${expected.pdgaNumber}`) return new Response(html.profile);
        return path === seasonPath ? new Response(seasonHtml) : new Response('', { status: 404 });
      },
      parse: parseHtml,
      wait: async () => {},
      progress: () => {},
      now: new Date(year + 1, 0, 5),
    };
    const envelope = await collect(parseHtml(html.details), `https://www.pdga.com/player/${expected.pdgaNumber}/details`, deps);
    expect(envelope.status).toBe('ok');
    // Every event of the saved seasons is older than the newest rated round or already rated.
    expect(requests).toEqual([`/player/${expected.pdgaNumber}`, seasonPath]);
    const sent = envelope.pages!.find(({ url }) => url.endsWith(seasonPath))!;
    // The season selector found the results tables, so the page is not sent whole.
    expect(sent.html).toContain('id="player-results-');
    expect(sent.html).not.toContain('year-link');
    expect(sent.html.length).toBeLessThan(seasonHtml.length / 2);

    const { parts, unreadable } = readPages((await decodeHandoff(await packEnvelope(envelope))).pages ?? []);
    expect(unreadable).toEqual([]);
    expect(parts.profileEvents).toHaveLength(expected.profile.events + events);
  });
});
