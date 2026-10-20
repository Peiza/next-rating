// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { explainChange, predictRating } from '../../src/engine';
import { detailsToRounds, eventToRounds, mergeRounds, parseEvent, parsePlayer, parseRatingsDetails } from '../../src/parsers';
import { fixtures } from '../fixture-loader';
import { parseHtml } from '../parsers/html';

/*
 * The engine must reproduce what pdga.com shows: the Included flag of every
 * round on the ratings details page, and the official rating on the profile.
 */
describe.skipIf(!fixtures)('engine against pdga.com', () => {
  // A skipped suite is still collected, so stop before reading the fixtures.
  if (!fixtures) return;
  const { html, expected } = fixtures;
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

  it('explains a change whose effects add up, from the official rating', () => {
    // The unofficial event's player rounds stand in for new rounds.
    const event = parseEvent(parseHtml(html.eventUnofficial));
    const added = eventToRounds(event, expected.eventUnofficial.player.pdgaNumber);
    const all = mergeRounds(detailsToRounds(rounds), added);
    const after = predictRating(all);
    const explanation = explainChange(all, after)!;

    expect(explanation.before.rating).toBe(player.currentRating);
    expect(explanation.items.filter((item) => item.kind === 'new')).toHaveLength(added.length);
    const sum = explanation.items.reduce((total, item) => total + item.effect, 0);
    expect(Math.abs(sum - explanation.total)).toBeLessThan(1e-9);
  });
});
