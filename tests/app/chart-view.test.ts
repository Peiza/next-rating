// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chartData, type ChartPeriod } from '../../src/app/chart';
import type { StoredImport } from '../../src/app/import';
import { buildModel, manualToRounds } from '../../src/app/model';
import { chartPanel, chartTeaser, type ChartProps } from '../../src/app/views/chart';
import { setLanguage } from '../../src/i18n';
import { rawDetailsRow, rawEvent, rawPlayer } from '../handoff/raw';

afterEach(() => {
  setLanguage('en');
  document.body.replaceChildren();
});

/** Monday of update week: after the 11 Oct report deadline, before the 13 Oct update. */
const NOW = new Date('2026-10-12T10:00:00.000Z');
const TODAY = '2026-10-12';

// Ten rounds in September, the first one low enough to be dropped, so the newest three count twice.
const september = Array.from({ length: 10 }, (_, i) =>
  rawDetailsRow({ eventId: String(900100 + i), eventName: `Event ${i}`, date: `${i + 1}-Sep-2026`, rating: String(i === 0 ? 700 : 950 + i) }),
);
const stored: StoredImport = {
  at: '2026-10-12T09:00:00.000Z',
  player: rawPlayer({ currentRating: '955' }),
  details: [rawDetailsRow({ eventId: '900009', date: '1-Jun-2023', rating: '900' }), ...september],
  // An unofficial event after the deadline: it counts in the following update.
  events: [rawEvent({ eventId: '900013', date: '12-Oct-2026' })],
};
const own = manualToRounds([{ id: 'm1', rating: 990, date: '2026-12-01', eventName: 'Planned Open', holes: null }]);
const model = buildModel(stored, 100001, NOW, own);

function panel(period: ChartPeriod = { kind: 'recent' }, extra: Partial<ChartProps> = {}): HTMLElement {
  const props: ChartProps = { chart: chartData(model, period, TODAY), today: TODAY, onPeriod: vi.fn(), ...extra };
  const root = document.createElement('div');
  root.append(...chartPanel(props));
  return document.body.appendChild(root);
}

const plot = (root: HTMLElement) => root.querySelector<SVGSVGElement>('#chart-plot')!;
const detail = (root: HTMLElement) => root.querySelector('#chart-detail')!.textContent;

function key(root: HTMLElement, name: string): void {
  plot(root).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
}

describe('chart panel', () => {
  it('offers the last 24 months first, then the years, the rating window and a custom range', () => {
    const onPeriod = vi.fn();
    const root = panel({ kind: 'recent' }, { onPeriod });
    const select = root.querySelector<HTMLSelectElement>('#chart-period')!;
    expect(root.querySelector('label[for="chart-period"]')!.textContent).toBe('Period');
    expect([...select.options].map((option) => option.value)).toEqual(['recent', 'year:2026', 'year:2023', 'window', 'custom']);
    expect(select.value).toBe('recent');
    expect(select.options[0]!.textContent).toBe('Last 24 months');
    select.value = 'year:2026';
    select.dispatchEvent(new Event('change'));
    expect(onPeriod).toHaveBeenLastCalledWith({ kind: 'year', year: null });
    select.value = 'recent';
    select.dispatchEvent(new Event('change'));
    expect(onPeriod).toHaveBeenLastCalledWith({ kind: 'recent' });
  });

  it('shows from and to dates for a custom range', () => {
    const root = panel({ kind: 'custom', from: '2026-01-01', to: '2026-10-12' });
    expect(root.querySelector<HTMLInputElement>('#chart-from')!.value).toBe('2026-01-01');
    expect(root.querySelector<HTMLInputElement>('#chart-to')!.value).toBe('2026-10-12');
  });

  it('draws official rounds as circles, unofficial as squares and your own as triangles', () => {
    const points = [...plot(panel()).querySelectorAll('.chart-point')];
    const kinds = points.map((point) => [point.classList[1], point.querySelector('.chart-shape')!.tagName]);
    expect(kinds).toEqual([
      ...Array(10).fill(['chart-official', 'circle']),
      ['chart-unofficial', 'rect'],
      ['chart-unofficial', 'rect'],
      ['chart-own', 'polygon'],
    ]);
  });

  it('marks rounds that count twice with a ring and dropped ones with a cross, both hollow when not counted', () => {
    const svg = plot(panel());
    const marks = [...svg.querySelectorAll('.chart-point')].map((point) => point.classList[2]);
    expect(marks.slice(0, 10)).toEqual(['chart-ruled-out', ...Array(6).fill('chart-counts'), ...Array(3).fill('chart-twice')]);
    // After the deadline, the planned round too: not in the next update.
    expect(marks.slice(10)).toEqual(['chart-not', 'chart-not', 'chart-not']);
    expect(svg.querySelectorAll('.chart-twice .chart-ring')).toHaveLength(3);
    expect(svg.querySelectorAll('.chart-ruled-out .chart-cross')).toHaveLength(1);
    expect(svg.querySelectorAll('.chart-counts .chart-ring, .chart-counts .chart-cross')).toHaveLength(0);
  });

  it('shades the window and draws the official and predicted ratings with their values', () => {
    const svg = plot(panel());
    expect(svg.querySelectorAll('.chart-band')).toHaveLength(1);
    expect(svg.querySelectorAll('.chart-line-official, .chart-line-predicted')).toHaveLength(2);
    const labels = [...svg.querySelectorAll('.chart-line-label')].map((label) => label.textContent);
    expect(labels).toEqual(['955', String(model.prediction.rating)]);
  });

  it('labels the axes with ratings and months', () => {
    const svg = plot(panel({ kind: 'year', year: null }));
    const texts = [...svg.querySelectorAll('.chart-axis text')].map((text) => text.textContent);
    expect(texts).toContain('1000');
    expect(texts).toContain('Jan2026');
    expect(texts).toContain('Oct');
  });

  it('sums up the chart for screen readers', () => {
    const svg = plot(panel());
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toMatch(
      new RegExp(`^13 rounds from .+ to .+, rated 700 to 990\\. Prediction ${model.prediction.rating}\\. Official rating 955\\.$`),
    );
  });

  it('steps through the rounds with the arrow keys, naming each under the chart', () => {
    const root = panel();
    expect(detail(root)).toBe('Tap a point, or use the arrow keys, to see its round.');
    key(root, 'ArrowRight');
    expect(detail(root)).toMatch(/^700 · Dropped · Event 0 · Round 1 · \S+ · Official$/);
    key(root, 'ArrowRight');
    expect(detail(root)).toMatch(/^951 · Counted · Event 1/);
    key(root, 'End');
    expect(detail(root)).toMatch(/^990 · Counts in the following update · Planned Open · \S+ · Your own$/);
    key(root, 'ArrowRight');
    expect(detail(root)).toMatch(/^990/);
    key(root, 'Home');
    expect(detail(root)).toMatch(/^700/);
    expect(root.querySelector('.chart-selected')!.getAttribute('visibility')).toBe('visible');
  });

  it('picks the nearest round to a tap, within reach', () => {
    const root = panel();
    const svg = plot(root);
    // Drawn at its own size: 300 by 200 pixels.
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    const own = svg.querySelector('.chart-own polygon')!.getAttribute('points')!.split(' ')[0]!.split(',').map(Number);
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: own[0]! - 3, clientY: own[1]! + 8 }));
    expect(detail(root)).toMatch(/^990 · /);
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 150, clientY: 2 }));
    expect(detail(root)).toMatch(/^990 · /);
  });

  it('explains only the shapes and marks the period has, then the window and the lines', () => {
    const items = [...panel({ kind: 'custom', from: '2026-09-02', to: '2026-09-30' }).querySelectorAll('.chart-legend li')];
    expect(items.map((item) => item.textContent)).toEqual([
      'Official',
      'Counts',
      'Counts twice',
      'Rating window',
      `Prediction ${model.prediction.rating}`,
      'Official rating 955',
    ]);
    expect(items.every((item) => item.querySelector('svg[aria-hidden="true"]'))).toBe(true);
  });

  it('lists the same rounds as a table, newest first', () => {
    const table = panel().querySelector('details.chart-table')!;
    expect(table.hasAttribute('open')).toBe(false);
    expect(table.querySelector('summary')!.textContent).toBe('Show as table');
    expect([...table.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['Date', 'Rating', 'Status', 'Round']);
    const rows = [...table.querySelectorAll('tbody tr')].map((row) => [...row.children].slice(1).map((cell) => cell.textContent));
    expect(rows).toHaveLength(13);
    expect(rows[0]).toEqual(['990', 'Counts in the following update', 'Planned Open · Your own']);
    expect(rows.at(-1)).toEqual(['700', 'Dropped', 'Event 0 · Round 1 · Official']);
  });

  it('says so when the period has no rated rounds', () => {
    const root = panel({ kind: 'year', year: 2020 });
    expect(root.querySelector('#chart-plot')).toBeNull();
    expect(root.querySelector('.chart-empty')!.textContent).toBe('No rated rounds in this period.');
    expect(root.querySelector('#chart-period')).not.toBeNull();
  });

  it('names the count and the period on the closed card', () => {
    expect(chartTeaser(chartData(model, { kind: 'recent' }, TODAY))).toBe('13 rounds · Last 24 months');
    expect(chartTeaser(chartData(model, { kind: 'custom', from: '2023-06-01', to: '2023-06-01' }, TODAY))).toMatch(/^1 round · .+ – .+$/);
    setLanguage('sv');
    expect(chartTeaser(chartData(model, { kind: 'year', year: 2026 }, TODAY))).toBe('13 rundor · 2026');
  });
});
