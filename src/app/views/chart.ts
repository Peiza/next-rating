import type { PlainDate } from '../../engine';
import { t, type MessageKey } from '../../i18n';
import {
  dayNumber,
  monthTicks,
  ratingAxis,
  type ChartData,
  type ChartPeriod,
  type ChartPoint,
  type MonthTick,
  type PointKind,
  type PointMark,
  type RatingAxis,
} from '../chart';
import { el, present, svg, type Child } from '../dom';
import { formatDate, formatDayMonth, formatMonth, formatRating } from '../format';
import { historyUrl } from './pdga';
import { periodControls, periodId, periodLabel } from './period';
import { roundLabel, roundWhere, tierNote } from './round-text';

/*
 * The Chart card on the Rating tab: round ratings over time as inline SVG,
 * drawn here without a chart library. The shape tells where a round comes
 * from, the fill what the next update does with it, so nothing depends on
 * colour alone. Colours come from the theme tokens through classes in
 * styles.css (the CSP blocks inline styles). Tapping a point, or the arrow
 * keys, show its round above the chart; a table holds the same rounds.
 */

export const CHART_PERIOD_ID = periodId('chart');
export const CHART_PLOT_ID = 'chart-plot';
export const CHART_DETAIL_ID = 'chart-detail';

export interface ChartProps {
  chart: ChartData;
  /** The shown player, whose ratings history on pdga.com the chart links to. */
  pdgaNumber: number;
  /** Today, which ends a custom range when one is first picked. */
  today: PlainDate;
  onPeriod: (period: ChartPeriod) => void;
  /** Opens the full-screen view; without it the card has no Full screen button. */
  onFullScreen?: () => void;
}

export const CHART_FULL_BUTTON_ID = 'chart-full-screen';
export const CHART_FULL_TITLE_ID = 'chart-full-title';
export const CHART_FULL_CLOSE_ID = 'chart-full-close';

/**
 * The chart is drawn in CSS pixels at the size it is shown, so the text
 * keeps its size on any screen. Until that size is known (before layout, or
 * without ResizeObserver) it draws at the default size, which styles.css
 * scales to fit.
 */
export const DEFAULT_SIZE = { width: 300, height: 200 } as const;
/** In the card, the height is two thirds of the width, within these limits. */
const CARD_HEIGHT = { min: 200, max: 320 } as const;
/** Narrower or lower than this, the drawing is scaled down instead. */
const MIN_SIZE = { width: 240, height: 160 } as const;
/** The top margin leaves a strip for the corner button (36 px, its icon in the top 20), so it covers no point or line value. */
const MARGIN = { left: 34, right: 34, top: 26, bottom: 30 } as const;
/** About this much room per labelled month tick and per gap between rating ticks. */
const TICK_WIDTH = 52;
const GAP_HEIGHT = 32;
/** Line labels closer than this are moved apart. */
const LABEL_GAP = 13;
/** A tap selects the nearest point within this many screen pixels. */
const TAP_RADIUS = 24;
/** A mouse over a point shows its tooltip after this many ms, this many pixels from the pointer. */
export const HOVER_DELAY = 100;
const TIP_OFFSET = 12;

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

/** The card's chart height for a width. */
export function cardHeight(width: number): number {
  return Math.min(CARD_HEIGHT.max, Math.max(CARD_HEIGHT.min, Math.round((width * 2) / 3)));
}

/** Where everything goes at one size: the plot's edges, the ticks that fit, and the scales. */
interface Layout {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  axis: RatingAxis;
  ticks: MonthTick[];
  x: (date: PlainDate) => number;
  y: (rating: number) => number;
}

function layoutOf(chart: ChartData, width: number, height: number): Layout {
  const [left, right, top, bottom] = [MARGIN.left, width - MARGIN.right, MARGIN.top, height - MARGIN.bottom];
  const axis = ratingAxis(chart.values, Math.max(2, Math.floor((bottom - top) / GAP_HEIGHT)))!;
  const ticks = monthTicks(chart.from, chart.to, Math.max(2, Math.floor((right - left) / TICK_WIDTH)));
  const start = dayNumber(chart.from);
  const days = Math.max(1, dayNumber(chart.to) - start);
  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    axis,
    ticks,
    x: (date) => left + ((dayNumber(date) - start) / days) * (right - left),
    y: (rating) => top + ((axis.max - rating) / (axis.max - axis.min)) * (bottom - top),
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

function yAxis(layout: Layout): SVGElement {
  return svg(
    'g',
    { class: 'chart-axis' },
    ...layout.axis.ticks.flatMap((tick) => [
      svg('line', { class: 'chart-grid', x1: layout.left, x2: layout.right, y1: layout.y(tick), y2: layout.y(tick) }),
      svg('text', { x: layout.left - 5, y: layout.y(tick), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, formatRating(tick)),
    ]),
  );
}

/** A month tick reads "Oct", with the year under it on the first tick and on January; a range end reads "12 Oct". */
function tickLabel(tick: MonthTick, x: number, layout: Layout): SVGElement {
  const first = tick.date.endsWith('-01') ? formatMonth(tick.date) : formatDayMonth(tick.date);
  const anchor = x < layout.left + 12 ? 'start' : x > layout.right - 12 ? 'end' : 'middle';
  return svg(
    'text',
    { x, y: layout.bottom + 13, 'text-anchor': anchor },
    svg('tspan', { x }, first),
    tick.year && svg('tspan', { x, dy: 13 }, tick.date.slice(0, 4)),
  );
}

function xAxis(layout: Layout): SVGElement {
  const { left, right, bottom } = layout;
  return svg(
    'g',
    { class: 'chart-axis' },
    svg('line', { class: 'chart-baseline', x1: left, x2: right, y1: bottom, y2: bottom }),
    ...layout.ticks.flatMap((tick) => {
      const x = layout.x(tick.date);
      return [svg('line', { class: 'chart-baseline', x1: x, x2: x, y1: bottom, y2: bottom + 4 }), tickLabel(tick, x, layout)];
    }),
  );
}

/**
 * The official and predicted ratings as lines across the window, each with
 * its value just after the line's end. When they are equal, the prediction's
 * line alone shows the value. Values too close to read apart are moved apart.
 */
function ratingLines(chart: ChartData, layout: Layout): SVGElement[] {
  if (!chart.band) return [];
  const lines = [
    chart.official !== null && !chart.same && { value: chart.official, kind: 'official' },
    chart.predicted !== null && { value: chart.predicted, kind: 'predicted' },
  ].filter((line): line is { value: number; kind: string } => line !== false);
  const [x1, x2] = [layout.x(chart.band.from), layout.x(chart.band.to)];
  const labels = lines.map((line) => layout.y(line.value));
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
      x1,
      x2,
      y1: layout.y(line.value),
      y2: layout.y(line.value),
    }),
    svg(
      'text',
      { class: 'chart-line-label', x: x2 + 4, y: labels[i]!, 'dominant-baseline': 'middle' },
      formatRating(line.value),
    ),
  ]);
}

/** "985 · Counts twice · Example Open · Round 2 · date · Unofficial". */
function pointText(point: ChartPoint): string {
  const { round, result } = point.row;
  return [formatRating(point.rating), t(`round.status.${result.status}`), roundWhere(round), t(KINDS[point.kind])].filter(Boolean).join(' · ');
}

/** The tooltip's lines: the event and round (or the kind, for an own round without a name), the date, then the rating and status. */
function tipText(point: ChartPoint): string[] {
  const { round, result } = point.row;
  const event = [round.eventName, round.roundLabel && roundLabel(round.roundLabel), tierNote(round)].filter(Boolean).join(' · ');
  return [event || t(KINDS[point.kind]), formatDate(point.date), `${formatRating(point.rating)} · ${t(`round.status.${result.status}`)}`];
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
    chart.same && t('chart.summaryBoth', { rating: formatRating(chart.predicted!) }),
    !chart.same && chart.predicted !== null && t('chart.summaryPredicted', { rating: formatRating(chart.predicted) }),
    !chart.same && chart.official !== null && t('chart.summaryOfficial', { rating: formatRating(chart.official) }),
  ];
  return parts.filter(Boolean).join(' ');
}

/** The small button in the chart's top right corner: Full screen in the card, Exit full screen in the full-screen view. */
interface Corner {
  id: string;
  label: MessageKey;
  /** True for corners pointing inward, as on Exit full screen. */
  inward: boolean;
  onClick: () => void;
}

const CORNERS = {
  out: 'M2 7V2h5M13 2h5v5M18 13v5h-5M7 18H2v-5',
  in: 'M7 2v5H2M13 2v5h5M18 13h-5v5M2 13h5v5',
} as const;

function cornerButton({ id, label, inward, onClick }: Corner): HTMLElement {
  return el(
    'button',
    { id, class: 'chart-corner', type: 'button', 'aria-label': t(label), onclick: onClick },
    icon(svg('path', { class: 'chart-corners', d: inward ? CORNERS.in : CORNERS.out })),
  );
}

export interface PlotOptions {
  /** The plot's and the chosen round's ids. */
  plotId: string;
  detailId: string;
  /**
   * True for the full-screen view: the frame fills the view's height and the
   * chosen round shows as a label in the chart's corner. Else the card's
   * height for the width, with the chosen round in a line above the chart.
   */
  full: boolean;
  corner?: Corner;
}

const CARD_PLOT: PlotOptions = { plotId: CHART_PLOT_ID, detailId: CHART_DETAIL_ID, full: false };

/** A label this close to the chosen point moves to the other corner. */
const LABEL_CLEARANCE = 12;

/**
 * The chart in its frame, with the corner button. In the card, the details
 * line that names the chosen round comes first, above the chart so a finger
 * on the chart does not cover it; full screen, the round shows as a label in
 * the top left corner, or the top right while the point is under it. The
 * chart is drawn again at the frame's size whenever that changes, keeping
 * the chosen round. A tap picks the nearest point within TAP_RADIUS pixels;
 * the arrow keys step through the points, Home and End jump to the first and
 * last.
 */
export function plot(chart: ChartData, { plotId, detailId, full, corner }: PlotOptions = CARD_PLOT): HTMLElement[] {
  const highlight = svg('circle', { class: 'chart-selected', r: 10, cx: -100, cy: -100, visibility: 'hidden' });
  // The label stays empty, and so hidden, until a round is chosen.
  const detail = full
    ? el('p', { id: detailId, class: 'chart-label', 'aria-live': 'polite' })
    : el('p', { id: detailId, class: 'chart-detail', 'aria-live': 'polite' }, t('chart.hint'));
  let placed: { point: ChartPoint; x: number; y: number }[] = [];
  let size: { width: number; height: number } = DEFAULT_SIZE;
  let chosen = -1;

  const mark = () => {
    if (chosen < 0) return;
    const { x, y } = placed[chosen]!;
    highlight.setAttribute('cx', String(x));
    highlight.setAttribute('cy', String(y));
    highlight.setAttribute('visibility', 'visible');
  };

  /** Full screen, the label moves to the top right while the chosen point is under it in the top left. */
  const placeLabel = () => {
    if (!full || chosen < 0) return;
    detail.classList.remove('chart-label-right');
    const box = drawing.getBoundingClientRect();
    if (box.width === 0) return;
    const scale = box.width / size.width;
    const { x, y } = placed[chosen]!;
    const under =
      x * scale < detail.offsetLeft + detail.offsetWidth + LABEL_CLEARANCE &&
      y * scale < detail.offsetTop + detail.offsetHeight + LABEL_CLEARANCE;
    detail.classList.toggle('chart-label-right', under);
  };

  const choose = (index: number) => {
    chosen = index;
    mark();
    detail.textContent = pointText(placed[index]!.point);
    placeLabel();
  };

  /** The point nearest to a place on the screen, within TAP_RADIUS pixels, or -1. */
  const nearestTo = (clientX: number, clientY: number): number => {
    const box = drawing.getBoundingClientRect();
    if (box.width === 0) return -1;
    const units = size.width / box.width;
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
    return nearest;
  };

  const onTap = (event: Event) => {
    const { clientX, clientY } = event as PointerEvent;
    const nearest = nearestTo(clientX, clientY);
    if (nearest >= 0) choose(nearest);
  };

  /*
   * A mouse or pen over a point shows its round in a tooltip by the pointer,
   * once it has stayed there HOVER_DELAY ms. Touch has no hover, so a tap
   * chooses the point as before. Screen readers get the round from the
   * details line instead, so the tooltip is hidden from them.
   */
  const tip = el('div', { class: 'chart-tip', 'aria-hidden': 'true', hidden: true });
  let hovered = -1;
  let pointer = { x: 0, y: 0 };
  let timer: ReturnType<typeof setTimeout> | undefined;

  const hideTip = () => {
    clearTimeout(timer);
    timer = undefined;
    hovered = -1;
    tip.hidden = true;
  };

  /** By the pointer, above and to the right, or on the other side where the frame ends. */
  const placeTip = () => {
    const box = frame.getBoundingClientRect();
    const [x, y] = [pointer.x - box.left, pointer.y - box.top];
    const [width, height] = [tip.offsetWidth, tip.offsetHeight];
    let left = x + TIP_OFFSET;
    if (left + width > box.width) left = x - TIP_OFFSET - width;
    let top = y - TIP_OFFSET - height;
    if (top < 0) top = y + TIP_OFFSET;
    // CSSOM, which the CSP allows; it only blocks style attributes.
    tip.style.left = `${Math.max(0, Math.round(left))}px`;
    tip.style.top = `${Math.max(0, Math.round(top))}px`;
  };

  const showTip = () => {
    timer = undefined;
    tip.replaceChildren(...tipText(placed[hovered]!.point).map((line) => el('span', {}, line)));
    tip.hidden = false;
    placeTip();
  };

  const onHover = (event: Event) => {
    const { pointerType, clientX, clientY } = event as PointerEvent;
    if (pointerType === 'touch') return;
    pointer = { x: clientX, y: clientY };
    const nearest = nearestTo(clientX, clientY);
    if (nearest === hovered) {
      if (!tip.hidden) placeTip();
      return;
    }
    hideTip();
    if (nearest < 0) return;
    hovered = nearest;
    timer = setTimeout(showTip, HOVER_DELAY);
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

  const drawing = svg('svg', {
    id: plotId,
    class: 'chart-plot',
    role: 'img',
    'aria-label': summaryText(chart),
    'aria-describedby': detailId,
    tabindex: 0,
    onpointerup: onTap,
    onpointermove: onHover,
    onpointerleave: hideTip,
    onkeydown: onKey,
  });

  const draw = (width: number, height: number) => {
    // The points move, so a tooltip would no longer be by its point.
    hideTip();
    size = { width, height };
    const layout = layoutOf(chart, width, height);
    placed = chart.points.map((point) => ({ point, x: layout.x(point.date), y: layout.y(point.rating) }));
    drawing.setAttribute('viewBox', `0 0 ${width} ${height}`);
    drawing.setAttribute('width', String(width));
    drawing.setAttribute('height', String(height));
    drawing.replaceChildren(
      ...present([
        chart.band &&
          svg('rect', {
            class: 'chart-band',
            x: layout.x(chart.band.from),
            y: layout.top,
            width: Math.max(1, layout.x(chart.band.to) - layout.x(chart.band.from)),
            height: layout.bottom - layout.top,
          }),
        yAxis(layout),
        xAxis(layout),
        ...ratingLines(chart, layout),
        ...placed.map(({ point, x, y }) => marker(point.kind, point.mark, x, y)),
        highlight,
      ]),
    );
    mark();
    placeLabel();
  };

  const frame = el(
    'div',
    { class: full ? 'chart-frame chart-frame-fill' : 'chart-frame' },
    drawing,
    full && detail,
    tip,
    corner && cornerButton(corner),
  );
  draw(size.width, size.height);
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(([entry]) => {
      // A frame taken out of the page reports no size; it is not drawn again.
      if (!frame.isConnected) return observer.disconnect();
      const measured = Math.floor(entry!.contentRect.width);
      if (measured === 0) return;
      const width = Math.max(MIN_SIZE.width, measured);
      const height = full ? Math.max(MIN_SIZE.height, Math.floor(entry!.contentRect.height)) : cardHeight(width);
      if (width !== size.width || height !== size.height) draw(width, height);
    });
    observer.observe(frame);
  }
  return full ? [frame] : [detail, frame];
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
    chart.same && item(icon(line('predicted')), t('chart.both', { rating: formatRating(chart.predicted!) })),
    !chart.same && chart.predicted !== null && item(icon(line('predicted')), t('chart.predicted', { rating: formatRating(chart.predicted) })),
    !chart.same && chart.official !== null && item(icon(line('official')), t('chart.official', { rating: formatRating(chart.official) })),
  );
}

/** The same rounds as a table, newest first like the round list. Event names wrap; dates and ratings keep to one line. */
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
            el('td', { class: 'chart-date' }, formatDate(point.date)),
            el('td', { class: 'chart-number' }, formatRating(point.rating)),
            el('td', {}, t(`round.status.${result.status}`)),
            el('td', { class: 'chart-event' }, name.filter(Boolean).join(' · ')),
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

/**
 * The official rating after each past update is on pdga.com, so the chart
 * links there instead of drawing it. A plain link in the same tab.
 */
function historyLink(pdgaNumber: number): HTMLElement {
  return el('p', { class: 'chart-history' }, el('a', { href: historyUrl(pdgaNumber), rel: 'noreferrer' }, t('chart.history')));
}

/** The card's content: the period, the chosen round and the chart, the legend, the history link and the table. */
export function chartPanel({ chart, pdgaNumber, today, onPeriod, onFullScreen }: ChartProps): HTMLElement[] {
  const controls = periodControls({ id: 'chart', ...chart, today, recent: true, onPeriod });
  if (chart.points.length === 0) return [...controls, el('p', { class: 'chart-empty' }, t('chart.empty')), historyLink(pdgaNumber)];
  const corner = onFullScreen && { id: CHART_FULL_BUTTON_ID, label: 'chart.fullScreen' as const, inward: false, onClick: onFullScreen };
  return [...controls, ...plot(chart, { ...CARD_PLOT, corner }), legend(chart), historyLink(pdgaNumber), table(chart)];
}

export interface ChartFullProps extends ChartProps {
  onClose: () => void;
}

/**
 * The chart alone over the whole page, for a phone turned sideways: only the
 * chart, with the chosen round as a label in its corner and Exit full screen
 * in the other. The period, legend, link and table stay in the card; its
 * heading is for screen readers. Back, Exit full screen or Escape close it.
 * Its ids differ from the card's, though the card is not shown under it.
 */
export function chartFullView({ chart, onClose }: ChartFullProps): HTMLElement {
  const corner: Corner = { id: CHART_FULL_CLOSE_ID, label: 'chart.exitFullScreen', inward: true, onClick: onClose };
  const body =
    chart.points.length === 0
      ? [el('div', { class: 'chart-frame chart-frame-fill' }, el('p', { class: 'chart-empty' }, t('chart.empty')), cornerButton(corner))]
      : plot(chart, { plotId: 'chart-full-plot', detailId: 'chart-full-detail', full: true, corner });
  return el(
    'div',
    {
      class: 'chart-full',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': CHART_FULL_TITLE_ID,
      onkeydown: (event) => {
        if ((event as KeyboardEvent).key === 'Escape') onClose();
      },
    },
    el('h1', { id: CHART_FULL_TITLE_ID, class: 'visually-hidden', tabindex: -1 }, t('chart.title')),
    ...body,
  );
}
