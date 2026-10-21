// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  detailsToRounds,
  detectPage,
  eventToRounds,
  extractRatingsDetails,
  normalizeRatingsDetails,
  parseEvent,
  parsePlayer,
  parseProfileEvents,
  parseRatingsDetails,
  parseRatingsHistory,
} from '../../src/parsers';
import { fixtures, historyFixture } from '../fixture-loader';
import { parseHtml } from './html';

/*
 * Runs against pages saved from pdga.com. Expected values come from the
 * local expected.json, or are derived from the pages themselves.
 */
describe.skipIf(!fixtures)('pdga.com fixtures', () => {
  // A skipped suite is still collected, so stop before reading the fixtures.
  if (!fixtures) return;
  const { expected, html } = fixtures;
  const details = parseHtml(html.details);
  const profile = parseHtml(html.profile);
  const eventRated = parseHtml(html.eventRated);
  const eventUnofficial = parseHtml(html.eventUnofficial);

  it('tells the pages apart', () => {
    expect([details, profile, eventRated, eventUnofficial].map((doc) => detectPage(doc))).toEqual([
      'details',
      'profile',
      'event',
      'event',
    ]);
  });

  describe('ratings details page', () => {
    const { rounds, skipped } = parseRatingsDetails(details);

    it('reads every row', () => {
      expect(skipped).toBe(0);
      expect(rounds).toHaveLength(expected.details.rows);
      expect(rounds.filter((round) => round.included)).toHaveLength(expected.details.included);
      expect(new Set(rounds.map((round) => round.eventId)).size).toBe(expected.details.events);
      expect(rounds[0]).toEqual(expected.details.first);
    });

    it('finds an event id, round number and hole count for every round', () => {
      for (const round of rounds) {
        expect(round.eventId).not.toBeNull();
        expect(round.round).not.toBeNull();
        expect(round.holes).not.toBeNull();
      }
      const { eventId, holes, rounds: count } = expected.details.otherHoles;
      expect(rounds.filter((round) => round.holes !== 18)).toEqual(
        new Array(count).fill(expect.objectContaining({ eventId, holes })),
      );
    });

    it('numbers "Finals" rounds from their tooltip', () => {
      const finals = rounds.filter((round) => round.roundLabel === 'Finals');
      expect(finals.map((round) => round.eventId)).toEqual(expected.details.finals.eventIds);
      for (const round of finals) expect(round.round).toBe(expected.details.finals.round);
    });

    it('dates multi-day events by their last day', () => {
      const raw = extractRatingsDetails(details);
      raw.forEach((row, i) => {
        const lastDay = /(\d{1,2})-[A-Za-z]{3}-\d{4}$/.exec(row.date)![1]!;
        expect(Number(rounds[i]!.date.slice(8))).toBe(Number(lastDay));
      });
    });

    it('reads the same flags from the Yes/No cells as from the row classes', () => {
      const copy = parseHtml(html.details);
      for (const row of copy.querySelectorAll('tr')) row.removeAttribute('class');
      expect(parseRatingsDetails(copy).rounds).toEqual(rounds);
    });
  });

  describe('player profile page', () => {
    it('shows the same player as the ratings details page', () => {
      const player = parsePlayer(profile);
      expect(player).not.toBeNull();
      expect(player!.pdgaNumber).toBe(expected.pdgaNumber);
      expect(player!.currentRating).not.toBeNull();
      expect(player!.ratingDate).not.toBeNull();
      expect(parsePlayer(details)).toEqual(player);
    });

    it('lists the season events, all in the ratings details', () => {
      const events = parseProfileEvents(profile);
      expect(events).toHaveLength(expected.profile.events);
      const detailsEvents = new Set(parseRatingsDetails(details).rounds.map((round) => round.eventId));
      for (const event of events) {
        expect(event.date).not.toBeNull();
        expect(event.division).not.toBe('');
        expect(detailsEvents.has(event.eventId)).toBe(true);
      }
    });
  });

  describe('event already in the rating', () => {
    const results = parseEvent(eventRated);

    it('reads the event', () => {
      expect(results).toMatchObject({
        eventId: expected.eventRated.eventId,
        date: expected.eventRated.date,
        official: true,
      });
      expect(results.divisions).toHaveLength(expected.eventRated.divisions);
      expect(results.divisions.flatMap((division) => division.rows)).toHaveLength(expected.eventRated.rows);
      for (const division of results.divisions) expect(division.holes).not.toContain(null);
    });

    it("has the same rounds for the player as the ratings details page", () => {
      const fromEvent = eventToRounds(results, expected.pdgaNumber);
      const detailsRounds = parseRatingsDetails(details)
        .rounds.filter((round) => round.eventId === results.eventId)
        .sort((a, b) => a.round! - b.round!);
      const fromDetails = detailsToRounds(detailsRounds);
      expect(fromEvent.length).toBeGreaterThan(0);
      const fields = (round: (typeof fromEvent)[number]) => [round.eventKey, round.date, round.rating, round.holes];
      expect(fromEvent.map(fields)).toEqual(fromDetails.map(fields));
    });
  });

  describe('event with unofficial ratings', () => {
    const results = parseEvent(eventUnofficial);

    it('reads the event as unofficial', () => {
      expect(results).toMatchObject({
        eventId: expected.eventUnofficial.eventId,
        date: expected.eventUnofficial.date,
        official: false,
      });
      expect(results.divisions).toHaveLength(expected.eventUnofficial.divisions);
      const rows = results.divisions.flatMap((division) => division.rows);
      expect(rows).toHaveLength(expected.eventUnofficial.rows);
      expect(rows.filter((row) => row.pdgaNumber === null)).toHaveLength(
        expected.eventUnofficial.rowsWithoutPdgaNumber,
      );
    });

    it("finds a player's unofficial round ratings", () => {
      const { pdgaNumber, ratings } = expected.eventUnofficial.player;
      const rounds = eventToRounds(results, pdgaNumber);
      expect(rounds.map((round) => round.rating)).toEqual(ratings);
      for (const round of rounds) expect(round).toMatchObject({ source: 'unofficial', holes: 18 });
    });
  });
});

const history = historyFixture();

describe.skipIf(!history)('pdga.com ratings history page', () => {
  if (!history) return;
  const doc = parseHtml(history.html);

  it('is a history page with a player header', () => {
    expect(detectPage(doc)).toBe('history');
    expect(parsePlayer(doc)?.currentRating).toBe(history.newest.rating);
  });

  it('reads every update, oldest first', () => {
    const entries = parseRatingsHistory(doc);
    expect(entries).toHaveLength(history.rows);
    expect(entries[0]).toEqual(history.oldest);
    expect(entries.at(-1)).toEqual(history.newest);
  });
});
