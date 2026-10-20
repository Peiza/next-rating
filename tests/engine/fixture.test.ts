// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { explainChange, predictRating } from '../../src/engine';
import { detailsToRounds, eventToRounds, mergeRounds, parseEvent, parsePlayer, parseRatingsDetails } from '../../src/parsers';
import { fixturePlayers, fixtures } from '../fixture-loader';
import { parseHtml } from '../parsers/html';
import { DROP_RULES, HOLE_WEIGHTS, ratingFromCounted } from './drop-rules';

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

/*
 * The rule check: for every saved player, which candidate drop rules
 * reproduce PDGA's Included flags, and which hole weights give the official
 * rating from PDGA's own counted rounds. It prints a table and asserts only
 * the rules the engine uses. Players and file names come from expected.json.
 * Vitest hides the output of passing tests, so run
 *   npm test -- tests/engine/fixture.test.ts --silent=false
 * to see the table.
 */
describe.skipIf(!fixtures)('rule check against pdga.com', () => {
  if (!fixtures) return;
  const players = fixturePlayers();
  const table: Record<string, Record<string, string>> = {};

  for (const { label, html } of players) {
    if (!html) {
      table[label] = { pages: 'missing' };
      it.skip(`${label}: pages missing`, () => {});
      continue;
    }
    const details = parseRatingsDetails(parseHtml(html.details)).rounds;
    const official = parsePlayer(parseHtml(html.profile))!.currentRating;
    const rounds = detailsToRounds(details);
    const prediction = predictRating(rounds, { currentRating: official });
    const window = prediction.rounds.flatMap((result, i) => (result.status === 'outside-window' ? [] : [i]));
    const counted = details.flatMap((round, i) => (round.included ? [i] : []));

    const row: Record<string, string> = {};
    const drops: Record<string, boolean> = {};
    for (const [name, rule] of Object.entries(DROP_RULES)) {
      const dropped = rule(rounds, window);
      drops[name] = window.every((i) => dropped.has(i) === !details[i]!.included);
      row[`drop: ${name}`] = drops[name] ? 'match' : 'differs';
    }
    const weights: Record<string, boolean> = {};
    for (const [name, weight] of Object.entries(HOLE_WEIGHTS)) {
      const rating = Math.round(ratingFromCounted(rounds, counted, weight));
      weights[name] = rating === official;
      row[`holes: ${name}`] = weights[name] ? 'official' : 'differs';
    }
    table[label] = row;

    describe(label, () => {
      it("matches PDGA's window (Evaluated flags)", () => {
        expect(prediction.rounds.map((result) => result.status !== 'outside-window')).toEqual(
          details.map((round) => round.evaluated),
        );
      });

      it('reproduces the flags and the official rating with the engine rules', () => {
        expect(drops['leave one out']).toBe(true);
        expect(weights['capped at 18']).toBe(true);
        const included = prediction.rounds.map((result) => result.status === 'included' || result.status === 'doubled');
        expect(included).toEqual(details.map((round) => round.included));
        expect(prediction.rating).toBe(official);
      });
    });
  }

  it('prints the rule table', () => {
    console.table(table);
  });
});
