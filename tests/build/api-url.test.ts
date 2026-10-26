import { describe, expect, it } from 'vitest';
import { apiOrigin, contentSecurityPolicy } from '../../scripts/api-url';

describe('apiOrigin', () => {
  it('is empty without a setting, which turns the lookup off', () => {
    expect(apiOrigin(undefined)).toBe('');
    expect(apiOrigin('  ')).toBe('');
  });

  it('takes the origin of an https address', () => {
    expect(apiOrigin('https://next-rating-api.example.workers.dev')).toBe('https://next-rating-api.example.workers.dev');
    expect(apiOrigin('https://next-rating-api.example.workers.dev/')).toBe('https://next-rating-api.example.workers.dev');
    expect(apiOrigin('http://localhost:8787')).toBe('http://localhost:8787');
  });

  it('fails the build for anything else', () => {
    for (const value of [
      'http://next-rating-api.example.workers.dev',
      'next-rating-api.example.workers.dev',
      'https://user:pass@example.workers.dev',
      'https://example.workers.dev/v1',
      'https://example.workers.dev/?x=1',
      'javascript:alert(1)',
    ]) {
      expect(() => apiOrigin(value), value).toThrow(/NEXT_RATING_API_URL/);
    }
  });
});

describe('contentSecurityPolicy', () => {
  it('allows no other origin without the lookup', () => {
    const policy = contentSecurityPolicy('');
    expect(policy).toBe("default-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'");
    expect(policy).not.toContain('connect-src');
  });

  it('lets the app call the lookup and nothing else', () => {
    const policy = contentSecurityPolicy('https://next-rating-api.example.workers.dev');
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("connect-src 'self' https://next-rating-api.example.workers.dev;");
    expect(policy.match(/https:\/\//g)).toHaveLength(1);
  });

  it('adds only Cloudflare Web Analytics when visits are counted', () => {
    const policy = contentSecurityPolicy('', true);
    expect(policy).toContain("script-src 'self' https://static.cloudflareinsights.com;");
    expect(policy).toContain("connect-src 'self' https://cloudflareinsights.com;");
    expect(policy.match(/https:\/\//g)).toHaveLength(2);
    expect(contentSecurityPolicy('https://next-rating-api.example.workers.dev', true)).toContain(
      "connect-src 'self' https://next-rating-api.example.workers.dev https://cloudflareinsights.com;",
    );
  });
});
