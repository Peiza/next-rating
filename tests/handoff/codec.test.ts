import { describe, expect, it } from 'vitest';
import {
  decodeHandoff,
  encodeHandoff,
  HandoffError,
  MAX_EVENTS,
  MAX_JSON_BYTES,
  MAX_PAYLOAD,
  packText,
  STATUSES,
  type HandoffErrorCode,
} from '../../src/handoff';
import { envelope, rawDetailsRow, rawEvent, rawPlayer, rawProfileEvent } from './raw';

async function errorCode(payload: string | Promise<string>): Promise<HandoffErrorCode | 'none'> {
  try {
    await decodeHandoff(await payload);
    return 'none';
  } catch (error) {
    if (error instanceof HandoffError) return error.code;
    throw error;
  }
}

const pack = (value: unknown) => packText(JSON.stringify(value));

describe('hand-off codec', () => {
  it('round-trips an envelope with every kind of record', async () => {
    const full = envelope({
      status: 'partial',
      player: rawPlayer(),
      details: [rawDetailsRow(), rawDetailsRow({ round: '2', roundLabel: '2', rating: '940' })],
      profileEvents: [rawProfileEvent()],
      events: [rawEvent()],
      failed: ['https://www.pdga.com/tour/event/900003'],
    });
    expect(await decodeHandoff(await encodeHandoff(full))).toEqual(full);
  });

  it.each(STATUSES)('round-trips the status %s without data', async (status) => {
    const bare = envelope({ status, page: 'unknown' });
    expect(await decodeHandoff(await encodeHandoff(bare))).toEqual(bare);
  });

  it('uses only characters that are safe in a URL fragment', async () => {
    const payload = await encodeHandoff(envelope({ player: rawPlayer({ name: 'Åsa Öberg ✓' }) }));
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect((await decodeHandoff(payload)).player?.name).toBe('Åsa Öberg ✓');
  });

  it('rejects an oversized payload before decoding it', async () => {
    expect(await errorCode('A'.repeat(MAX_PAYLOAD + 1))).toBe('too-large');
  });

  it('stops decompressing a small payload that grows too large', async () => {
    const bomb = await pack({ v: 1, padding: ' '.repeat(MAX_JSON_BYTES) });
    expect(bomb.length).toBeLessThan(MAX_PAYLOAD);
    expect(await errorCode(bomb)).toBe('too-large');
  });

  it('rejects a payload that is not base64url', async () => {
    expect(await errorCode('abc+/def')).toBe('malformed');
    expect(await errorCode('ab=c')).toBe('malformed');
    expect(await errorCode('A')).toBe('malformed');
  });

  it('rejects data that is not compressed', async () => {
    expect(await errorCode('AAAA')).toBe('malformed');
    expect(await errorCode('')).toBe('malformed');
  });

  it('rejects text that is not JSON', async () => {
    expect(await errorCode(packText('not json'))).toBe('malformed');
  });

  it('rejects an unknown version', async () => {
    expect(await errorCode(pack({ ...envelope(), v: 2 }))).toBe('version');
    expect(await errorCode(pack({ status: 'ok' }))).toBe('version');
  });

  it('rejects an unknown status, page kind or bookmarklet version', async () => {
    expect(await errorCode(pack({ ...envelope(), status: 'done' }))).toBe('malformed');
    expect(await errorCode(pack({ ...envelope(), page: 'home' }))).toBe('malformed');
    expect(await errorCode(pack({ ...envelope(), bookmarklet: '<b>' }))).toBe('malformed');
  });

  it('rejects malformed records', async () => {
    expect(await errorCode(pack(envelope({ player: rawPlayer({ pdgaNumber: '' }) })))).toBe('malformed');
    expect(await errorCode(pack({ ...envelope(), details: 'rows' }))).toBe('malformed');
    expect(await errorCode(pack({ ...envelope(), events: [{ divisions: [{ rows: 5 }] }] }))).toBe('malformed');
    expect(await errorCode(pack({ ...envelope(), player: rawPlayer({ name: 'x'.repeat(1000) }) }))).toBe('too-large');
  });

  it('limits the number of events', async () => {
    const events = Array.from({ length: MAX_EVENTS + 1 }, (_, i) => rawEvent({ eventId: String(900100 + i) }));
    expect(await errorCode(pack(envelope({ events })))).toBe('too-large');
  });

  it('keeps only pdga.com player and event pages', async () => {
    const kept = [
      'https://www.pdga.com/player/100001',
      'https://www.pdga.com/player/100001/details',
      'https://www.pdga.com/tour/event/900003',
    ];
    const failed = [
      ...kept,
      kept[0],
      'https://evil.example/player/100001',
      'https://www.pdga.com.evil.example/player/100001',
      'http://www.pdga.com/player/100001',
      'https://www.pdga.com/player/100001?next=https://evil.example',
      'https://www.pdga.com/user/login',
      'javascript:alert(1)',
      42,
    ];
    const decoded = await decodeHandoff(await pack(envelope({ failed: failed as string[] })));
    expect(decoded.failed).toEqual(kept);
  });

  it('drops unknown fields', async () => {
    const extra = {
      ...envelope({ player: { ...rawPlayer(), cookie: 'secret' } as never }),
      script: 'alert(1)',
    };
    const decoded = await decodeHandoff(await pack(extra));
    expect(decoded).not.toHaveProperty('script');
    expect(decoded.player).toEqual(rawPlayer());
  });
});
