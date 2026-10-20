import { describe, expect, it } from 'vitest';
import { eventUrl, playerSearchUrl } from '../../src/app/views/pdga';

describe('playerSearchUrl', () => {
  it('searches one word as the last name', () => {
    expect(playerSearchUrl('Svensson')).toBe('https://www.pdga.com/players?LastName=Svensson');
  });

  it('takes the first of two words as the first name', () => {
    expect(playerSearchUrl('Anna Svensson')).toBe('https://www.pdga.com/players?FirstName=Anna&LastName=Svensson');
  });

  it('keeps the rest of three or more words as the last name', () => {
    expect(playerSearchUrl('Anna af Klint')).toBe('https://www.pdga.com/players?FirstName=Anna&LastName=af+Klint');
  });

  it('ignores extra spaces and encodes other characters', () => {
    expect(playerSearchUrl('  Åsa \t Öberg  ')).toBe('https://www.pdga.com/players?FirstName=%C3%85sa&LastName=%C3%96berg');
    expect(playerSearchUrl('a&b=c')).toBe('https://www.pdga.com/players?LastName=a%26b%3Dc');
  });

  it('needs a name', () => {
    expect(playerSearchUrl('')).toBeNull();
    expect(playerSearchUrl('   ')).toBeNull();
  });
});

describe('eventUrl', () => {
  it("is the event's page on pdga.com", () => {
    expect(eventUrl(900001)).toBe('https://www.pdga.com/tour/event/900001');
  });
});
