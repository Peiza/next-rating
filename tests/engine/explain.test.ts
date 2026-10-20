import { describe, expect, it } from 'vitest';
import { explainChange, type Explanation } from '../../src/engine/explain';
import { predictRating } from '../../src/engine/rating';
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
    expect(explanation.before.stats.windowMonths).toBe(12);
    expect(itemOf(explanation, old)).toMatchObject({ kind: 'entered-window', before: 'outside-window' });
  });

  it('lists rounds that start counting twice', () => {
    const rounds = weekly([960, 940, 955, 945, 950, 950, 950, 950]);
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

  it('lists a round that a new round pushes below the drop threshold', () => {
    const low = official(900, '2026-07-01');
    const rounds = [...weekly([950, 950, 950, 950, 950, 950]), low];
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
