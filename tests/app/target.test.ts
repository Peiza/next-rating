// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoredImport } from '../../src/app/import';
import { formatDate, formatDayMonth } from '../../src/app/format';
import { buildModel, manualToRounds } from '../../src/app/model';
import { DEFAULT_CARDS, type StoredManualRound } from '../../src/app/storage';
import {
  calculateTarget,
  emptyTargetDraft,
  readTarget,
  targetDates,
  targetUpdate,
  type TargetAnswer,
  type TargetDraft,
} from '../../src/app/target';
import { ratingView } from '../../src/app/views/rating';
import { targetCalculator, type TargetProps } from '../../src/app/views/target';
import { setLanguage } from '../../src/i18n';
import { rawDetailsRow, rawPlayer } from '../handoff/raw';

afterEach(() => setLanguage('en'));

/** One official 950 round from 2 August 2026; the official rating is from 8 September. */
const STORED: StoredImport = { at: '2026-10-19T10:00:00.000Z', player: rawPlayer(), details: [rawDetailsRow()], events: [] };
const NOW = new Date('2026-10-20T10:00:00.000Z');
const TODAY = '2026-10-20';
const DATES = { min: TODAY, max: '2027-10-20' };

/** The November 2026 update: Tuesday the 10th, for events reported by Sunday the 8th. */
const NOVEMBER = { update: '2026-11-10', deadline: '2026-11-08' };
const DECEMBER = { update: '2026-12-08', deadline: '2026-12-06' };
const JANUARY = { update: '2027-01-12', deadline: '2027-01-10' };
const APRIL = { update: '2027-04-13', deadline: '2027-04-11' };
/** As the device locale shows them, "10 Nov" or "Nov 10". */
const NOV_10 = formatDayMonth(NOVEMBER.update);
const NOV_8 = formatDayMonth(NOVEMBER.deadline);
const DEC_8 = formatDayMonth(DECEMBER.update);
const ON_TODAY = formatDate(TODAY);

/** A manual 1000 round from November 2024: inside the 24-month window today, outside it from December. */
const OLD_MANUAL: StoredManualRound = { id: 'm1', rating: 1000, date: '2024-11-15', eventName: 'Autumn Open', holes: null };

function draft(extra: Partial<TargetDraft> = {}): TargetDraft {
  return { ...emptyTargetDraft(950, TODAY), ...extra };
}

function props(extra: Partial<TargetProps> = {}): TargetProps {
  return { draft: draft(), dates: DATES, answer: null, onDraft: vi.fn(), onCalculate: vi.fn(), ...extra };
}

/** The card's content in one element, as the card shows it. */
function calculator(target: TargetProps): HTMLElement {
  const view = document.createElement('div');
  view.append(targetCalculator(target));
  return view;
}

function answer(result: Partial<TargetAnswer['result']>, extra: Partial<TargetAnswer> = {}): TargetAnswer {
  return {
    query: { target: 1000, count: 3, date: TODAY },
    update: NOVEMBER,
    missed: null,
    result: { without: 990, reached: false, average: 1012, rating: 1000, leaving: [], ...result },
    leaving: [],
    ...extra,
  };
}

/** The date note of an answer for 3 rounds with the last one today, and the last note when no round leaves. */
const UPDATE_LINE = `Last round on ${ON_TODAY}, report deadline ${NOV_8}.`;
const NONE_LINE = `No rounds leave the window by ${ON_TODAY}.`;

function lines(view: HTMLElement): string[] {
  return [...view.querySelectorAll('#target-status p')].map((p) => p.textContent!);
}

/** Each line of the answer with its class: the figure, the sentence saying what it is, or a muted note. */
function parts(view: HTMLElement): [string, string][] {
  return [...view.querySelectorAll('#target-status p')].map((p) => [p.className, p.textContent!]);
}

function submit(view: HTMLElement) {
  view.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('target input', () => {
  it('starts on the next multiple of 10 above the prediction, for 3 rounds, on the earliest date', () => {
    expect(emptyTargetDraft(950, TODAY)).toEqual({ target: '960', count: '3', date: TODAY });
    expect(emptyTargetDraft(996, TODAY)).toEqual({ target: '1000', count: '3', date: TODAY });
    expect(emptyTargetDraft(null, TODAY)).toEqual({ target: '', count: '3', date: TODAY });
  });

  it('allows dates from today, or the newest stored round when later, to a year ahead', () => {
    expect(targetDates(buildModel(STORED, 100001, NOW), TODAY)).toEqual(DATES);
    const upcoming: StoredManualRound[] = [{ id: 'm2', rating: 980, date: '2026-11-01', eventName: '', holes: null }];
    const model = buildModel(STORED, 100001, NOW, manualToRounds([OLD_MANUAL, ...upcoming]));
    expect(targetDates(model, TODAY)).toEqual({ min: '2026-11-01', max: '2027-10-20' });
  });

  it('reads whole numbers and a date within limits, or names the first field that is not valid', () => {
    expect(readTarget({ target: ' 1000 ', count: '3', date: TODAY }, DATES)).toEqual({
      query: { target: 1000, count: 3, date: TODAY },
    });
    expect(readTarget({ target: '2000', count: '20', date: DATES.max }, DATES)).toEqual({
      query: { target: 2000, count: 20, date: DATES.max },
    });
    const read = (target: string, count: string, date = TODAY) => {
      const result = readTarget({ target, count, date }, DATES);
      return 'field' in result ? [result.field, result.error] : null;
    };
    expect(read('', '3')).toEqual(['target', 'target.targetInvalid']);
    expect(read('0', '3')![0]).toBe('target');
    expect(read('2001', '3')![0]).toBe('target');
    expect(read('999.5', '3')![0]).toBe('target');
    expect(read('1000', '0')).toEqual(['count', 'target.countInvalid']);
    expect(read('1000', '21')![0]).toBe('count');
    expect(read('1000', '')![0]).toBe('count');
    expect(read('1000', '3', '')).toEqual(['date', 'target.dateMissing']);
    expect(read('1000', '3', '2026-10-19')).toEqual(['date', 'target.dateTooEarly']);
    expect(read('1000', '3', '2027-10-21')).toEqual(['date', 'target.dateTooLate']);
  });
});

describe('targetUpdate', () => {
  it('is the next update up to its report deadline', () => {
    expect(targetUpdate('2026-10-20', NOVEMBER)).toEqual({ update: NOVEMBER, missed: null });
    expect(targetUpdate('2026-11-08', NOVEMBER)).toEqual({ update: NOVEMBER, missed: null });
  });

  it('is the following update on the Monday and Tuesday of update week, before PDGA publishes', () => {
    expect(targetUpdate('2026-11-09', NOVEMBER)).toEqual({ update: DECEMBER, missed: NOVEMBER.deadline });
    expect(targetUpdate('2026-11-10', NOVEMBER)).toEqual({ update: DECEMBER, missed: NOVEMBER.deadline });
  });

  it('is the next update again once PDGA has published', () => {
    // On update day, the official rating dated that day already moved the next update on.
    expect(targetUpdate('2026-11-10', DECEMBER)).toEqual({ update: DECEMBER, missed: null });
  });

  it('is the first update whose deadline a later date makes', () => {
    expect(targetUpdate('2026-12-01', NOVEMBER)).toEqual({ update: DECEMBER, missed: null });
    expect(targetUpdate('2026-12-06', NOVEMBER)).toEqual({ update: DECEMBER, missed: null });
    expect(targetUpdate('2027-03-14', NOVEMBER)).toEqual({ update: APRIL, missed: null });
  });

  it('misses a later update when the date is the Monday or Tuesday of its week', () => {
    expect(targetUpdate('2026-12-07', NOVEMBER)).toEqual({ update: JANUARY, missed: DECEMBER.deadline });
    expect(targetUpdate('2026-12-08', NOVEMBER)).toEqual({ update: JANUARY, missed: DECEMBER.deadline });
  });
});

describe('calculateTarget', () => {
  it('finds the average on the rounds of the prediction', () => {
    // (950 + 3 × R) / 4 must round to 970, so R ≥ 976.
    const model = buildModel(STORED, 100001, NOW);
    expect(calculateTarget(model, { target: 970, count: 3, date: TODAY })).toEqual({
      query: { target: 970, count: 3, date: TODAY },
      update: NOVEMBER,
      missed: null,
      result: { without: 950, reached: false, average: 976, rating: 970, leaving: [] },
      leaving: [],
    });
  });

  it('includes manual rounds', () => {
    // (950 + 1000 + 3 × R) / 5 must round to 970, so R ≥ 966.
    const manual: StoredManualRound[] = [{ id: 'm1', rating: 1000, date: '2026-10-01', eventName: '', holes: null }];
    const model = buildModel(STORED, 100001, NOW, manualToRounds(manual));
    expect(calculateTarget(model, { target: 970, count: 3, date: TODAY }).result.average).toBe(966);
  });

  it('is for the following update on the Monday of update week', () => {
    const now = new Date('2026-11-09T10:00:00.000Z');
    const model = buildModel(STORED, 100001, now);
    const answer = calculateTarget(model, { target: 970, count: 3, date: '2026-11-09' });
    expect(answer).toMatchObject({ update: DECEMBER, missed: NOVEMBER.deadline });
    expect(answer.result.average).toBe(976);
  });

  it('lets a round leave the window with a later date, and lists it', () => {
    // Fewer than 8 rounds, so the window is 24 months back from the last new
    // round: from 20 Oct 2024 it holds the November 2024 round, from 1 Dec 2024 not.
    const model = buildModel(STORED, 100001, NOW, manualToRounds([OLD_MANUAL]));
    const today = calculateTarget(model, { target: 970, count: 3, date: TODAY });
    expect(today.result.average).toBe(966);
    expect(today.leaving).toEqual([]);
    const later = calculateTarget(model, { target: 970, count: 3, date: '2026-12-01' });
    expect(later.update).toEqual(DECEMBER);
    expect(later.result.average).toBe(976);
    expect(later.leaving.map((round) => [round.rating, round.date])).toEqual([[1000, '2024-11-15']]);
  });
});

describe('target calculator view', () => {
  it('shows a calendar icon after the date field', () => {
    const view = calculator(props());
    const field = view.querySelector<HTMLInputElement>('#target-date')!;
    expect(field.parentElement!.className).toBe('date-input');
    expect(field.nextElementSibling!.matches('svg.date-icon[aria-hidden="true"]')).toBe(true);
  });

  it('is a closed card until opened, and starts with its explanation', () => {
    const model = buildModel(STORED, 100001, NOW);
    const page = (open: boolean) =>
      ratingView({ model, target: props(), cards: { ...DEFAULT_CARDS, target: open }, favorite: true, now: NOW, onAddFavorite: vi.fn() });
    const closed = page(false);
    expect(closed.querySelector('#target-toggle')!.getAttribute('aria-expanded')).toBe('false');
    expect(closed.querySelector('#target form')).toBeNull();
    const body = page(true).querySelector('#target-body')!;
    expect(body.firstElementChild!.textContent).toBe(
      'The average round rating your next rounds need to reach a rating at the update they count in.',
    );
    expect(body.querySelector('form')).not.toBeNull();
  });

  it('puts the target first, then the rounds and the date, and Calculate last, before the answer', () => {
    const form = calculator(props()).querySelector('form')!;
    const inputs = [...form.querySelectorAll('input')];
    expect(inputs.map((input) => [input.id, input.value, input.type])).toEqual([
      ['target-rating', '960', 'text'],
      ['target-count', '3', 'text'],
      ['target-date', TODAY, 'date'],
    ]);
    const date = form.querySelector('#target-date')!;
    expect([date.getAttribute('min'), date.getAttribute('max')]).toEqual([DATES.min, DATES.max]);
    expect(form.querySelector('#target-calculate')!.nextElementSibling!.id).toBe('target-status');
  });

  it('names the date in the hint, and follows it as it changes', () => {
    const onDraft = vi.fn();
    const view = calculator(props({ onDraft }));
    const hint = () => view.querySelector('#target-hint')!.textContent;
    expect(hint()).toBe(`Counts 18-hole rounds, the last one on ${ON_TODAY}, with the same rules as the prediction.`);
    const input = view.querySelector<HTMLInputElement>('#target-date')!;
    input.value = '2026-12-01';
    input.dispatchEvent(new Event('input'));
    expect(onDraft).toHaveBeenCalledWith('date', '2026-12-01');
    expect(hint()).toBe(`Counts 18-hole rounds, the last one on ${formatDate('2026-12-01')}, with the same rules as the prediction.`);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(hint()).toBe('Counts 18-hole rounds, with the same rules as the prediction.');
  });

  it('calculates with the typed values', () => {
    const onCalculate = vi.fn();
    const view = calculator(props({ onCalculate }));
    view.querySelector<HTMLInputElement>('#target-rating')!.value = '1000';
    view.querySelector<HTMLInputElement>('#target-count')!.value = '5';
    view.querySelector<HTMLInputElement>('#target-date')!.value = '2027-03-14';
    submit(view);
    expect(onCalculate).toHaveBeenCalledWith({ target: 1000, count: 5, date: '2027-03-14' });
  });

  it('marks a field that is not valid and says why', () => {
    const onCalculate = vi.fn();
    const view = calculator(props({ onCalculate, answer: answer({}) }));
    view.querySelector<HTMLInputElement>('#target-count')!.value = '0';
    submit(view);
    expect(onCalculate).not.toHaveBeenCalled();
    expect(view.querySelector('#target-count')!.getAttribute('aria-invalid')).toBe('true');
    expect(view.querySelector('#target-status')!.classList.contains('error')).toBe(true);
    expect(lines(view)).toEqual(['Enter a number of rounds from 1 to 20.']);
  });

  it('says from when a date can be picked', () => {
    const view = calculator(props());
    view.querySelector<HTMLInputElement>('#target-date')!.value = '2026-10-19';
    submit(view);
    expect(view.querySelector('#target-date')!.getAttribute('aria-invalid')).toBe('true');
    expect(lines(view)).toEqual([`Pick a date from ${ON_TODAY}, so the new rounds are the newest.`]);
  });

  it('keeps what was typed through a re-render', () => {
    const onDraft = vi.fn();
    const view = calculator(props({ draft: draft({ target: '99', date: '2026-12-01' }), onDraft }));
    const input = view.querySelector<HTMLInputElement>('#target-rating')!;
    expect(input.value).toBe('99');
    expect(view.querySelector<HTMLInputElement>('#target-date')!.value).toBe('2026-12-01');
    input.value = '995';
    input.dispatchEvent(new Event('input'));
    expect(onDraft).toHaveBeenCalledWith('target', '995');
  });

  it('shows the average needed as the figure, then what it is, then the date and deadline', () => {
    const view = calculator(props({ answer: answer({}) }));
    expect(parts(view)).toEqual([
      ['target-figure', '1012'],
      ['target-lead', `Average round rating needed in your next 3 rounds to reach 1000 at the ${NOV_10} update.`],
      ['target-note', UPDATE_LINE],
      ['target-note', NONE_LINE],
    ]);
    const one = calculator(props({ answer: answer({}, { query: { target: 1000, count: 1, date: TODAY } }) }));
    expect(lines(one)).toEqual([
      '1012',
      `Round rating needed in your next round to reach 1000 at the ${NOV_10} update.`,
      `Round on ${ON_TODAY}, report deadline ${NOV_8}.`,
      NONE_LINE,
    ]);
  });

  it('shows the rating already reached as the figure, and what keeps it as a note', () => {
    const view = calculator(props({ answer: answer({ without: 1003, reached: true, average: 982 }) }));
    expect(parts(view)).toEqual([
      ['target-figure', '1003'],
      ['target-lead', `Already reached at the ${NOV_10} update, without new rounds.`],
      ['target-note', 'To stay at 1000 or above after 3 more rounds, average at least 982.'],
      ['target-note', UPDATE_LINE],
      ['target-note', NONE_LINE],
    ]);
    const any = calculator(props({ answer: answer({ without: 1003, reached: true, average: 0 }) }));
    expect(lines(any)[2]).toBe('Any 3 rounds keep it at 1000 or above.');
  });

  it('says when it is out of reach, with no figure', () => {
    const view = calculator(props({ answer: answer({ average: null, rating: 991 }) }));
    expect(parts(view)).toEqual([
      ['target-strong', 'Out of reach in 3 rounds.'],
      ['target-lead', `Even 3 rounds rated 1150 give 991 at the ${NOV_10} update.`],
      ['target-note', UPDATE_LINE],
      ['target-note', NONE_LINE],
    ]);
  });

  it('writes the answer in Swedish', () => {
    setLanguage('sv');
    const view = calculator(props({ answer: answer({}) }));
    expect(lines(view)).toEqual([
      '1012',
      `Snitt i rundrating som krävs på dina nästa 3 rundor för att nå 1000 i uppdateringen ${formatDayMonth(NOVEMBER.update)}.`,
      `Sista rundan ${formatDate(TODAY)}, sista rapportdag ${formatDayMonth(NOVEMBER.deadline)}.`,
      `Inga rundor hamnar utanför perioden senast ${formatDate(TODAY)}.`,
    ]);
    const out = calculator(props({ answer: answer({ average: null, rating: 991 }) }));
    expect(lines(out).slice(0, 2)).toEqual([
      'Går inte att nå på 3 rundor.',
      `Även 3 rundor på 1150 ger 991 i uppdateringen ${formatDayMonth(NOVEMBER.update)}.`,
    ]);
  });

  it('says when the date misses a report deadline', () => {
    const query = { target: 1000, count: 3, date: '2026-11-09' };
    const view = calculator(props({ answer: answer({}, { query, update: DECEMBER, missed: NOVEMBER.deadline }) }));
    expect(parts(view).slice(1, 3)).toEqual([
      ['target-lead', `Average round rating needed in your next 3 rounds to reach 1000 at the ${DEC_8} update.`],
      [
        'target-note',
        `A last round on ${formatDate('2026-11-09')} misses the ${NOV_8} report deadline, so this is for the ${DEC_8} update.`,
      ],
    ]);
  });

  it('lists the rounds that leave the window, with their ratings', () => {
    const leaving = manualToRounds([OLD_MANUAL]);
    const view = calculator(props({ answer: answer({}, { leaving }) }));
    expect(parts(view).at(-2)).toEqual(['target-note', `Rounds that leave the window by ${ON_TODAY}:`]);
    const items = [...view.querySelectorAll('#target-status li')].map((item) => [
      item.querySelector('.leaving-rating')!.textContent,
      item.querySelector('.leaving-meta')!.textContent,
    ]);
    expect(items).toEqual([['1000', `Autumn Open · ${formatDate('2024-11-15')}`]]);
  });

  it('sits before the statistics on the Rating tab', () => {
    const model = buildModel(STORED, 100001, NOW);
    const view = ratingView({ model, target: props(), favorite: true, now: NOW, onAddFavorite: vi.fn() });
    expect(view.querySelector('#target')!.nextElementSibling!.id).toBe('stats');
  });
});
