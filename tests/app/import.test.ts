// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  applyImport,
  eventForPlayer,
  hasPlayerRow,
  takeFragment,
  validateStoredImport,
  type StoredImport,
} from '../../src/app/import';
import { MAX_EVENTS } from '../../src/handoff';
import type { RawEvent } from '../../src/parsers/types';
import { rawDetailsRow, rawEvent, rawEventRow, rawPlayer, rawProfileEvent } from '../handoff/raw';

const FIRST = '2026-10-01T10:00:00.000Z';
const LATER = '2026-10-02T18:30:00.000Z';
const PLAYER = 100001;

/** The event as it is stored for the player: their own rows only. */
function own(event: RawEvent): RawEvent {
  return eventForPlayer(event, PLAYER);
}

function fullImport(): StoredImport {
  return applyImport(
    null,
    {
      player: rawPlayer(),
      details: [rawDetailsRow()],
      profileEvents: [rawProfileEvent()],
      events: [rawEvent()],
    },
    FIRST,
    PLAYER,
  )!;
}

describe('applyImport', () => {
  it('stores the first import', () => {
    expect(fullImport()).toEqual({
      at: FIRST,
      detailsAt: FIRST,
      player: rawPlayer(),
      details: [rawDetailsRow()],
      profileEvents: [rawProfileEvent()],
      events: [own(rawEvent())],
    });
  });

  it('changes nothing for an import without data', () => {
    const stored = fullImport();
    expect(applyImport(stored, {}, LATER, PLAYER)).toBe(stored);
    expect(applyImport(null, {}, LATER, PLAYER)).toBeNull();
  });

  it('keeps what a partial import does not contain', () => {
    // The ratings details page was challenged: the import has the profile and an event page only.
    const stored = fullImport();
    const newEvent = rawEvent({ eventId: '900003', name: 'Example Final', date: '13-Sep-2026' });
    const next = applyImport(
      stored,
      {
        player: rawPlayer({ currentRating: '955' }),
        profileEvents: [rawProfileEvent(), rawProfileEvent({ eventId: '900003' })],
        events: [newEvent],
      },
      LATER,
      PLAYER,
    )!;
    expect(next.at).toBe(LATER);
    expect(next.details).toEqual(stored.details);
    expect(next.player?.currentRating).toBe('955');
    expect(next.profileEvents).toHaveLength(2);
    expect(next.events).toEqual([own(rawEvent()), own(newEvent)]);
  });

  it('keeps everything stored for an event page, which has no player', () => {
    const stored = fullImport();
    const newEvent = rawEvent({ eventId: '900003' });
    const next = applyImport(stored, { events: [newEvent] }, LATER, PLAYER)!;
    expect(next).toEqual({ ...stored, at: LATER, events: [own(rawEvent()), own(newEvent)] });
  });

  it("keeps only the player's rows of an event page", () => {
    const next = applyImport(null, { events: [rawEvent()] }, FIRST, PLAYER)!;
    const rows = next.events[0]!.divisions.flatMap((division) => division.rows);
    expect(rows.map((row) => row.pdgaNumber)).toEqual(['100001']);
  });

  it('replaces an earlier copy of the same event', () => {
    const updated = rawEvent({ status: 'official' });
    const next = applyImport(fullImport(), { events: [updated] }, LATER, PLAYER)!;
    expect(next.events).toEqual([own(updated)]);
  });

  it('tells pasted events without an id apart by name and date', () => {
    const pasted = (name: string, date: string) => rawEvent({ eventId: '', name, date });
    let stored = applyImport(null, { events: [pasted('', '6-Sep-2026'), pasted('Cup', '6-Sep-2026')] }, FIRST, PLAYER)!;
    expect(stored.events).toHaveLength(2);
    stored = applyImport(stored, { events: [pasted('', '6-Sep-2026')] }, LATER, PLAYER)!;
    expect(stored.events.map((event) => event.name)).toEqual(['Cup', '']);
  });

  it('merges a pasted ratings details table without a player header', () => {
    const pasted = [rawDetailsRow({ eventId: '', rating: '940' })];
    const stored = fullImport();
    expect(applyImport(stored, { details: pasted }, LATER, PLAYER)).toEqual({ ...stored, at: LATER, detailsAt: LATER, details: pasted });
    const fresh = applyImport(null, { details: pasted }, LATER, 100003)!;
    expect(fresh).toEqual({ at: LATER, detailsAt: LATER, details: pasted, events: [] });
    expect(validateStoredImport(fresh)).toEqual(fresh);
  });

  it('records when the ratings details were imported', () => {
    const stored = fullImport();
    const eventOnly = applyImport(stored, { events: [rawEvent({ eventId: '900009' })] }, LATER, PLAYER)!;
    expect(eventOnly.at).toBe(LATER);
    expect(eventOnly.detailsAt).toBe(FIRST);
    expect(applyImport(stored, { details: [rawDetailsRow()] }, LATER, PLAYER)!.detailsAt).toBe(LATER);
  });

  it('reads an import stored without a details timestamp, and refuses an invalid one', () => {
    const { detailsAt: _, ...older } = fullImport();
    expect(validateStoredImport(older)).toEqual(older);
    expect(validateStoredImport({ ...fullImport(), detailsAt: 'yesterday' })).toBeNull();
  });

  it('drops events that the ratings details now include', () => {
    const nowOfficial = rawDetailsRow({ eventId: '900002', eventName: 'Example Cup', date: '6-Sep-2026' });
    const next = applyImport(fullImport(), { details: [nowOfficial, rawDetailsRow()] }, LATER, PLAYER)!;
    expect(next.events).toEqual([]);
  });

  it(`keeps the latest ${MAX_EVENTS} events`, () => {
    const events = Array.from({ length: MAX_EVENTS }, (_, i) => rawEvent({ eventId: String(900100 + i) }));
    const next = applyImport(fullImport(), { events }, LATER, PLAYER)!;
    expect(next.events).toHaveLength(MAX_EVENTS);
    expect(next.events[0]!.eventId).toBe('900100');
  });
});

describe('eventForPlayer', () => {
  const event = rawEvent({}, [rawEventRow('100002', ['990', '980'], 'Other Player'), rawEventRow('100001', ['960', ''])]);

  it("keeps the player's row, also before it is rated", () => {
    expect(hasPlayerRow(event, PLAYER)).toBe(true);
    expect(eventForPlayer(event, PLAYER).divisions).toEqual([{ ...event.divisions[0], rows: [event.divisions[0]!.rows[1]] }]);
  });

  it('keeps no divisions for a player without a row', () => {
    expect(hasPlayerRow(event, 100009)).toBe(false);
    expect(eventForPlayer(event, 100009)).toEqual({ ...event, divisions: [] });
    expect(validateStoredImport({ at: FIRST, events: [eventForPlayer(event, 100009)] })).not.toBeNull();
  });

  it('leaves out the divisions the player is not in', () => {
    const two: RawEvent = {
      ...event,
      divisions: [
        { division: 'MA1', holes: ['18'], rows: [rawEventRow('100001', ['960'])] },
        { division: 'MA40', holes: ['18'], rows: [rawEventRow('100002', ['950'], 'Other Player')] },
      ],
    };
    expect(eventForPlayer(two, PLAYER).divisions.map((division) => division.division)).toEqual(['MA1']);
  });
});

describe('validateStoredImport', () => {
  it('reads a stored import back', () => {
    const stored = fullImport();
    expect(validateStoredImport(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it('rejects a missing or invalid timestamp', () => {
    expect(validateStoredImport({ ...fullImport(), at: undefined })).toBeNull();
    expect(validateStoredImport({ ...fullImport(), at: 'yesterday' })).toBeNull();
  });

  it('rejects invalid records', () => {
    expect(validateStoredImport({ ...fullImport(), player: { pdgaNumber: 'x' } })).toBeNull();
    expect(validateStoredImport({ ...fullImport(), events: {} })).toBeNull();
    expect(validateStoredImport(null)).toBeNull();
  });

  it('drops unknown fields', () => {
    const stored = { ...fullImport(), extra: 1, details: [{ ...rawDetailsRow(), html: '<b>' }] };
    expect(validateStoredImport(stored)).toEqual(fullImport());
  });
});

describe('takeFragment', () => {
  it('returns the payload and removes the fragment', () => {
    history.replaceState(null, '', '/next-rating/?lang=sv#d=abc_-123');
    expect(takeFragment()).toBe('abc_-123');
    expect(location.hash).toBe('');
    expect(location.pathname + location.search).toBe('/next-rating/?lang=sv');
  });

  it('leaves other fragments alone', () => {
    history.replaceState(null, '', '/next-rating/#top');
    expect(takeFragment()).toBeNull();
    expect(location.hash).toBe('#top');
  });
});
