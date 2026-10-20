import { describe, expect, it } from 'vitest';
import {
  decodeHandoff,
  encodeHandoff,
  HandoffError,
  MAX_JSON_BYTES,
  MAX_PAGES,
  MAX_PAYLOAD,
  packText,
  STATUSES,
  type HandoffErrorCode,
} from '../../src/handoff';
import { LIMITS } from '../../src/parsers';
import { envelope, handoffPage } from './raw';

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
  const details = handoffPage('<h1 id="page-title">Test Player #100001</h1><table id="player-results-details"></table>');
  const event = handoffPage('<div class="leaderboard"></div>', 'https://www.pdga.com/tour/event/900003');

  it('round-trips an envelope with pages', async () => {
    const full = envelope({ status: 'partial', pages: [details, event], failed: ['https://www.pdga.com/tour/event/900004'] });
    expect(await decodeHandoff(await encodeHandoff(full))).toEqual(full);
  });

  it.each(STATUSES)('round-trips the status %s without data', async (status) => {
    const bare = envelope({ status, page: 'unknown' });
    expect(await decodeHandoff(await encodeHandoff(bare))).toEqual(bare);
  });

  it('uses only characters that are safe in a URL fragment', async () => {
    const payload = await encodeHandoff(envelope({ pages: [handoffPage('<h1>Åsa Öberg ✓</h1>')] }));
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect((await decodeHandoff(payload)).pages?.[0]?.html).toBe('<h1>Åsa Öberg ✓</h1>');
  });

  it('rejects an oversized payload before decoding it', async () => {
    expect(await errorCode('A'.repeat(MAX_PAYLOAD + 1))).toBe('too-large');
  });

  it('stops decompressing a small payload that grows too large', async () => {
    const bomb = await pack({ v: 2, padding: ' '.repeat(MAX_JSON_BYTES) });
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

  it('rejects an unknown version, including the record-based version 1', async () => {
    expect(await errorCode(pack({ ...envelope(), v: 1 }))).toBe('version');
    expect(await errorCode(pack({ ...envelope(), v: 3 }))).toBe('version');
    expect(await errorCode(pack({ status: 'ok' }))).toBe('version');
  });

  it('rejects an unknown status, page kind or bookmarklet version', async () => {
    expect(await errorCode(pack({ ...envelope(), status: 'done' }))).toBe('malformed');
    expect(await errorCode(pack({ ...envelope(), page: 'home' }))).toBe('malformed');
    expect(await errorCode(pack({ ...envelope(), bookmarklet: '<b>' }))).toBe('malformed');
  });

  it('rejects malformed pages', async () => {
    expect(await errorCode(pack({ ...envelope(), pages: 'html' }))).toBe('malformed');
    expect(await errorCode(pack({ ...envelope(), pages: ['html'] }))).toBe('malformed');
    expect(await errorCode(pack({ ...envelope(), pages: [{ url: details.url, html: 5 }] }))).toBe('malformed');
    expect(await errorCode(pack({ ...envelope(), pages: [{ url: details.url }] }))).toBe('malformed');
  });

  it.each([
    'https://evil.example/player/100001',
    'https://www.pdga.com.evil.example/player/100001',
    'http://www.pdga.com/player/100001',
    'https://www.pdga.com/player/100001?next=https://evil.example',
    'https://www.pdga.com/user/login',
    'javascript:alert(1)',
  ])('rejects a page from %s', async (url) => {
    expect(await errorCode(pack(envelope({ pages: [handoffPage('<p></p>', url)] })))).toBe('malformed');
  });

  it('limits the number of pages and the size of each', async () => {
    const pages = Array.from({ length: MAX_PAGES + 1 }, () => event);
    expect(await errorCode(pack(envelope({ pages })))).toBe('too-large');
    const large = handoffPage(' '.repeat(LIMITS.paste + 1));
    expect(await errorCode(pack(envelope({ pages: [large] })))).toBe('too-large');
  });

  it('keeps only pdga.com player and event pages in the failed list', async () => {
    const kept = [
      'https://www.pdga.com/player/100001',
      'https://www.pdga.com/player/100001/details',
      'https://www.pdga.com/tour/event/900003',
    ];
    const failed = [
      ...kept,
      kept[0],
      'https://evil.example/player/100001',
      'http://www.pdga.com/player/100001',
      'https://www.pdga.com/user/login',
      'javascript:alert(1)',
      42,
    ];
    const decoded = await decodeHandoff(await pack(envelope({ failed: failed as string[] })));
    expect(decoded.failed).toEqual(kept);
  });

  it('drops unknown fields', async () => {
    const extra = {
      ...envelope({ pages: [{ ...details, cookie: 'secret' } as never] }),
      script: 'alert(1)',
    };
    const decoded = await decodeHandoff(await pack(extra));
    expect(decoded).not.toHaveProperty('script');
    expect(decoded.pages).toEqual([details]);
  });
});
