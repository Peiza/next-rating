import type { RatingStats, RoundStatus } from '../../engine';
import { t, type MessageKey } from '../../i18n';
import { el } from '../dom';
import { formatAverage, formatChange, formatDate, formatDateTime, formatRating } from '../format';
import type { ListedResult, Model } from '../model';

export interface RatingProps {
  model: Model;
  defaultPdgaNumber: number | null;
  onMakeDefault: (pdgaNumber: number) => void;
}

/** Every status has a symbol and a text label, so it never depends on colour alone. */
const STATUS: Record<RoundStatus, { symbol: string; label: MessageKey }> = {
  included: { symbol: '✓', label: 'round.status.included' },
  doubled: { symbol: '×2', label: 'round.status.doubled' },
  dropped: { symbol: '↓', label: 'round.status.dropped' },
  'outside-window': { symbol: '○', label: 'round.status.outside-window' },
  dnf: { symbol: '–', label: 'round.status.dnf' },
};

const SOURCE: Record<ListedResult['round']['source'], MessageKey> = {
  official: 'round.source.official',
  unofficial: 'round.source.unofficial',
  manual: 'round.source.manual',
};

const DASH = '–';

/** The arrow and the sign carry the direction, so it never depends on colour alone. */
function change(value: number): HTMLElement {
  const [direction, arrow] = value > 0 ? ['up', '↑'] : value < 0 ? ['down', '↓'] : ['none', '→'];
  return el(
    'p',
    { class: `change change-${direction}` },
    el('span', { class: 'change-arrow', 'aria-hidden': 'true' }, arrow),
    t('rating.change', { change: formatChange(value) }),
  );
}

function summary({ model, defaultPdgaNumber, onMakeDefault }: RatingProps): HTMLElement {
  const { player, prediction } = model;
  const official = player?.currentRating ?? null;
  return el(
    'div',
    { class: 'summary' },
    player &&
      el(
        'p',
        { class: 'player' },
        player.name
          ? t('rating.player', { name: player.name, number: player.pdgaNumber })
          : t('rating.playerNumber', { number: player.pdgaNumber }),
      ),
    prediction.rating !== null
      ? el('p', { id: 'predicted', class: 'predicted' }, formatRating(prediction.rating))
      : el('p', { id: 'predicted', class: 'lead' }, t('rating.none')),
    prediction.change !== null && change(prediction.change),
    official !== null &&
      el(
        'p',
        { class: 'official' },
        player?.ratingDate
          ? t('rating.official', { rating: formatRating(official), date: formatDate(player.ratingDate) })
          : t('rating.officialNoDate', { rating: formatRating(official) }),
      ),
    el('p', { class: 'hint' }, t('rating.lastImport', { time: formatDateTime(model.importedAt) })),
    player !== null &&
      player.pdgaNumber !== defaultPdgaNumber &&
      el(
        'button',
        { id: 'make-default', class: 'button', type: 'button', onclick: () => onMakeDefault(player.pdgaNumber) },
        t('rating.makeDefault', { number: player.pdgaNumber }),
      ),
  );
}

function roundLabel(label: string): string {
  return /^\d+$/.test(label) ? t('round.number', { number: label }) : label;
}

function roundItem({ round, result }: ListedResult): HTMLElement {
  const status = STATUS[result.status];
  const event = [round.eventName, round.roundLabel && roundLabel(round.roundLabel)].filter(Boolean).join(', ');
  const details = [
    formatDate(round.date),
    round.holes !== undefined && round.holes !== 18 ? t('round.holes', { count: round.holes }) : '',
    t(SOURCE[round.source]),
  ].filter(Boolean);
  return el(
    'li',
    { class: `round round-${result.status}` },
    el(
      'div',
      { class: 'round-main' },
      el('span', { class: 'round-rating' }, round.rating !== null ? formatRating(round.rating) : DASH),
      el(
        'span',
        { class: 'round-status' },
        el('span', { class: 'round-symbol', 'aria-hidden': 'true' }, status.symbol),
        ` ${t(status.label)}`,
      ),
    ),
    event && el('p', { class: 'round-event' }, event),
    el('p', { class: 'round-meta' }, details.join(' · ')),
  );
}

function statsPanel(stats: RatingStats, exact: number | null): HTMLElement {
  const count = (value: number) => formatRating(value);
  const average = (value: number | null) => (value === null ? DASH : formatAverage(value));
  const window =
    stats.windowMonths !== null && stats.windowStart !== null && stats.windowEnd !== null
      ? t('stats.windowValue', {
          months: stats.windowMonths,
          start: formatDate(stats.windowStart),
          end: formatDate(stats.windowEnd),
        })
      : DASH;
  const rows: [MessageKey, string][] = [
    ['stats.exact', average(exact)],
    ['stats.totalRounds', count(stats.totalRounds)],
    ['stats.dnfRounds', count(stats.dnfRounds)],
    ['stats.careerEvents', count(stats.careerEvents)],
    ['stats.window', window],
    ['stats.roundsInWindow', count(stats.roundsInWindow)],
    ['stats.roundsOutsideWindow', count(stats.roundsOutsideWindow)],
    ['stats.roundsDropped', count(stats.roundsDropped)],
    ['stats.roundsCounted', count(stats.roundsCounted)],
    ['stats.roundsDoubled', count(stats.roundsDoubled)],
    ['stats.averageAll', average(stats.averageAll)],
    ['stats.averageInWindow', average(stats.averageInWindow)],
    ['stats.averageCounted', average(stats.averageCounted)],
    ['stats.stdDev', average(stats.stdDev)],
    ['stats.meanMinusPoints', average(stats.meanMinusPoints)],
    ['stats.meanMinusStdDevs', average(stats.meanMinusStdDevs)],
    ['stats.dropThreshold', average(stats.dropThreshold)],
  ];
  return el(
    'details',
    { id: 'stats', class: 'stats' },
    el('summary', {}, t('stats.title')),
    el('dl', {}, ...rows.map(([key, value]) => el('div', { class: 'stat' }, el('dt', {}, t(key)), el('dd', {}, value)))),
  );
}

/** The Rating tab once there is imported data. */
export function ratingView(props: RatingProps): HTMLElement {
  const { model } = props;
  return el(
    'section',
    { class: 'view', 'aria-labelledby': 'view-title' },
    el('h1', { id: 'view-title' }, t('rating.title')),
    summary(props),
    model.needsNumber && el('p', { class: 'warning' }, t('rating.needsNumber')),
    model.pdgaNumber !== null &&
      model.eventsWithoutRounds.length > 0 &&
      el(
        'p',
        { class: 'hint' },
        t('rating.eventsWithoutRounds', {
          number: model.pdgaNumber,
          events: model.eventsWithoutRounds
            .map(({ name, date }) => name || (date ? formatDate(date) : DASH))
            .join(', '),
        }),
      ),
    statsPanel(model.prediction.stats, model.prediction.exact),
    model.rows.length > 0 && el('h2', {}, t('rating.rounds')),
    model.rows.length > 0 && el('ol', { class: 'rounds' }, ...model.rows.map(roundItem)),
    el('p', { class: 'notice' }, t('app.unofficial')),
  );
}
