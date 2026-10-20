import { describe, expect, it } from 'vitest';
import { explainChange, type Explanation } from '../../src/engine/explain';
import { officialState, predictRating } from '../../src/engine/rating';
import type { RoundInput } from '../../src/engine/types';

let nextId = 0;

/** A one-round official event unless an eventKey is given. */
function official(rating: number, date: string, extra: Partial<RoundInput> = {}): RoundInput {
  nextId += 1;
  return { id: `r${nextId}`, rating, date, eventKey: `e${nextId}`, source: 'official', ...extra };
}

/** A round that is not in the last official update. */
function fresh(rating: number, date: string, extra: Partial<RoundInput> = {}): RoundInput {
  return official(rating, date, { source: 'unofficial', ...extra });
}

/** One official round per week, newest first, ending on `latest`. */
function weekly(ratings: number[], latest = '2026-06-25'): RoundInput[] {
  const end = Date.parse(`${latest}T00:00:00Z`);
  return ratings.map((rating, i) =>
    official(rating, new Date(end - i * 7 * 86_400_000).toISOString().slice(0, 10)),
  );
}

/** Explains `rounds` and checks that the effects add up to the change. */
function explain(rounds: RoundInput[]): Explanation {
  const after = predictRating(rounds);
  const explanation = explainChange(rounds, after)!;
  expect(explanation).not.toBeNull();
  expect(explanation.total).toBeCloseTo(after.exact! - explanation.before.exact!, 9);
  const sum = explanation.items.reduce((total, item) => total + item.effect, 0);
  expect(Math.abs(sum - explanation.total)).toBeLessThan(1e-9);
  return explanation;
}

function itemOf(explanation: Explanation, round: RoundInput) {
  return explanation.items.find((item) => item.id === round.id);
}

describe('rounds the user left out', () => {
  it('lists them as new rounds with no effect, so the effects still add up', () => {
    const rounds = [fresh(1050, '2026-07-02', { eventKey: 'x' }), fresh(955, '2026-07-02'), ...weekly([950, 960, 940])];
    const after = predictRating(rounds, { leaveOut: new Set(['x']) });
    const explanation = explainChange(rounds, after)!;
    expect(itemOf(explanation, rounds[0]!)).toMatchObject({ kind: 'new', after: 'left-out', effect: 0 });
    const sum = explanation.items.reduce((total, item) => total + item.effect, 0);
    expect(Math.abs(sum - explanation.total)).toBeLessThan(1e-9);
  });
});

describe('explainChange', () => {
  it('returns null without official rounds', () => {
    const rounds = [fresh(950, '2026-08-01')];
    expect(explainChange(rounds, predictRating(rounds))).toBeNull();
  });

  it('lists nothing when only official rounds exist', () => {
    const rounds = weekly([950, 960, 940, 970, 930, 950, 960, 940, 950, 955]);
    const explanation = explain(rounds);
    expect(explanation.items).toEqual([]);
    expect(explanation.total).toBe(0);
  });

  it('leaves out rounds after the report deadline, which wait for the following update', () => {
    const before = fresh(1000, '2026-07-05');
    const later = fresh(1000, '2026-07-06');
    const rounds = [later, before, ...weekly([950, 960, 940, 970, 930, 950, 960, 940, 950, 955])];
    const after = predictRating(rounds, { deadline: '2026-07-05' });
    const explanation = explainChange(rounds, after)!;
    const ids = explanation.items.map((item) => item.id);
    expect(ids).toContain(before.id);
    expect(ids).not.toContain(later.id);
    const sum = explanation.items.reduce((total, item) => total + item.effect, 0);
    expect(sum).toBeCloseTo(explanation.total, 9);
  });

  it('lets a 985 round that stops counting twice outweigh a new 938 round', () => {
    // 13 counted rounds double the newest 4; 14 still double 4, so the new
    // round pushes the 985 round out of the double-weighted ones.
    const old = weekly([940, 945, 940, 985, 940, 945, 940, 945, 940, 945, 940, 945, 940]);
    const high = old[3]!;
    const added = fresh(938, '2026-09-03');
    const explanation = explain([...old, added]);

    expect(explanation.items.map((item) => item.id)).toEqual([high.id, added.id]);
    const [first, second] = explanation.items;
    expect(first).toMatchObject({ kind: 'stopped-doubling', rating: 985, before: 'doubled', after: 'included' });
    expect(second).toMatchObject({ kind: 'new', rating: 938, before: null, after: 'doubled' });
    expect(first!.effect).toBeLessThan(second!.effect);
    expect(second!.effect).toBeLessThan(0);
  });

  it('lists a round that left the window', () => {
    const old = official(990, '2025-09-10');
    const rounds = [...weekly([950, 945, 955, 950, 945, 955, 950, 945]), old];
    const explanation = explain([fresh(950, '2026-10-01'), ...rounds]);
    expect(itemOf(explanation, old)).toMatchObject({
      kind: 'left-window',
      before: 'included',
      after: 'outside-window',
    });
    expect(itemOf(explanation, old)!.effect).toBeLessThan(0);
  });

  it('lists a round that entered the window through the 24-month fallback', () => {
    const dates = ['2026-01-01', '2025-12-01', '2025-11-01', '2025-10-01', '2025-08-01', '2025-06-01', '2025-04-01', '2025-02-01'];
    const rounds = dates.map((date, i) => official(i % 2 ? 945 : 955, date));
    const old = official(960, '2024-12-01');
    const explanation = explain([fresh(950, '2026-09-01'), ...rounds, old]);
    expect(predictRating([...rounds, old]).stats.windowMonths).toBe(12);
    expect(itemOf(explanation, old)).toMatchObject({ kind: 'entered-window', before: 'outside-window' });
  });

  it('lists rounds that start counting twice', () => {
    const rounds = weekly([980, 920, 970, 930, 960, 940, 950, 950]);
    const explanation = explain([fresh(950, '2026-09-03'), ...rounds]);
    // 9 counted rounds double 3: the new one and the two newest official ones.
    expect(itemOf(explanation, rounds[0]!)).toMatchObject({ kind: 'started-doubling', after: 'doubled' });
    expect(itemOf(explanation, rounds[0]!)!.effect).toBeGreaterThan(0);
    expect(itemOf(explanation, rounds[1]!)).toMatchObject({ kind: 'started-doubling' });
    expect(itemOf(explanation, rounds[1]!)!.effect).toBeLessThan(0);
    expect(itemOf(explanation, rounds[2]!)).toBeUndefined();
  });

  it('doubles the highest rounds of the event on the boundary', () => {
    const event = { eventKey: 'boundary' };
    const newest = [official(940, '2026-06-25', event), official(990, '2026-06-25', event), official(960, '2026-06-25', event)];
    const rounds = [...newest, ...weekly([950, 955, 945, 950, 950], '2026-06-18')];
    const explanation = explain([fresh(950, '2026-09-03'), ...rounds]);
    expect(itemOf(explanation, newest[1]!)).toMatchObject({ kind: 'started-doubling' });
    expect(itemOf(explanation, newest[2]!)).toMatchObject({ kind: 'started-doubling' });
    expect(itemOf(explanation, newest[0]!)).toBeUndefined();
  });

  it('lists a round that a new round pushes below the drop limit', () => {
    // 6 official rounds are too few to drop any; the new round makes 7.
    const low = official(900, '2026-07-01');
    const rounds = [...weekly([950, 950, 950, 950, 950]), low];
    const explanation = explain([fresh(960, '2026-09-03'), ...rounds]);
    expect(itemOf(explanation, low)).toMatchObject({ kind: 'newly-dropped', before: 'included', after: 'dropped' });
    // Dropping a low round raises the rating.
    expect(itemOf(explanation, low)!.effect).toBeGreaterThan(0);
  });

  it('lists a previously dropped round that counts again', () => {
    const low = official(895, '2026-05-01');
    const rounds = [...weekly([950, 950, 950, 950, 950, 950, 960]), low];
    const explanation = explain([fresh(860, '2026-09-03'), ...rounds]);
    expect(explanation.before.rounds.find((result) => result.id === low.id)!.status).toBe('dropped');
    expect(itemOf(explanation, low)).toMatchObject({ kind: 'no-longer-dropped', before: 'dropped' });
    expect(itemOf(explanation, low)!.effect).toBeLessThan(0);
  });

  it('weighs a 9-hole round at half an 18-hole round', () => {
    const rounds = weekly([950, 955, 945, 950]);
    const nine = fresh(990, '2026-09-03', { holes: 9 });
    const eighteen = fresh(990, '2026-09-03');
    const explanation = explain([nine, eighteen, ...rounds]);
    expect(itemOf(explanation, nine)!.effect).toBeCloseTo(itemOf(explanation, eighteen)!.effect / 2, 9);
  });

  it('lists a new round that is dropped with no effect, and leaves out a new DNF round', () => {
    const rounds = weekly([950, 955, 945, 950, 950, 955, 945, 950]);
    const dropped = fresh(700, '2026-09-03');
    const dnf = fresh(0, '2026-09-03', { rating: null, dnf: true });
    const explanation = explain([dropped, dnf, ...rounds]);
    expect(itemOf(explanation, dropped)).toMatchObject({ kind: 'new', after: 'dropped', effect: 0 });
    expect(itemOf(explanation, dnf)).toBeUndefined();
    expect(explanation.items.at(-1)!.id).toBe(dropped.id);
  });

  it('puts new rounds first among equal effects', () => {
    const rounds = weekly([950, 950, 950]);
    const a = fresh(950, '2026-09-03');
    const b = fresh(950, '2026-09-04');
    const explanation = explain([b, a, ...rounds]);
    expect(explanation.items.map((item) => item.id)).toEqual([b.id, a.id]);
  });
});

/** Official rounds with PDGA's flags, as from the ratings details page. */
function flagged(rounds: RoundInput[], included = true, evaluated = true): RoundInput[] {
  return rounds.map((round) => ({ ...round, pdga: { evaluated, included } }));
}

describe('officialState', () => {
  it("uses PDGA's round set, also where the rules would decide otherwise", () => {
    // The rules would drop the 700, but PDGA counted it.
    const rounds = flagged(weekly([950, 950, 950, 950, 950, 950, 700]));
    const state = officialState(rounds);
    expect(state.fromFlags).toBe(true);
    expect(state.exact).toBeCloseTo((950 * 6 + 700) / 7, 9);
    expect(state.rounds.at(-1)).toMatchObject({ status: 'included', weight: 1 });
    expect(predictRating(rounds).exact).toBe(950);
  });

  it('marks evaluated rounds PDGA left out as dropped and the others as outside the window', () => {
    const counted = flagged(weekly([950, 960, 940]));
    const dropped = flagged([official(800, '2026-05-01')], false);
    const old = flagged([official(990, '2024-05-01')], false, false);
    const state = officialState([...counted, ...dropped, ...old]);
    expect(state.rounds.map((result) => result.status)).toEqual(['included', 'included', 'included', 'dropped', 'outside-window']);
    expect(state.exact).toBe(950);
  });

  it('marks a round PDGA did not evaluate inside its window as excluded, and explains nothing about it', () => {
    const counted = flagged(weekly([950, 960, 940]));
    const xTier = flagged([official(1050, '2026-05-01')], false, false);
    const rounds = [...counted, ...xTier];
    expect(officialState(rounds).rounds.at(-1)).toMatchObject({ status: 'excluded', weight: 0 });
    expect(itemOf(explain([fresh(955, '2026-07-02'), ...rounds]), xTier[0]!)).toBeUndefined();
  });

  it('applies the double-weight rule and hole weights on top', () => {
    const rounds = flagged(weekly([1000, 990, 980, 970, 960, 950, 940, 930, 920]));
    rounds[1] = { ...rounds[1]!, holes: 9 };
    const state = officialState(rounds);
    expect(state.rounds.slice(0, 4).map((result) => [result.status, result.weight])).toEqual([
      ['doubled', 2],
      ['doubled', 1],
      ['doubled', 2],
      ['included', 1],
    ]);
    // (2 * 1000 + 990 + 2 * 980 + 970 + 960 + 950 + 940 + 930 + 920) / 11
    expect(state.exact).toBeCloseTo(10620 / 11, 9);
  });

  it('uses only the official rounds', () => {
    const rounds = [fresh(700, '2026-09-03'), ...flagged(weekly([950, 960, 940]))];
    expect(officialState(rounds).rounds.map((result) => result.id)).toEqual(rounds.slice(1).map((round) => round.id));
  });

  it('recomputes when a round has no flags or none is included', () => {
    const rounds = weekly([950, 950, 950, 950, 950, 950, 700]);
    const recomputed = predictRating(rounds);
    expect(officialState(rounds)).toEqual({ rating: 950, exact: 950, rounds: recomputed.rounds, fromFlags: false });
    expect(officialState([...flagged(rounds.slice(1)), rounds[0]!]).fromFlags).toBe(false);
    expect(officialState(flagged(rounds, false)).fromFlags).toBe(false);
  });
});

describe('the difference from the official rating', () => {
  // PDGA counted the 700, so its round set gives 914, not the official 950.
  const rounds = flagged(weekly([950, 950, 950, 950, 950, 950, 700]));
  const all = [fresh(960, '2026-09-03'), ...rounds];

  it('is null when the official state gives the official rating', () => {
    const after = predictRating(all);
    expect(explainChange(all, after, 914)!.difference).toBeNull();
    expect(explainChange(all, after)!.difference).toBeNull();
  });

  it('makes the lines add up to the change shown', () => {
    const after = predictRating(all, { currentRating: 950 });
    const explanation = explainChange(all, after, 950)!;
    expect(explanation.before.rating).toBe(914);
    const effects = explanation.items.reduce((sum, item) => sum + item.effect, 0);
    expect(explanation.difference).not.toBeNull();
    expect(effects + explanation.difference!).toBeCloseTo(after.change!, 9);
  });

  it('covers what the rules decide differently from PDGA', () => {
    const after = predictRating(all, { currentRating: 950 });
    const explanation = explainChange(all, after, 950)!;
    // The rules drop the 700, which PDGA counted.
    expect(explanation.items.map((item) => item.kind)).toEqual(['newly-dropped', 'new']);
  });

  it('is not needed without new rated rounds: the rating stays, so there is nothing to explain', () => {
    const after = predictRating(rounds, { currentRating: 950 });
    expect(after).toMatchObject({ rating: 950, change: 0, unchanged: true });
    expect(explainChange(rounds, after, 950)).toBeNull();
  });
});
