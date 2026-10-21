// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { detectPage } from '../../src/parsers/page';
import {
  normalizePlayer,
  normalizeProfileEvents,
  parsePlayer,
  parseProfileEvents,
} from '../../src/parsers/player';
import { ParseError } from '../../src/parsers/values';
import { detailsRow, detailsTable, page, parseHtml, playerHeader, profileRow, profileTable } from './html';

describe('player header', () => {
  it('reads name, number, current rating and its date', () => {
    const doc = parseHtml(page(playerHeader('Test Player', '100001', '950')));
    expect(parsePlayer(doc)).toEqual({
      pdgaNumber: 100001,
      name: 'Test Player',
      currentRating: 950,
      ratingDate: '2026-09-08',
    });
  });

  it('handles a player without a current rating', () => {
    const doc = parseHtml(page('<h1 class="title" id="page-title">New Player #100002</h1>'));
    expect(parsePlayer(doc)).toEqual({ pdgaNumber: 100002, name: 'New Player', currentRating: null, ratingDate: null });
  });

  it('returns null when the page has no player title', () => {
    expect(parsePlayer(parseHtml(page('<h1 id="page-title">Example Open</h1>')))).toBeNull();
  });

  it('rejects a raw player without a valid number', () => {
    expect(() => normalizePlayer({ pdgaNumber: 'abc', name: 'x' })).toThrow(ParseError);
    expect(() => normalizePlayer('x')).toThrow(ParseError);
  });
});

describe('profile events', () => {
  it('reads events from every division table, with the division from the link', () => {
    const doc = parseHtml(
      page(
        playerHeader() +
          profileTable('MPO', profileRow('900001', 'MPO', '09-May to 10-May-2026')) +
          profileTable('MA1', profileRow('900002', 'MA1', '01-Aug-2026')),
      ),
    );
    expect(parseProfileEvents(doc)).toEqual([
      { eventId: 900001, division: 'MPO', name: 'Example Open', tier: 'B', date: '2026-05-10' },
      { eventId: 900002, division: 'MA1', name: 'Example Open', tier: 'B', date: '2026-08-01' },
    ]);
  });

  it('ignores the ratings details table and rows without an event link', () => {
    const doc = parseHtml(
      page(
        detailsTable([detailsRow()]) +
          profileTable('MPO', '<tr class="totals"><td class="total">Total</td></tr>'),
      ),
    );
    expect(parseProfileEvents(doc)).toEqual([]);
  });

  it('drops raw events without a valid id', () => {
    expect(normalizeProfileEvents([{ eventId: 'x' }, { eventId: '5', date: '1-Jan-2026' }])).toEqual([
      { eventId: 5, division: '', name: '', tier: '', date: '2026-01-01' },
    ]);
  });
});

describe('detectPage', () => {
  const at = (url: string) => detectPage(parseHtml(page('', url)));

  it('tells pages apart by their canonical link', () => {
    expect(at('https://www.pdga.com/player/100001/details')).toBe('details');
    expect(at('https://www.pdga.com/player/100001')).toBe('profile');
    expect(at('https://www.pdga.com/tour/event/900001')).toBe('event');
    expect(at('https://www.pdga.com/player/100001/stats/2025')).toBe('season');
    expect(at('https://www.pdga.com/player/100001/stats/25')).toBe('unknown');
    expect(at('https://www.pdga.com/player/100001/history')).toBe('unknown');
    expect(at('https://example.com/player/100001')).toBe('unknown');
    expect(at('')).toBe('unknown');
  });

  it('prefers a given URL, such as the location of the current page', () => {
    const doc = parseHtml(page('', 'https://www.pdga.com/player/100001'));
    expect(detectPage(doc, 'https://www.pdga.com/player/100001/details?x=1#top')).toBe('details');
    expect(detectPage(doc, '/tour/event/900001')).toBe('event');
  });

  it('recognises a Cloudflare challenge', () => {
    expect(detectPage(parseHtml(page('', '', 'Just a moment...')))).toBe('challenge');
    expect(detectPage(parseHtml(page('<form id="challenge-form"></form>')))).toBe('challenge');
    expect(
      detectPage(parseHtml(page('<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/x"></script>'))),
    ).toBe('challenge');
  });

  it('does not take ordinary Cloudflare scripts for a challenge', () => {
    const doc = parseHtml(
      page('<script src="/cdn-cgi/scripts/x/cloudflare-static/email-decode.min.js"></script>', 'https://www.pdga.com/player/1'),
    );
    expect(detectPage(doc)).toBe('profile');
  });
});
