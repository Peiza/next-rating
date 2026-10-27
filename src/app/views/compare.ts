import { t } from '../../i18n';
import type { CompareLine, HeadToHead } from '../compare';
import type { ListedRound } from '../../parsers';
import { disclosure, el, type Disclosure } from '../dom';
import { formatAverage, formatDate, formatPercent, formatRating } from '../format';
import { eventUrl, pdgaNotice } from './pdga';
import { roundLabel } from './round-text';

/*
 * Compare players: the players with imported data to pick from, each one's
 * figures in their own rating window side by side, and head-to-head
 * meetings for each pair of the picked players.
 */

export const COMPARE_ID = 'compare-title';

/** A pair of players, for its kept open round list. */
export function pairKey(a: number, b: number): string {
  return `${a}-${b}`;
}

export function compareCheckboxId(pdgaNumber: number): string {
  return `compare-${pdgaNumber}`;
}

export interface ComparePlayer {
  pdgaNumber: number;
  /** "Name #12345". */
  label: string;
  /** The player's name alone, or the label without one, for the table and the meetings. */
  name: string;
}

export interface CompareProps {
  /** The stored players with an import, in the players panel's order. */
  players: readonly ComparePlayer[];
  /** The picked players' PDGA numbers. */
  picked: readonly number[];
  /** The picked players' lines, in the order of `players`. */
  lines: readonly CompareLine[];
  /** Each pair of picked players, the first one's side. */
  meetings: readonly { a: number; b: number; result: HeadToHead }[];
  onPick: (pdgaNumber: number, picked: boolean) => void;
  /** Whether each pair's round list is open, by pairKey, kept through a re-render. */
  pairOpen?: (key: string) => Disclosure;
  onBack: () => void;
}

const DASH = '–';

function picker(props: CompareProps): HTMLElement {
  return el(
    'fieldset',
    { class: 'compare-picker' },
    el('legend', {}, t('compare.pick')),
    ...props.players.map(({ pdgaNumber, label }) =>
      el(
        'div',
        { class: 'check' },
        el('input', {
          id: compareCheckboxId(pdgaNumber),
          type: 'checkbox',
          checked: props.picked.includes(pdgaNumber),
          onchange: (change) => props.onPick(pdgaNumber, (change.target as HTMLInputElement).checked),
        }),
        el('label', { for: compareCheckboxId(pdgaNumber) }, label),
      ),
    ),
  );
}

/** "6 (14%)", the wins with their share of the events. */
function winsText({ wins, events }: CompareLine): string {
  if (wins === null) return DASH;
  return events ? t('compare.winsShare', { wins: formatRating(wins), percent: formatPercent(wins / events) }) : formatRating(wins);
}

function figuresTable(props: CompareProps, names: ReadonlyMap<number, string>): HTMLElement {
  const columns = ['compare.player', 'compare.rating', 'compare.events', 'compare.wins', 'compare.average'] as const;
  return el(
    'div',
    { class: 'compare-table' },
    el(
      'table',
      {},
      el('caption', {}, t('compare.figures')),
      el('thead', {}, el('tr', {}, ...columns.map((key) => el('th', { scope: 'col' }, t(key))))),
      el(
        'tbody',
        {},
        ...props.lines.map((line) =>
          el(
            'tr',
            {},
            el('th', { scope: 'row', class: 'compare-name' }, names.get(line.pdgaNumber) ?? ''),
            el('td', { class: 'compare-number' }, line.rating === null ? DASH : formatRating(line.rating)),
            el('td', { class: 'compare-number' }, line.events === null ? DASH : formatRating(line.events)),
            el('td', { class: 'compare-number' }, winsText(line)),
            el('td', { class: 'compare-number' }, line.average === null ? DASH : formatAverage(line.average)),
          ),
        ),
      ),
    ),
  );
}

/** "3 won, 1 lost, 1 tied", leaving out what is 0. */
function tally(won: number, lost: number, tied: number): string {
  return [
    won > 0 && t('compare.won', { count: won }),
    lost > 0 && t('compare.lost', { count: lost }),
    tied > 0 && t('compare.tied', { count: tied }),
  ]
    .filter((part): part is string => part !== false)
    .join(', ');
}

/** "Test Player 54 (950)", or the rating alone without a score; the round's winner in bold. */
function side(name: string, round: ListedRound, won: boolean): HTMLElement {
  const rating = formatRating(round.rating!);
  const text =
    round.score === undefined
      ? t('compare.sideRating', { name, rating })
      : t('compare.side', { name, score: formatRating(round.score), rating });
  return el(won ? 'strong' : 'span', {}, text);
}

/** Each round both played, by event: its name, linked, and date, then a line per round. */
function roundList(
  played: HeadToHead['played'],
  [nameA, nameB]: [string, string],
  state: Disclosure | undefined,
): HTMLElement {
  const events: HeadToHead['played'][] = [];
  for (const pair of played) {
    const last = events.at(-1);
    if (last && last[0]!.mine.eventKey === pair.mine.eventKey) last.push(pair);
    else events.push([pair]);
  }
  return el(
    'details',
    { class: 'compare-rounds', ...disclosure(state) },
    el('summary', {}, t('compare.showRounds', { count: played.length })),
    ...events.map((pairs) => {
      const { eventId, eventName, date } = pairs[0]!.mine;
      return el(
        'div',
        { class: 'compare-event' },
        el(
          'p',
          { class: 'compare-event-name' },
          eventId === null ? eventName : el('a', { href: eventUrl(eventId), rel: 'noreferrer' }, eventName),
          ` · ${formatDate(date)}`,
        ),
        el(
          'ul',
          {},
          ...pairs.map(({ mine, theirs }) => {
            const same = mine.layout === theirs.layout;
            const layouts = same
              ? (mine.layout ?? '')
              : [mine.layout && `${nameA}: ${mine.layout}`, theirs.layout && `${nameB}: ${theirs.layout}`].filter(Boolean).join(' · ');
            return el(
              'li',
              {},
              el('span', { class: 'compare-round-name' }, roundLabel(mine.roundLabel)),
              layouts && el('span', { class: 'compare-round-layout' }, layouts),
              el(
                'span',
                { class: 'compare-round-result' },
                side(nameA, mine, mine.rating! > theirs.rating!),
                ' – ',
                side(nameB, theirs, theirs.rating! > mine.rating!),
              ),
            );
          }),
        ),
      );
    }),
  );
}

function meeting(
  { a, b, result }: CompareProps['meetings'][number],
  names: ReadonlyMap<number, string>,
  state: Disclosure | undefined,
): HTMLElement {
  const title = t('compare.versus', { a: names.get(a) ?? '', b: names.get(b) ?? '' });
  if (result.rounds === 0) return el('li', {}, el('strong', {}, title), ' ', t('compare.neverMet'));
  return el(
    'li',
    {},
    el('strong', {}, title),
    el(
      'p',
      {},
      t('compare.eventsMet', { count: result.events }),
      ': ',
      tally(result.eventsWon, result.eventsLost, result.eventsTied),
    ),
    el(
      'p',
      {},
      t('compare.roundsMet', { count: result.rounds }),
      ': ',
      tally(result.roundsWon, result.roundsLost, result.roundsTied),
    ),
    roundList(result.played, [names.get(a) ?? '', names.get(b) ?? ''], state),
  );
}

export function compareView(props: CompareProps): HTMLElement {
  const names = new Map(props.players.map((player) => [player.pdgaNumber, player.name]));
  const enough = props.lines.length >= 2;
  return el(
    'section',
    { class: 'view compare', 'aria-labelledby': COMPARE_ID },
    // On phones the top bar shows the heading instead, so only one h1 shows.
    el('h1', { id: COMPARE_ID, class: 'wide-only', tabindex: -1 }, t('compare.title')),
    el('p', {}, t('compare.intro')),
    props.players.length < 2 ? el('p', { class: 'hint' }, t('compare.tooFew')) : picker(props),
    props.players.length >= 2 && !enough && el('p', { class: 'hint' }, t('compare.pickTwo')),
    enough && figuresTable(props, names),
    enough && el('h2', {}, t('compare.meetings')),
    enough && el('p', { class: 'hint' }, t('compare.meetingsHint')),
    enough && el('ul', { class: 'compare-meetings' }, ...props.meetings.map((item) => meeting(item, names, props.pairOpen?.(pairKey(item.a, item.b))))),
    el('button', { id: 'compare-back', class: 'button button-block', type: 'button', onclick: props.onBack }, t('setup.back')),
    pdgaNotice(),
  );
}
