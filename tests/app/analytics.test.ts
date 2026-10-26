// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { startVisitCount } from '../../src/app/analytics';

const scripts = () => document.querySelectorAll<HTMLScriptElement>('script[src*="cloudflareinsights"]');

afterEach(() => {
  for (const s of scripts()) s.remove();
  history.replaceState(null, '', '/');
});

describe('startVisitCount', () => {
  it('adds nothing without a token', () => {
    startVisitCount('');
    expect(scripts()).toHaveLength(0);
  });

  it('adds the script once, with SPA tracking off', () => {
    startVisitCount('abc');
    startVisitCount('abc');
    expect(scripts()).toHaveLength(1);
    expect(JSON.parse(scripts()[0]!.dataset.cfBeacon!)).toEqual({ token: 'abc', spa: false });
  });

  it('never starts while the address still has a fragment', () => {
    history.replaceState(null, '', '/#d=secret');
    startVisitCount('abc');
    expect(scripts()).toHaveLength(0);
  });
});
