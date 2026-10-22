import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The app is used outdoors, so text colours must reach WCAG AAA (7:1) on
 * every background they appear on, in both themes. Borders and the focus
 * ring must reach 3:1, the WCAG minimum for non-text contrast.
 */

const css = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'app', 'styles.css'), 'utf8');

function tokens(block: string): Map<string, string> {
  return new Map([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}

function block(selector: RegExp): string {
  const match = selector.exec(css);
  if (!match) throw new Error(`no ${selector} block in styles.css`);
  return match[1]!;
}

const light = tokens(block(/^:root\s*\{([^}]*)\}/m));
const deviceDark = tokens(
  block(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)\s*\{([^}]*)\}/),
);
const dark = new Map([...light, ...deviceDark]);

describe('theme override', () => {
  it('uses the same dark colours as the device setting', () => {
    expect(tokens(block(/^:root\[data-theme='dark'\]\s*\{([^}]*)\}/m))).toEqual(deviceDark);
  });

  it('keeps the default colours for light', () => {
    expect(tokens(block(/^:root\[data-theme='light'\]\s*\{([^}]*)\}/m)).size).toBe(0);
  });
});

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ...['text', 'text-muted', 'accent', 'good', 'bad', 'good-1', 'good-2', 'bad-1', 'bad-2'].flatMap((fg) => [
    [fg, 'bg'] as [string, string],
    [fg, 'surface'] as [string, string],
  ]),
  ['on-accent', 'accent'],
  ['text', 'warn-bg'],
  ['bg', 'text'],
];

const NON_TEXT_PAIRS: [string, string][] = [
  ['border', 'bg'],
  ['border', 'surface'],
  ['focus', 'bg'],
  ['focus', 'surface'],
];

describe('rating chart', () => {
  // The chart's rules before the forced-colours block, which uses system colours instead.
  const rules = [...css.split('@media (forced-colors: active)')[0]!.matchAll(/([^{}]*\.chart-[^{}]*)\{([^}]*)\}/g)];
  const colours = rules.flatMap(([, , body]) => [...body!.matchAll(/(?:^|[\s;])(fill|stroke|color|background):\s*([^;]+);/g)].map((m) => m[2]!.trim()));

  it('takes every colour from a theme token, the point colour or none', () => {
    expect(colours.length).toBeGreaterThan(10);
    for (const value of colours) expect(value).toMatch(/^(var\(--[\w-]+\)|currentColor|none)$/);
  });

  it('draws marks, labels and lines only in colours that reach 7:1 on the page and the shaded window', () => {
    const used = new Set(colours.flatMap((value) => /^var\(--([\w-]+)\)$/.exec(value)?.slice(1) ?? []));
    const surfaces = new Set(['bg', 'surface']);
    const checked = new Set(TEXT_PAIRS.filter(([, bg]) => bg === 'bg').map(([fg]) => fg));
    for (const token of used) {
      if (surfaces.has(token) || token === 'border' || token === 'focus') continue;
      expect(checked, `--${token}`).toContain(token);
      expect(TEXT_PAIRS).toContainEqual([token, 'surface']);
    }
  });
});

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme', (_, theme) => {
  const color = (name: string) => {
    const value = theme.get(name);
    if (!value) throw new Error(`--${name} is not a hex colour`);
    return value;
  };

  it.each(TEXT_PAIRS)('--%s on --%s reaches 7:1', (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(7);
  });

  it.each(NON_TEXT_PAIRS)('--%s on --%s reaches 3:1', (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(3);
  });
});
