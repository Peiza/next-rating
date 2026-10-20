// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoredImport } from '../../src/app/import';
import { formatDayMonth } from '../../src/app/format';
import { buildModel, manualToRounds } from '../../src/app/model';
import { DEFAULT_CARDS, type StoredManualRound } from '../../src/app/storage';
import {
  calculateTarget,
  emptyTargetDraft,
  readTarget,
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

/** The November 2026 update: Tuesday the 10th, for events reported by Sunday the 8th. */
const NOVEMBER = { update: '2026-11-10', deadline: '2026-11-08' };
const DECEMBER = { update: '2026-12-08', deadline: '2026-12-06' };
/** As the device locale shows them, "10 Nov" or "Nov 10". */
const NOV_10 = formatDayMonth(NOVEMBER.update);
const NOV_8 = formatDayMonth(NOVEMBER.deadline);
const DEC_8 = formatDayMonth(DECEMBER.update);

function draft(extra: Partial<TargetDraft> = {}): TargetDraft {
  return { ...emptyTargetDraft(950), ...extra };
}

function props(extra: Partial<TargetProps> = {}): TargetProps {
  return { draft: draft(), answer: null, onDraft: vi.fn(), onCalculate: vi.fn(), ...extra };
}

/** The card's content in one element, as the card shows it. */
function calculator(target: TargetProps): HTMLElement {
  const view = document.createElement('div');
  view.append(targetCalculator(target));
  return view;
}

function answer(result: Partial<TargetAnswer['result']>, extra: Partial<TargetAnswer> = {}): TargetAnswer {
  return {
    query: { target: 1000, count: 3 },
    update: NOVEMBER,
    following: false,
    missed: NOVEMBER.deadline,
    result: { without: 990, reached: false, average: 1012, rating: 1000, ...result },
    ...extra,
  };
}

function lines(view: HTMLElement): string[] {
  return [...view.querySelectorAll('#target-status p')].map((p) => p.textContent!);
}

function submit(view: HTMLElement) {
  view.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('target input', () => {
  it('starts on the next multiple of 10 above the prediction, for 3 rounds', () => {
    expect(emptyTargetDraft(950)).toEqual({ target: '960', count: '3' });
    expect(emptyTargetDraft(996)).toEqual({ target: '1000', count: '3' });
    expect(emptyTargetDraft(null)).toEqual({ target: '', count: '3' });
  });

  it('reads whole numbers within limits, or names the first field that is not valid', () => {
    expect(readTarget({ target: ' 1000 ', count: '3' })).toEqual({ query: { target: 1000, count: 3 } });
    expect(readTarget({ target: '2000', count: '20' })).toEqual({ query: { target: 2000, count: 20 } });
    const fieldOf = (target: string, count: string) => {
      const read = readTarget({ target, count });
      return 'field' in read ? read.field : null;
    };
    expect(fieldOf('', '3')).toBe('target');
    expect(fieldOf('0', '3')).toBe('target');
    expect(fieldOf('2001', '3')).toBe('target');
    expect(fieldOf('999.5', '3')).toBe('target');
    expect(fieldOf('1000', '0')).toBe('count');
    expect(fieldOf('1000', '21')).toBe('count');
    expect(fieldOf('1000', '')).toBe('count');
  });
});

describe('targetUpdate', () => {
  it('is the next update up to its report deadline', () => {
    expect(targetUpdate('2026-10-20', NOVEMBER)).toEqual({ update: NOVEMBER, following: false });
    expect(targetUpdate('2026-11-08', NOVEMBER)).toEqual({ update: NOVEMBER, following: false });
  });

  it('is the following update on the Monday and Tuesday of update week, before PDGA publishes', () => {
    expect(targetUpdate('2026-11-09', NOVEMBER)).toEqual({ update: DECEMBER, following: true });
    expect(targetUpdate('2026-11-10', NOVEMBER)).toEqual({ update: DECEMBER, following: true });
  });

  it('is the next update again once PDGA has published', () => {
    // On update day, the official rating dated that day already moved the next update on.
    expect(targetUpdate('2026-11-10', DECEMBER)).toEqual({ update: DECEMBER, following: false });
  });
});

describe('calculateTarget', () => {
  it('finds the average on the rounds of the prediction', () => {
    // (950 + 3 × R) / 4 must round to 970, so R ≥ 976.
    const model = buildModel(STORED, 100001, NOW);
    expect(calculateTarget(model, { target: 970, count: 3 }, TODAY)).toEqual({
      query: { target: 970, count: 3 },
      update: NOVEMBER,
      following: false,
      missed: NOVEMBER.deadline,
      result: { without: 950, reached: false, average: 976, rating: 970 },
    });
  });

  it('includes manual rounds', () => {
    // (950 + 1000 + 3 × R) / 5 must round to 970, so R ≥ 966.
    const manual: StoredManualRound[] = [{ id: 'm1', rating: 1000, date: '2026-10-01', eventName: '', holes: null }];
    const model = buildModel(STORED, 100001, NOW, manualToRounds(manual));
    expect(calculateTarget(model, { target: 970, count: 3 }, TODAY).result.average).toBe(966);
  });

  it('is for the following update on the Monday of update week', () => {
    const now = new Date('2026-11-09T10:00:00.000Z');
    const model = buildModel(STORED, 100001, now);
    const answer = calculateTarget(model, { target: 970, count: 3 }, '2026-11-09');
    expect(answer).toMatchObject({ update: DECEMBER, following: true, missed: NOVEMBER.deadline });
    expect(answer.result.average).toBe(976);
  });
});

describe('target calculator view', () => {
  it('is a closed card until opened, and starts with its explanation', () => {
    const model = buildModel(STORED, 100001, NOW);
    const page = (open: boolean) =>
      ratingView({ model, target: props(), cards: { ...DEFAULT_CARDS, target: open }, favorite: true, now: NOW, onAddFavorite: vi.fn() });
    const closed = page(false);
    expect(closed.querySelector('#target-toggle')!.getAttribute('aria-expanded')).toBe('false');
    expect(closed.querySelector('#target form')).toBeNull();
    const body = page(true).querySelector('#target-body')!;
    expect(body.firstElementChild!.textContent).toBe(
      'The average round rating your next rounds need to reach a rating at the next update.',
    );
    expect(body.querySelector('form')).not.toBeNull();
  });

  it('puts the target first, the rounds next and Calculate last, before the answer', () => {
    const form = calculator(props()).querySelector('form')!;
    const inputs = [...form.querySelectorAll('input')];
    expect(inputs.map((input) => [input.id, input.value, input.getAttribute('inputmode')])).toEqual([
      ['target-rating', '960', 'numeric'],
      ['target-count', '3', 'numeric'],
    ]);
    expect(form.querySelector('#target-calculate')!.nextElementSibling!.id).toBe('target-status');
  });

  it('calculates with the typed values', () => {
    const onCalculate = vi.fn();
    const view = calculator(props({ onCalculate }));
    view.querySelector<HTMLInputElement>('#target-rating')!.value = '1000';
    view.querySelector<HTMLInputElement>('#target-count')!.value = '5';
    submit(view);
    expect(onCalculate).toHaveBeenCalledWith({ target: 1000, count: 5 });
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

  it('keeps what was typed through a re-render', () => {
    const onDraft = vi.fn();
    const view = calculator(props({ draft: draft({ target: '99' }), onDraft }));
    const input = view.querySelector<HTMLInputElement>('#target-rating')!;
    expect(input.value).toBe('99');
    input.value = '995';
    input.dispatchEvent(new Event('input'));
    expect(onDraft).toHaveBeenCalledWith('target', '995');
  });

  it('says the average needed', () => {
    const view = calculator(props({ answer: answer({}) }));
    expect(lines(view)).toEqual([`Average at least 1012 in the next 3 rounds to reach 1000 at the ${NOV_10} update.`]);
    const one = calculator(props({ answer: answer({}, { query: { target: 1000, count: 1 } }) }));
    expect(lines(one)).toEqual([`Rate at least 1012 in the next round to reach 1000 at the ${NOV_10} update.`]);
  });

  it('says when it is already reached, and what keeps it', () => {
    const view = calculator(props({ answer: answer({ without: 1003, reached: true, average: 982 }) }));
    expect(lines(view)).toEqual([
      `Already reached: 1003 at the ${NOV_10} update without new rounds.`,
      'To stay at 1000 or above after 3 more rounds, average at least 982.',
    ]);
    const any = calculator(props({ answer: answer({ without: 1003, reached: true, average: 0 }) }));
    expect(lines(any)[1]).toBe('Any 3 rounds keep it at 1000 or above.');
  });

  it('says when it is out of reach', () => {
    const view = calculator(props({ answer: answer({ average: null, rating: 991 }) }));
    expect(lines(view)).toEqual(['Out of reach in 3 rounds: even 3 rounds rated 1150 give 991.']);
  });

  it('says when rounds played today count in the following update', () => {
    const view = calculator(props({ answer: answer({}, { update: DECEMBER, following: true }) }));
    expect(lines(view)).toEqual([
      `Rounds played today miss the ${NOV_8} report deadline, so this is for the ${DEC_8} update.`,
      `Average at least 1012 in the next 3 rounds to reach 1000 at the ${DEC_8} update.`,
    ]);
  });

  it('sits before the statistics on the Rating tab', () => {
    const model = buildModel(STORED, 100001, NOW);
    const view = ratingView({ model, target: props(), favorite: true, now: NOW, onAddFavorite: vi.fn() });
    expect(view.querySelector('#target')!.nextElementSibling!.id).toBe('stats');
  });
});
