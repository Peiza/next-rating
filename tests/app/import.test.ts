// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyImport, takeFragment, validateStoredImport, type StoredImport } from '../../src/app/import';
import { MAX_EVENTS } from '../../src/handoff';
import { rawDetailsRow, rawEvent, rawPlayer, rawProfileEvent } from '../handoff/raw';

const FIRST = '2026-10-01T10:00:00.000Z';
const LATER = '2026-10-02T18:30:00.000Z';

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
  )!;
}

describe('applyImport', () => {
  it('stores the first import', () => {
    expect(fullImport()).toEqual({
      at: FIRST,
      player: rawPlayer(),
      details: [rawDetailsRow()],
      profileEvents: [rawProfileEvent()],
      events: [rawEvent()],
    });
  });

  it('changes nothing for an import without data', () => {
    const stored = fullImport();
    expect(applyImport(stored, {}, LATER)).toBe(stored);
    expect(applyImport(null, {}, LATER)).toBeNull();
  });

  it('keeps what a partial import for the same player does not contain', () => {
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
    )!;
    expect(next.at).toBe(LATER);
    expect(next.details).toEqual(stored.details);
    expect(next.player?.currentRating).toBe('955');
    expect(next.profileEvents).toHaveLength(2);
    expect(next.events).toEqual([rawEvent(), newEvent]);
  });

  it('keeps everything stored for an event page, which has no player', () => {
    const stored = fullImport();
    const newEvent = rawEvent({ eventId: '900003' });
    const next = applyImport(stored, { events: [newEvent] }, LATER)!;
    expect(next).toEqual({ ...stored, at: LATER, events: [rawEvent(), newEvent] });
  });

  it('replaces an earlier copy of the same event', () => {
    const updated = rawEvent({ status: 'official' });
    const next = applyImport(fullImport(), { events: [updated] }, LATER)!;
    expect(next.events).toEqual([updated]);
  });

  it('tells pasted events without an id apart by name and date', () => {
    const pasted = (name: string, date: string) => rawEvent({ eventId: '', name, date });
    let stored = applyImport(null, { events: [pasted('', '6-Sep-2026'), pasted('Cup', '6-Sep-2026')] }, FIRST)!;
    expect(stored.events).toHaveLength(2);
    stored = applyImport(stored, { events: [pasted('', '6-Sep-2026')] }, LATER)!;
    expect(stored.events.map((event) => event.name)).toEqual(['Cup', '']);
  });

  describe('a pasted ratings details table, with the player the user confirmed', () => {
    const pasted = [rawDetailsRow({ eventId: '', rating: '940' })];

    it('merges for the same player', () => {
      const stored = fullImport();
      expect(applyImport(stored, { details: pasted }, LATER, 100001)).toEqual({ ...stored, at: LATER, details: pasted });
    });

    it('replaces everything for a different player', () => {
      expect(applyImport(fullImport(), { details: pasted }, LATER, 100002)).toEqual({
        at: LATER,
        player: { pdgaNumber: '100002', name: '', currentRating: '', ratingDate: '' },
        details: pasted,
        events: [],
      });
    });

    it('starts a new import for a player typed in without a default player', () => {
      const next = applyImport(null, { details: pasted }, LATER, 100003)!;
      expect(next.player?.pdgaNumber).toBe('100003');
      expect(validateStoredImport(next)).toEqual(next);
    });
  });

  it('replaces everything for a different player', () => {
    const other = rawPlayer({ pdgaNumber: '100002', name: 'Other Player' });
    const next = applyImport(fullImport(), { player: other, profileEvents: [] }, LATER);
    expect(next).toEqual({ at: LATER, player: other, profileEvents: [], events: [] });
  });

  it('drops events that the ratings details now include', () => {
    const nowOfficial = rawDetailsRow({ eventId: '900002', eventName: 'Example Cup', date: '6-Sep-2026' });
    const next = applyImport(fullImport(), { details: [nowOfficial, rawDetailsRow()] }, LATER)!;
    expect(next.events).toEqual([]);
  });

  it(`keeps the latest ${MAX_EVENTS} events`, () => {
    const events = Array.from({ length: MAX_EVENTS }, (_, i) => rawEvent({ eventId: String(900100 + i) }));
    const next = applyImport(fullImport(), { events }, LATER)!;
    expect(next.events).toHaveLength(MAX_EVENTS);
    expect(next.events[0]!.eventId).toBe('900100');
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
