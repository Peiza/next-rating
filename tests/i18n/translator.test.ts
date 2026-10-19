import { describe, expect, it } from 'vitest';
import { findIssues } from '../../src/i18n/check';
import { pickLanguage, translate, type Catalog } from '../../src/i18n/translator';

const en: Catalog = {
  greeting: 'Hello {name}',
  'rounds.one': '{count} round',
  'rounds.other': '{count} rounds',
  onlyEnglish: 'English only',
};
const sv: Catalog = {
  greeting: 'Hej {name}',
  'rounds.one': 'en runda',
  'rounds.other': '{count} rundor',
};
const chain = [
  ['sv', sv],
  ['en', en],
] as const;

describe('translate', () => {
  it('fills in placeholders', () => {
    expect(translate(chain, 'greeting', { name: 'Kim' })).toBe('Hej Kim');
  });

  it('leaves unknown placeholders as they are', () => {
    expect(translate(chain, 'greeting')).toBe('Hej {name}');
  });

  it('picks the plural form for the count', () => {
    expect(translate(chain, 'rounds', { count: 1 })).toBe('en runda');
    expect(translate(chain, 'rounds', { count: 3 })).toBe('3 rundor');
    expect(translate([['en', en]], 'rounds', { count: 0 })).toBe('0 rounds');
  });

  it('falls back to English, then to the key', () => {
    expect(translate(chain, 'onlyEnglish')).toBe('English only');
    expect(translate(chain, 'nowhere')).toBe('nowhere');
  });
});

describe('pickLanguage', () => {
  const available = ['en', 'sv'];

  it('prefers the override', () => {
    expect(pickLanguage(['sv-SE'], available, 'en', 'en')).toBe('en');
  });

  it('ignores an override without a catalog', () => {
    expect(pickLanguage(['sv-SE'], available, 'fi', 'en')).toBe('sv');
  });

  it('matches a regional tag to its language', () => {
    expect(pickLanguage(['sv-FI', 'en-US'], available, null, 'en')).toBe('sv');
  });

  it('takes the first preferred language that has a catalog', () => {
    expect(pickLanguage(['de-DE', 'sv'], available, null, 'en')).toBe('sv');
  });

  it('falls back when nothing matches', () => {
    expect(pickLanguage(['de-DE'], available, null, 'en')).toBe('en');
    expect(pickLanguage([], available, null, 'en')).toBe('en');
  });
});

describe('findIssues', () => {
  it('finds nothing in a complete catalog', () => {
    expect(findIssues(en, { ...sv, onlyEnglish: 'Bara engelska' })).toEqual({ missing: [], extra: [], invalid: [] });
  });

  it('lists missing and extra keys', () => {
    const issues = findIssues(en, { ...sv, typo: 'x' });
    expect(issues.missing).toEqual(['onlyEnglish']);
    expect(issues.extra).toEqual(['typo']);
  });

  it('requires the "other" form of a plural message, and allows any other category', () => {
    const base = { greeting: 'Hej {name}', onlyEnglish: 'x' };
    expect(findIssues(en, { ...base, 'rounds.one': 'en runda' }).missing).toEqual(['rounds.other']);
    expect(findIssues(en, { ...base, 'rounds.few': '{count} r', 'rounds.other': '{count} r' })).toEqual({
      missing: [],
      extra: [],
      invalid: [],
    });
  });

  it('flags unknown or dropped placeholders, and text that is not a string', () => {
    const issues = findIssues(en, {
      greeting: 'Hej {namn}',
      'rounds.one': 'en runda',
      'rounds.other': '{antal} rundor',
      onlyEnglish: 42,
    } as unknown as Catalog);
    expect(issues.invalid.sort()).toEqual(['greeting', 'onlyEnglish', 'rounds.other']);
  });
});
