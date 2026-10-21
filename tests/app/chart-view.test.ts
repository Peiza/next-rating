// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chartData, type ChartPeriod } from '../../src/app/chart';
import type { StoredImport } from '../../src/app/import';
import { buildModel, manualToRounds } from '../../src/app/model';
import { chartFullView, chartPanel, chartTeaser, type ChartProps } from '../../src/app/views/chart';
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
// The official rating equals the prediction here. In `differs` it is older, and a round of your own before the deadline moves the prediction.
const model = buildModel(stored, 100001, NOW, own);
const early = manualToRounds([{ id: 'm2', rating: 1000, date: '2026-10-05', eventName: '', holes: null }]);
const differs = buildModel({ ...stored, player: rawPlayer({ currentRating: '950' }) }, 100001, NOW, [...own, ...early]);
const moved = String(differs.prediction.rating);

function panel(period: ChartPeriod = { kind: 'recent' }, extra: Partial<ChartProps> = {}, from = model): HTMLElement {
  const props: ChartProps = { chart: chartData(from, period, TODAY), pdgaNumber: 100001, today: TODAY, onPeriod: vi.fn(), ...extra };
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

  it('shades the window and draws the official and predicted ratings across it, with their values', () => {
    const svg = plot(panel({ kind: 'recent' }, {}, differs));
    const band = svg.querySelector('rect.chart-band')!;
    const [start, width] = ['x', 'width'].map((name) => Number(band.getAttribute(name)));
    const lines = [...svg.querySelectorAll('.chart-line-official, .chart-line-predicted')];
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(Number(line.getAttribute('x1'))).toBeCloseTo(start!);
      expect(Number(line.getAttribute('x2'))).toBeCloseTo(start! + width!);
    }
    const labels = [...svg.querySelectorAll('.chart-line-label')];
    expect(moved).not.toBe('950');
    expect(labels.map((label) => label.textContent)).toEqual(['950', moved]);
    expect(Number(labels[0]!.getAttribute('x'))).toBeCloseTo(start! + width! + 4);
  });

  it('leaves the lines out of a period outside the window', () => {
    const svg = plot(panel({ kind: 'year', year: 2023 }));
    expect(svg.querySelectorAll('.chart-band, .chart-line, .chart-line-label')).toHaveLength(0);
    expect(svg.getAttribute('aria-label')).toMatch(/^1 round, .+, rated 900\.$/);
  });

  it('shows the value once when the official rating equals the prediction', () => {
    const svg = plot(panel());
    expect(svg.querySelectorAll('.chart-line-official')).toHaveLength(0);
    expect(svg.querySelectorAll('.chart-line-predicted')).toHaveLength(1);
    expect([...svg.querySelectorAll('.chart-line-label')].map((label) => label.textContent)).toEqual(['955']);
  });

  it("links to the player's ratings history on pdga.com, in the same tab", () => {
    for (const root of [panel(), panel({ kind: 'year', year: 2020 })]) {
      const link = root.querySelector<HTMLAnchorElement>('.chart-history a')!;
      expect(link.textContent).toBe('Ratings history on pdga.com');
      expect(link.getAttribute('href')).toBe('https://www.pdga.com/player/100001/history');
      expect(link.hasAttribute('target')).toBe(false);
    }
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
    expect(svg.getAttribute('aria-label')).toMatch(/^13 rounds from .+ to .+, rated 700 to 990\. Official rating and prediction 955\.$/);
    expect(plot(panel({ kind: 'recent' }, {}, differs)).getAttribute('aria-label')).toMatch(new RegExp(`\\. Prediction ${moved}\\. Official rating 950\\.$`));
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

  it('names the chosen round above the chart, under the period', () => {
    const root = panel();
    const order = [...root.children].map((child) => child.id || child.className);
    expect(order.indexOf('chart-detail')).toBeLessThan(order.indexOf('chart-frame'));
    expect(order.indexOf('chart-detail')).toBeGreaterThan(order.findIndex((name) => name.includes('period')));
  });

  it('draws at the measured width, two thirds as high within limits, and keeps the chosen round', () => {
    const observers: { callback: ResizeObserverCallback; disconnected: boolean }[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        entry: { callback: ResizeObserverCallback; disconnected: boolean };
        constructor(callback: ResizeObserverCallback) {
          this.entry = { callback, disconnected: false };
          observers.push(this.entry);
        }
        observe() {}
        disconnect() {
          this.entry.disconnected = true;
        }
      },
    );
    try {
      const root = panel();
      const svg = plot(root);
      expect(svg.getAttribute('viewBox')).toBe('0 0 300 200');
      key(root, 'End');
      const resize = (width: number) =>
        observers[0]!.callback([{ contentRect: { width, height: 0 } } as unknown as ResizeObserverEntry], {} as ResizeObserver);
      const ticks = () => svg.querySelectorAll('.chart-axis line.chart-baseline').length;
      const before = ticks();

      resize(600.7);
      expect(svg.getAttribute('viewBox')).toBe('0 0 600 320');
      expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['600', '320']);
      expect(ticks()).toBeGreaterThan(before);
      const own = svg.querySelector('.chart-own polygon')!.getAttribute('points')!.split(' ')[0]!.split(',').map(Number);
      expect(Number(svg.querySelector('.chart-selected')!.getAttribute('cx'))).toBeCloseTo(own[0]!);
      expect(detail(root)).toMatch(/^990 · /);

      resize(330);
      expect(svg.getAttribute('viewBox')).toBe('0 0 330 220');
      resize(100);
      expect(svg.getAttribute('viewBox')).toBe('0 0 240 200');

      root.remove();
      resize(0);
      expect(observers[0]!.disconnected).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
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
    const legend = (from: typeof model) =>
      [...panel({ kind: 'custom', from: '2026-09-02', to: '2026-09-30' }, {}, from).querySelectorAll('.chart-legend li')];
    const items = legend(differs);
    expect(items.map((item) => item.textContent)).toEqual(['Official', 'Counts', 'Counts twice', 'Rating window', `Prediction ${moved}`, 'Official rating 950']);
    expect(items.every((item) => item.querySelector('svg[aria-hidden="true"]'))).toBe(true);
    expect(legend(model).at(-1)!.textContent).toBe('Official rating and prediction 955');
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
    // The date and the rating keep to one line; the event name wraps.
    const cells = [...table.querySelector('tbody tr')!.children].map((cell) => cell.className);
    expect(cells).toEqual(['chart-date', 'chart-number', '', 'chart-event']);
  });

  it('offers Full screen as a small button in the chart corner when it can open', () => {
    expect(panel().querySelector('#chart-full-screen')).toBeNull();
    const onFullScreen = vi.fn();
    const root = panel({ kind: 'recent' }, { onFullScreen });
    const button = root.querySelector<HTMLButtonElement>('.chart-frame > #chart-full-screen')!;
    expect(button.className).toBe('chart-corner');
    expect(button.getAttribute('aria-label')).toBe('Full screen');
    expect(button.textContent).toBe('');
    expect(button.querySelector('svg[aria-hidden="true"] path')).not.toBeNull();
    button.click();
    expect(onFullScreen).toHaveBeenCalledTimes(1);
    // The plot leaves a strip at the top for it: no point or line goes above it.
    const svg = plot(root);
    const tops = [...svg.querySelectorAll('.chart-shape')].map((shape) => Number(shape.getAttribute('cy') ?? shape.getAttribute('y') ?? 99));
    expect(Math.min(...tops)).toBeGreaterThanOrEqual(20);
  });

  describe('full screen', () => {
    const onClose = vi.fn();
    const props = { pdgaNumber: 100001, today: TODAY, onPeriod: vi.fn(), onClose };
    const full = () => document.body.appendChild(chartFullView({ chart: chartData(model, { kind: 'recent' }, TODAY), ...props }));
    const label = (view: HTMLElement) => view.querySelector<HTMLElement>('#chart-full-detail')!;

    it('shows only the chart, with Exit full screen in its corner', () => {
      const view = full();
      expect(view.querySelector('h1.visually-hidden')!.textContent).toBe('Chart');
      expect([...view.querySelectorAll('[id]')].map((node) => node.id)).toEqual(['chart-full-title', 'chart-full-plot', 'chart-full-detail', 'chart-full-close']);
      expect(view.querySelector('select, .chart-legend, .chart-history, .chart-table')).toBeNull();
      const exit = view.querySelector<HTMLButtonElement>('.chart-frame-fill > #chart-full-close')!;
      expect(exit.getAttribute('aria-label')).toBe('Exit full screen');
      onClose.mockClear();
      exit.click();
      view.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      view.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(onClose).toHaveBeenCalledTimes(2);

      const empty = chartFullView({ chart: chartData(model, { kind: 'year', year: 2020 }, TODAY), ...props });
      expect(empty.querySelector('.chart-empty')!.textContent).toBe('No rated rounds in this period.');
      expect(empty.querySelector('#chart-full-close')).not.toBeNull();
    });

    it('names the chosen round in a label in the chart corner, empty until one is chosen', () => {
      const view = full();
      expect(label(view).className).toBe('chart-label');
      expect(label(view).parentElement!.classList.contains('chart-frame-fill')).toBe(true);
      expect(label(view).getAttribute('aria-live')).toBe('polite');
      expect(label(view).textContent).toBe('');
      view.querySelector('svg')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
      expect(label(view).textContent).toMatch(/^990 · /);
    });

    it('moves the label to the right while the chosen point is under it', () => {
      const chart = chartData(model, { kind: 'custom', from: '2026-09-01', to: '2026-09-30' }, TODAY);
      const view = document.body.appendChild(chartFullView({ chart, ...props }));
      const svg = view.querySelector<SVGSVGElement>('#chart-full-plot')!;
      svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
      // The label covers the top left: the rounds of early September, rated 951 to 959, but not the dropped 700 at the bottom.
      Object.defineProperty(label(view), 'offsetWidth', { get: () => 150 });
      Object.defineProperty(label(view), 'offsetHeight', { get: () => 50 });
      const choose = (name: string) => svg.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
      choose('Home');
      expect(label(view).textContent).toMatch(/^700 · /);
      expect(label(view).classList.contains('chart-label-right')).toBe(false);
      choose('ArrowRight');
      expect(label(view).textContent).toMatch(/^951 · /);
      expect(label(view).classList.contains('chart-label-right')).toBe(true);
    });
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
