// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { predictRating } from '../../src/engine';
import { detailsToRounds, parsePlayer, parseRatingsDetails } from '../../src/parsers';
import { fixtures } from '../fixture-loader';
import { parseHtml } from '../parsers/html';

/*
 * The engine must reproduce what pdga.com shows: the Included flag of every
 * round on the ratings details page, and the official rating on the profile.
 */
describe.skipIf(!fixtures)('engine against pdga.com', () => {
  // A skipped suite is still collected, so stop before reading the fixtures.
  if (!fixtures) return;
  const { html } = fixtures;
  const { rounds } = parseRatingsDetails(parseHtml(html.details));
  const player = parsePlayer(parseHtml(html.profile))!;
  const prediction = predictRating(detailsToRounds(rounds), { currentRating: player.currentRating });

  it("reproduces PDGA's Included flag for every round", () => {
    const counted = prediction.rounds.map((round) => round.status === 'included' || round.status === 'doubled');
    expect(counted).toEqual(rounds.map((round) => round.included));
  });

  it('reproduces the official rating', () => {
    expect(player.currentRating).not.toBeNull();
    expect(prediction.rating).toBe(player.currentRating);
    expect(prediction.change).toBe(0);
  });
});
