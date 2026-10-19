// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyImport } from '../../src/app/import';
import { buildModel } from '../../src/app/model';
import { decodeHandoff, encodeHandoff, MAX_PAYLOAD, type Envelope } from '../../src/handoff';
import {
  extractEvent,
  extractPlayer,
  extractProfileEvents,
  extractRatingsDetails,
  parsePlayer,
} from '../../src/parsers';
import { fixtures } from '../fixture-loader';
import { parseHtml } from '../parsers/html';

/*
 * The whole import path on real pdga.com pages: extract, encode, decode,
 * store and predict. The expected rating is the one the profile page shows.
 */
describe.skipIf(!fixtures)('hand-off from pdga.com pages', () => {
  // A skipped suite is still collected, so stop before reading the fixtures.
  if (!fixtures) return;
  const { expected, html } = fixtures;
  const AT = '2026-10-01T10:00:00.000Z';
  const details = parseHtml(html.details);
  const profile = parseHtml(html.profile);

  const envelope: Envelope = {
    v: 1,
    status: 'ok',
    page: 'details',
    bookmarklet: '0',
    player: extractPlayer(details)!,
    details: extractRatingsDetails(details),
    profileEvents: extractProfileEvents(profile),
  };

  it('fits in the fragment and reproduces the official rating', async () => {
    const payload = await encodeHandoff(envelope);
    expect(payload.length).toBeLessThan(MAX_PAYLOAD);
    const model = buildModel(applyImport(null, await decodeHandoff(payload), AT)!, null);
    const official = parsePlayer(profile)!.currentRating;
    expect(official).not.toBeNull();
    expect(model.prediction.rating).toBe(official);
    expect(model.rows).toHaveLength(expected.details.rows);
  });

  it("adds a player's unofficial rounds from an event page import", async () => {
    const { pdgaNumber, ratings } = expected.eventUnofficial.player;
    const event: Envelope = { v: 1, status: 'ok', page: 'event', bookmarklet: '0', events: [extractEvent(parseHtml(html.eventUnofficial))] };
    const stored = applyImport(null, await decodeHandoff(await encodeHandoff(event)), AT)!;
    const model = buildModel(stored, pdgaNumber);
    expect(model.rows.map(({ round }) => round.rating)).toEqual(ratings);
  });
});
