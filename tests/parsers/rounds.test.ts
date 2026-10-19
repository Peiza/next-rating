import { describe, expect, it } from 'vitest';
import { predictRating } from '../../src/engine/rating';
import type { RoundInput } from '../../src/engine/types';
import { detailsToRounds, eventToRounds, mergeRounds } from '../../src/parsers/rounds';
import type { DetailsRound, EventResults } from '../../src/parsers/types';

function detailsRound(extra: Partial<DetailsRound> = {}): DetailsRound {
  return {
    eventId: 900001,
    eventName: 'Example Open',
    tier: 'C',
    date: '2026-08-02',
    division: 'MA1',
    round: 1,
    roundLabel: '1',
    score: 54,
    rating: 950,
    holes: 18,
    evaluated: true,
    included: true,
    ...extra,
  };
}

function results(extra: Partial<EventResults> = {}): EventResults {
  return {
    eventId: 900002,
    name: 'Example Cup',
    date: '2026-09-06',
    official: false,
    divisions: [
      {
        division: 'MA1',
        holes: [18, 9, null],
        rows: [
          {
            pdgaNumber: 100002,
            name: 'Other Player',
            rounds: [{ score: 50, rating: 990, dnf: false }],
          },
          {
            pdgaNumber: 100001,
            name: 'Test Player',
            rounds: [
              { score: 54, rating: 950, dnf: false },
              { score: 27, rating: 960, dnf: false },
              { score: null, rating: null, dnf: true },
            ],
          },
        ],
      },
    ],
    ...extra,
  };
}

describe('detailsToRounds', () => {
  it('groups rounds by event id and keeps hole counts', () => {
    const rounds = detailsToRounds([detailsRound(), detailsRound({ round: 2, holes: null })]);
    expect(rounds).toEqual([
      { id: 'o:e:900001:MA1:1', rating: 950, date: '2026-08-02', eventKey: 'e:900001', holes: 18, source: 'official' },
      { id: 'o:e:900001:MA1:2', rating: 950, date: '2026-08-02', eventKey: 'e:900001', source: 'official' },
    ]);
  });

  it('groups by name and date without an event id', () => {
    const [round] = detailsToRounds([detailsRound({ eventId: null, round: null, roundLabel: 'Finals' })]);
    expect(round).toMatchObject({ id: 'o:n:Example Open|2026-08-02:MA1:Finals', eventKey: 'n:Example Open|2026-08-02' });
  });

  it('keeps ids unique', () => {
    const rounds = detailsToRounds([detailsRound(), detailsRound(), detailsRound()]);
    expect(new Set(rounds.map((round) => round.id)).size).toBe(3);
    expect(() => predictRating(rounds)).not.toThrow();
  });
});

describe('eventToRounds', () => {
  it('takes only the given player rounds, with hole counts and DNF', () => {
    expect(eventToRounds(results(), 100001)).toEqual([
      { id: 'u:e:900002:MA1:1', rating: 950, date: '2026-09-06', eventKey: 'e:900002', holes: 18, source: 'unofficial' },
      { id: 'u:e:900002:MA1:2', rating: 960, date: '2026-09-06', eventKey: 'e:900002', holes: 9, source: 'unofficial' },
      { id: 'u:e:900002:MA1:3', rating: null, date: '2026-09-06', eventKey: 'e:900002', dnf: true, source: 'unofficial' },
    ]);
  });

  it('leaves out rounds without a rating yet', () => {
    const event = results();
    event.divisions[0]!.rows[1]!.rounds[1] = { score: 27, rating: null, dnf: false };
    expect(eventToRounds(event, 100001).map((round) => round.id)).toEqual(['u:e:900002:MA1:1', 'u:e:900002:MA1:3']);
  });

  it('returns nothing for a player who is not in the results', () => {
    expect(eventToRounds(results(), 100009)).toEqual([]);
  });

  it('needs a date, which pasted results lack', () => {
    const pasted = results({ eventId: null, name: '', date: null });
    expect(eventToRounds(pasted, 100001)).toEqual([]);
    expect(eventToRounds(pasted, 100001, '2026-09-07')[0]).toMatchObject({
      date: '2026-09-07',
      eventKey: 'n:|2026-09-07',
    });
  });
});

describe('mergeRounds', () => {
  const official = detailsToRounds([detailsRound()]);

  it('adds rounds from events that are not in the ratings details', () => {
    const merged = mergeRounds(official, eventToRounds(results(), 100001));
    expect(merged.map((round) => round.eventKey)).toEqual(['e:900001', 'e:900002', 'e:900002', 'e:900002']);
  });

  it('leaves out events already in the ratings details', () => {
    const sameEvent = eventToRounds(results({ eventId: 900001 }), 100001);
    expect(mergeRounds(official, sameEvent)).toEqual(official);
  });

  it('leaves out an event read twice', () => {
    const event = eventToRounds(results(), 100001);
    expect(mergeRounds(official, event, event)).toHaveLength(4);
  });

  it('gives the engine valid input', () => {
    const manual: RoundInput = { id: 'm1', rating: 1000, date: '2026-09-10', eventKey: 'm1', source: 'manual' };
    const prediction = predictRating(mergeRounds(official, eventToRounds(results(), 100001), [manual]));
    expect(prediction.rounds.map((round) => round.status)).toEqual([
      'included',
      'included',
      'included',
      'dnf',
      'included',
    ]);
  });
});
