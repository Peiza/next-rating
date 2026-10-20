// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readPages } from '../../src/app/handoff';
import { handoffPage } from '../handoff/raw';
import { detailsRow, detailsTable, eventDivision, eventPage, eventRow, page, playerHeader, profileRow, profileTable } from '../parsers/html';

/* All names, numbers and results here are invented. */

const DETAILS = 'https://www.pdga.com/player/100001/details';
const PROFILE = 'https://www.pdga.com/player/100001';
const EVENT = 'https://www.pdga.com/tour/event/900003';

describe('reading hand-off pages', () => {
  it('reads each kind of page into records, by the kind its URL names', () => {
    const { parts, owner, unreadable } = readPages([
      handoffPage(playerHeader() + detailsTable([detailsRow()]), DETAILS),
      handoffPage(profileTable('MA1', profileRow('900003', 'MA1', '05-Sep-2026')), PROFILE),
      handoffPage(eventPage({ eventId: '900003', body: eventDivision('MA1', [''], [eventRow()]) }), EVENT),
    ]);
    expect(owner).toBe(100001);
    expect(unreadable).toEqual([]);
    expect(parts.player?.name).toBe('Test Player');
    expect(parts.details).toHaveLength(1);
    expect(parts.profileEvents).toEqual([{ eventId: '900003', division: 'MA1', name: 'Example Open', tier: 'B', date: '05-Sep-2026' }]);
    expect(parts.events?.[0]?.eventId).toBe('900003');
  });

  it('takes the player from the URL when the header cannot be read', () => {
    const { parts, owner } = readPages([handoffPage(detailsTable([detailsRow()]), 'https://www.pdga.com/player/100004/details')]);
    expect(parts.player).toBeUndefined();
    expect(owner).toBe(100004);
  });

  it('leaves out tables it cannot find, so they never replace stored data', () => {
    const { parts, unreadable } = readPages([handoffPage(playerHeader() + '<p>Changed page</p>', DETAILS), handoffPage('', PROFILE)]);
    expect(parts.details).toBeUndefined();
    expect(parts.profileEvents).toBeUndefined();
    expect(parts.player?.pdgaNumber).toBe('100001');
    expect(unreadable).toEqual([]);
  });

  it('lists pages whose content is not valid, and keeps the rest', () => {
    const tooLong = detailsRow({ eventName: 'x'.repeat(1000) });
    const challenge = page('<form id="challenge-form"></form>', '', 'Just a moment...');
    const { parts, unreadable } = readPages([
      handoffPage(detailsTable([tooLong]), DETAILS),
      handoffPage(challenge, PROFILE),
      handoffPage(eventPage({ eventId: '900003', body: eventDivision('MA1', [''], [eventRow()]) }), EVENT),
    ]);
    expect(unreadable).toEqual([DETAILS, PROFILE]);
    expect(parts.events).toHaveLength(1);
  });

  it('never runs or loads anything in the HTML', () => {
    const before = document.body.childNodes.length;
    const html = `<img src="https://evil.example/x.png" onerror="window.hacked = true"><script>window.hacked = true</script>${detailsTable([detailsRow()])}`;
    const { parts } = readPages([handoffPage(html, DETAILS)]);
    expect(parts.details).toHaveLength(1);
    expect((window as { hacked?: boolean }).hacked).toBeUndefined();
    expect(document.body.childNodes.length).toBe(before);
    expect(document.querySelector('img, script')).toBeNull();
  });
});
