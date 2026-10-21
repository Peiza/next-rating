import type { PlainDate } from '../../engine';
import { t, type MessageKey } from '../../i18n';
import { dayNumber, type ChartData, type ChartPeriod, type ChartPoint, type MonthTick, type PointKind, type PointMark } from '../chart';
import { el, svg, type Child } from '../dom';
import { formatDate, formatDayMonth, formatMonth, formatRating } from '../format';
import { periodControls, periodId, periodLabel } from './period';
import { roundLabel, roundWhere, tierNote } from './round-text';

/*
 * The Chart card on the Rating tab: round ratings over time as inline SVG,
 * drawn here without a chart library. The shape tells where a round comes
 * from, the fill what the next update does with it, so nothing depends on
 * colour alone. Colours come from the theme tokens through classes in
 * styles.css (the CSP blocks inline styles). Tapping a point, or the arrow
 * keys, show its round under the chart; a table holds the same rounds.
 */

export const CHART_PERIOD_ID = periodId('chart');
export const CHART_PLOT_ID = 'chart-plot';
export const CHART_DETAIL_ID = 'chart-detail';

export interface ChartProps {
  chart: ChartData;
  /** Today, which ends a custom range when one is first picked. */
  today: PlainDate;
  onPeriod: (period: ChartPeriod) => void;
}

/** The drawing's own units; it scales to the card's width (styles.css caps it). */
const WIDTH = 300;
const HEIGHT = 200;
const MARGIN = { left: 34, right: 34, top: 10, bottom: 30 } as const;
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
/** Line labels closer than this are moved apart. */
const LABEL_GAP = 13;
/** A tap selects the nearest point within this many screen pixels. */
const TAP_RADIUS = 24;

const KINDS: Record<PointKind, MessageKey> = {
  official: 'chart.kind.official',
  unofficial: 'chart.kind.unofficial',
  own: 'chart.kind.own',
};

const MARKS: Record<PointMark, MessageKey> = {
  counts: 'chart.mark.counts',
  twice: 'chart.mark.twice',
  not: 'chart.mark.not',
  'ruled-out': 'chart.mark.ruledOut',
};

interface Scale {
  x: (date: PlainDate) => number;
  y: (rating: number) => number;
}

function scaleOf(chart: ChartData, y: NonNullable<ChartData['y']>): Scale {
  const start = dayNumber(chart.from);
  const days = Math.max(1, dayNumber(chart.to) - start);
  return {
    x: (date) => MARGIN.left + ((dayNumber(date) - start) / days) * PLOT_WIDTH,
    y: (rating) => MARGIN.top + ((y.max - rating) / (y.max - y.min)) * PLOT_HEIGHT,
  };
}

/** A point's shape at (x, y): a circle, a square or a triangle. */
function shape(kind: PointKind, x: number, y: number): SVGElement {
  if (kind === 'official') return svg('circle', { class: 'chart-shape', cx: x, cy: y, r: 4.5 });
  if (kind === 'unofficial') return svg('rect', { class: 'chart-shape', x: x - 4, y: y - 4, width: 8, height: 8 });
  const points = [
    [x, y - 5.5],
    [x - 5, y + 3.5],
    [x + 5, y + 3.5],
  ];
  return svg('polygon', { class: 'chart-shape', points: points.map((point) => point.join(',')).join(' ') });
}

/** A mark: filled, filled with a ring, hollow, or hollow with a cross. */
function marker(kind: PointKind, mark: PointMark, x: number, y: number): SVGElement {
  return svg(
    'g',
    { class: `chart-point chart-${kind} chart-${mark}` },
    mark === 'twice' && svg('circle', { class: 'chart-ring', cx: x, cy: y, r: 8 }),
    shape(kind, x, y),
    mark === 'ruled-out' && svg('path', { class: 'chart-cross', d: `M${x - 2.5} ${y - 2.5}l5 5m0 -5l-5 5` }),
  );
}

/** A small icon for the legend, with the same classes as the chart. */
function icon(...children: Child[]): SVGElement {
  return svg('svg', { class: 'chart-icon', viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' }, ...children);
}

function yAxis(chart: ChartData, y: NonNullable<ChartData['y']>, scale: Scale): SVGElement {
  return svg(
    'g',
    { class: 'chart-axis' },
    ...y.ticks.flatMap((tick) => [
      svg('line', { class: 'chart-grid', x1: MARGIN.left, x2: WIDTH - MARGIN.right, y1: scale.y(tick), y2: scale.y(tick) }),
      svg('text', { x: MARGIN.left - 5, y: scale.y(tick), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, formatRating(tick)),
    ]),
  );
}

/** A month tick reads "Oct", with the year under it on the first tick and on January; a range end reads "12 Oct". */
function tickLabel(tick: MonthTick, x: number): SVGElement {
  const first = tick.date.endsWith('-01') ? formatMonth(tick.date) : formatDayMonth(tick.date);
  const anchor = x < MARGIN.left + 12 ? 'start' : x > WIDTH - MARGIN.right - 12 ? 'end' : 'middle';
  const bottom = HEIGHT - MARGIN.bottom;
  return svg(
    'text',
    { x, y: bottom + 13, 'text-anchor': anchor },
    svg('tspan', { x }, first),
    tick.year && svg('tspan', { x, dy: 13 }, tick.date.slice(0, 4)),
  );
}

function xAxis(chart: ChartData, scale: Scale): SVGElement {
  const bottom = HEIGHT - MARGIN.bottom;
  return svg(
    'g',
    { class: 'chart-axis' },
    svg('line', { class: 'chart-baseline', x1: MARGIN.left, x2: WIDTH - MARGIN.right, y1: bottom, y2: bottom }),
    ...chart.xTicks.flatMap((tick) => {
      const x = scale.x(tick.date);
      return [svg('line', { class: 'chart-baseline', x1: x, x2: x, y1: bottom, y2: bottom + 4 }), tickLabel(tick, x)];
    }),
  );
}

/**
 * The official and predicted ratings as lines across the plot, each with its
 * value at the right end. Values too close to read apart are moved apart.
 */
function ratingLines(chart: ChartData, scale: Scale): SVGElement[] {
  const lines = [
    chart.official !== null && { value: chart.official, kind: 'official' },
    chart.predicted !== null && { value: chart.predicted, kind: 'predicted' },
  ].filter((line): line is { value: number; kind: string } => line !== false);
  const labels = lines.map((line) => scale.y(line.value));
  if (labels.length === 2 && Math.abs(labels[0]! - labels[1]!) < LABEL_GAP) {
    const middle = (labels[0]! + labels[1]!) / 2;
    // The higher rating keeps the upper label.
    const [upper, lower] = lines[0]!.value >= lines[1]!.value ? [0, 1] : [1, 0];
    labels[upper] = middle - LABEL_GAP / 2;
    labels[lower] = middle + LABEL_GAP / 2;
  }
  return lines.flatMap((line, i) => [
    svg('line', {
      class: `chart-line chart-line-${line.kind}`,
      x1: MARGIN.left,
      x2: WIDTH - MARGIN.right,
      y1: scale.y(line.value),
      y2: scale.y(line.value),
    }),
    svg(
      'text',
      { class: 'chart-line-label', x: WIDTH - MARGIN.right + 4, y: labels[i]!, 'dominant-baseline': 'middle' },
      formatRating(line.value),
    ),
  ]);
}

/** "985 · Counts twice · Example Open · Round 2 · date · Unofficial". */
function pointText(point: ChartPoint): string {
  const { round, result } = point.row;
  return [formatRating(point.rating), t(`round.status.${result.status}`), roundWhere(round), t(KINDS[point.kind])].filter(Boolean).join(' · ');
}

/** What the chart shows, for screen readers. */
function summaryText(chart: ChartData): string {
  const ratings = chart.points.map((point) => point.rating);
  const parts = [
    t('chart.summary', {
      count: chart.points.length,
      from: formatDate(chart.points[0]!.date),
      to: formatDate(chart.points.at(-1)!.date),
      low: formatRating(Math.min(...ratings)),
      high: formatRating(Math.max(...ratings)),
    }),
    chart.predicted !== null && t('chart.summaryPredicted', { rating: formatRating(chart.predicted) }),
    chart.official !== null && t('chart.summaryOfficial', { rating: formatRating(chart.official) }),
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * The plot, with a line under it that names the chosen round. A tap picks
 * the nearest point within TAP_RADIUS screen pixels; the arrow keys step
 * through the points, Home and End jump to the first and last.
 */
function plot(chart: ChartData, y: NonNullable<ChartData['y']>): HTMLElement[] {
  const scale = scaleOf(chart, y);
  const placed = chart.points.map((point) => ({ point, x: scale.x(point.date), y: scale.y(point.rating) }));
  const highlight = svg('circle', { class: 'chart-selected', r: 10, cx: -100, cy: -100, visibility: 'hidden' });
  const detail = el('p', { id: CHART_DETAIL_ID, class: 'chart-detail', 'aria-live': 'polite' }, t('chart.hint'));
  let chosen = -1;

  const choose = (index: number) => {
    chosen = index;
    const { point, x, y: top } = placed[index]!;
    highlight.setAttribute('cx', String(x));
    highlight.setAttribute('cy', String(top));
    highlight.setAttribute('visibility', 'visible');
    detail.textContent = pointText(point);
  };

  const onTap = (event: Event) => {
    const { clientX, clientY } = event as PointerEvent;
    const box = drawing.getBoundingClientRect();
    if (box.width === 0) return;
    const units = WIDTH / box.width;
    const [tapX, tapY] = [(clientX - box.left) * units, (clientY - box.top) * units];
    let nearest = -1;
    let best = TAP_RADIUS * units;
    placed.forEach(({ x, y: top }, i) => {
      const distance = Math.hypot(x - tapX, top - tapY);
      if (distance <= best) {
        best = distance;
        nearest = i;
      }
    });
    if (nearest >= 0) choose(nearest);
  };

  const onKey = (event: Event) => {
    const { key } = event as KeyboardEvent;
    const last = placed.length - 1;
    const next =
      key === 'ArrowRight' ? (chosen < 0 ? 0 : Math.min(last, chosen + 1))
      : key === 'ArrowLeft' ? (chosen < 0 ? last : Math.max(0, chosen - 1))
      : key === 'Home' ? 0
      : key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    choose(next);
  };

  const drawing = svg(
    'svg',
    {
      id: CHART_PLOT_ID,
      class: 'chart-plot',
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      role: 'img',
      'aria-label': summaryText(chart),
      'aria-describedby': CHART_DETAIL_ID,
      tabindex: 0,
      onpointerup: onTap,
      onkeydown: onKey,
    },
    chart.band &&
      svg('rect', {
        class: 'chart-band',
        x: scale.x(chart.band.from),
        y: MARGIN.top,
        width: Math.max(1, scale.x(chart.band.to) - scale.x(chart.band.from)),
        height: PLOT_HEIGHT,
      }),
    yAxis(chart, y, scale),
    xAxis(chart, scale),
    ...ratingLines(chart, scale),
    ...placed.map(({ point, x, y: top }) => marker(point.kind, point.mark, x, top)),
    highlight,
  );
  return [el('div', { class: 'chart-frame' }, drawing), detail];
}

/** Only the kinds and marks the period has, then the band and the lines. */
function legend(chart: ChartData): HTMLElement {
  const kinds = (Object.keys(KINDS) as PointKind[]).filter((kind) => chart.points.some((point) => point.kind === kind));
  const marks = (Object.keys(MARKS) as PointMark[]).filter((mark) => chart.points.some((point) => point.mark === mark));
  const item = (picture: SVGElement, text: string) => el('li', {}, picture, text);
  const line = (kind: string) => svg('line', { class: `chart-line chart-line-${kind}`, x1: 1, x2: 19, y1: 10, y2: 10 });
  return el(
    'ul',
    { class: 'chart-legend' },
    ...kinds.map((kind) => item(icon(marker(kind, 'counts', 10, 10)), t(KINDS[kind]))),
    ...marks.map((mark) => item(icon(marker('official', mark, 10, 10)), t(MARKS[mark]))),
    chart.band && item(icon(svg('rect', { class: 'chart-band', x: 1, y: 3, width: 18, height: 14 })), t('chart.band')),
    chart.predicted !== null && item(icon(line('predicted')), t('chart.predicted', { rating: formatRating(chart.predicted) })),
    chart.official !== null && item(icon(line('official')), t('chart.official', { rating: formatRating(chart.official) })),
  );
}

/** The same rounds as a table, newest first like the round list. */
function table(chart: ChartData): HTMLElement {
  const head = (key: MessageKey) => el('th', { scope: 'col' }, t(key));
  return el(
    'details',
    { class: 'chart-table' },
    el('summary', {}, t('chart.table')),
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, head('chart.column.date'), head('chart.column.rating'), head('chart.column.status'), head('chart.column.round'))),
      el(
        'tbody',
        {},
        ...[...chart.points].reverse().map((point) => {
          const { round, result } = point.row;
          const name = [round.eventName, round.roundLabel && roundLabel(round.roundLabel), t(KINDS[point.kind]), tierNote(round)];
          return el(
            'tr',
            {},
            el('td', {}, formatDate(point.date)),
            el('td', { class: 'chart-number' }, formatRating(point.rating)),
            el('td', {}, t(`round.status.${result.status}`)),
            el('td', {}, name.filter(Boolean).join(' · ')),
          );
        }),
      ),
    ),
  );
}

/** "12 rounds · Last 24 months" for the closed card. */
export function chartTeaser(chart: ChartData): string {
  return t('chart.teaser', { count: chart.points.length, period: periodLabel(chart.period, chart.year) });
}

/** The card's content: the period, the chart with the chosen round under it, the legend and the table. */
export function chartPanel({ chart, today, onPeriod }: ChartProps): HTMLElement[] {
  const controls = periodControls({ id: 'chart', ...chart, today, recent: true, onPeriod });
  if (!chart.y || chart.points.length === 0) return [...controls, el('p', { class: 'chart-empty' }, t('chart.empty'))];
  return [...controls, ...plot(chart, chart.y), legend(chart), table(chart)];
}
