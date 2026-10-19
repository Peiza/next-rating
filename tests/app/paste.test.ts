// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readPaste } from '../../src/app/paste';
import { LIMITS, ParseError } from '../../src/parsers/values';
import { detailsRow, detailsTable, eventDivision, eventRow, playerHeader } from '../parsers/html';

const DETAILS_TSV = [
  'Tournament\tTier\tDate\tDivision\tRound\tScore\tRating\tEvaluated\tIncluded',
  'Example Open\tC\t2-Aug-2026\tMA1\t1\t54\t950\tYes\tYes',
  'Example Open\tC\t2-Aug-2026\tMA1\t2\t52\t970\tYes\tYes',
].join('\n');

const EVENT_TSV = [
  'Place\tName\tPDGA#\tRating\tPar\tRd1\t\tRd2\t\tTotal',
  '1\tTest Player\t100001\t940\t+2\t54\t950\t55\t940\t109',
].join('\n');

describe('readPaste', () => {
  it('reads a ratings details table from HTML', () => {
    const html = detailsTable([detailsRow(), detailsRow({ round: '2', rating: '960' })]);
    const result = readPaste(html, 'ignored');
    expect(result).toMatchObject({ kind: 'details', rounds: 2 });
    expect(result.kind === 'details' && result.details[1]!.rating).toBe('960');
  });

  it('keeps the player when the page header is pasted too', () => {
    const result = readPaste(playerHeader() + detailsTable([detailsRow()]), '');
    expect(result.kind === 'details' && result.player?.pdgaNumber).toBe('100001');
  });

  it('reads event results from HTML', () => {
    const html = eventDivision('MA1', ['', ''], [eventRow({ rounds: [['54', '950'], ['55', '940']] })]);
    const result = readPaste(html, '');
    expect(result.kind).toBe('event');
    expect(result.kind === 'event' && result.event.divisions[0]!.rows[0]!.pdgaNumber).toBe('100001');
  });

  it('reads tab-separated text when the HTML has no table', () => {
    expect(readPaste('<p>Copied</p>', DETAILS_TSV)).toMatchObject({ kind: 'details', rounds: 2 });
    expect(readPaste('', EVENT_TSV).kind).toBe('event');
  });

  it('finds nothing in other content', () => {
    expect(readPaste('<p>Hello</p>', 'Hello')).toEqual({ kind: 'none' });
    expect(readPaste('', '')).toEqual({ kind: 'none' });
  });

  it('never runs pasted scripts or loads pasted content', () => {
    const global = globalThis as { pasted?: number };
    const html = `<script>globalThis.pasted = 1</script><img src="x" onerror="globalThis.pasted = 2">${detailsTable([detailsRow()])}`;
    expect(readPaste(html, '').kind).toBe('details');
    expect(global.pasted).toBeUndefined();
  });

  it('refuses content that is too large', () => {
    expect(() => readPaste('', 'x'.repeat(LIMITS.paste + 1))).toThrow(ParseError);
  });
});
