// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { StoredImport } from '../../src/app/import';
import { buildModel, manualToRounds } from '../../src/app/model';
import {
  emptyDraft,
  latestManualDate,
  manualEntry,
  readManualRound,
  type ManualDraft,
  type ManualProps,
} from '../../src/app/views/manual';
import { ratingView } from '../../src/app/views/rating';
import { DEFAULT_CARDS, type StoredManualRound } from '../../src/app/storage';
import { rawDetailsRow, rawPlayer } from '../handoff/raw';

const TODAY = '2026-10-20';

function draft(extra: Partial<ManualDraft> = {}): ManualDraft {
  return { ...emptyDraft(TODAY), ...extra };
}

const ROUNDS: StoredManualRound[] = [
  { id: 'm1', rating: 950, date: '2026-10-10', eventName: 'Club night', holes: 9 },
  { id: 'm2', rating: 985, date: '2026-10-16', eventName: '', holes: null },
];

function props(extra: Partial<ManualProps> = {}): ManualProps {
  return {
    rounds: [],
    draft: draft(),
    flash: null,
    confirmClear: false,
    undo: null,
    player: 'Test Player #100001',
    today: TODAY,
    onDraft: vi.fn(),
    onAdd: vi.fn(),
    onDelete: vi.fn(),
    onUndo: vi.fn(),
    onAskClear: vi.fn(),
    onClear: vi.fn(),
    ...extra,
  };
}

/** The card's content in one element, as the card shows it. */
function entry(manual: ManualProps): HTMLElement {
  const view = document.createElement('div');
  view.append(...manualEntry(manual));
  return view;
}

function submit(view: HTMLElement) {
  view.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
}

function type(view: HTMLElement, id: string, value: string) {
  view.querySelector<HTMLInputElement>(`#${id}`)!.value = value;
}

describe('latestManualDate', () => {
  it('is one year after today, clamped on 29 February', () => {
    expect(latestManualDate('2026-10-20')).toBe('2027-10-20');
    expect(latestManualDate('2028-02-29')).toBe('2029-02-28');
  });
});

describe('readManualRound', () => {
  it('reads a rating with the defaults', () => {
    expect(readManualRound(draft({ rating: ' 985 ' }), TODAY)).toEqual({
      round: { rating: 985, date: TODAY, eventName: '', holes: null },
    });
  });

  it('tidies the event name and reads holes', () => {
    const read = readManualRound(draft({ rating: '950', eventName: '  Club   night ', holes: '9' }), TODAY);
    expect(read).toEqual({ round: { rating: 950, date: TODAY, eventName: 'Club night', holes: 9 } });
  });

  it('accepts a date up to a year ahead, for a round at an upcoming event', () => {
    expect(readManualRound(draft({ rating: '950', date: '2027-10-20' }), TODAY)).toMatchObject({
      round: { date: '2027-10-20' },
    });
    expect(readManualRound(draft({ rating: '950', date: '2027-10-21' }), TODAY)).toEqual({
      field: 'date',
      error: 'manual.dateTooLate',
    });
  });

  it('names the first field that is not valid', () => {
    const fieldOf = (extra: Partial<ManualDraft>) => {
      const read = readManualRound(draft({ rating: '950', ...extra }), TODAY);
      return 'field' in read ? read.field : null;
    };
    expect(fieldOf({ rating: '' })).toBe('rating');
    expect(fieldOf({ rating: '2001' })).toBe('rating');
    expect(fieldOf({ rating: '9.5' })).toBe('rating');
    expect(fieldOf({ rating: '-5' })).toBe('rating');
    expect(fieldOf({ date: '' })).toBe('date');
    expect(fieldOf({ date: '2026-02-30' })).toBe('date');
    expect(fieldOf({ holes: '0' })).toBe('holes');
    expect(fieldOf({ holes: 'x' })).toBe('holes');
    expect(fieldOf({ holes: '' })).toBeNull();
  });
});

function ratingPage(manual: ManualProps, open = false): HTMLElement {
  const stored: StoredImport = { at: '2026-10-19T10:00:00.000Z', player: rawPlayer(), details: [rawDetailsRow()], events: [] };
  const now = new Date('2026-10-20T10:00:00.000Z');
  const model = buildModel(stored, 100001, now, manualToRounds(manual.rounds));
  const cards = { ...DEFAULT_CARDS, manual: open };
  return ratingView({ model, manual, cards, favorite: true, now, onAddFavorite: vi.fn() });
}

describe('manual entry view', () => {
  it('shows a calendar icon after the date field', () => {
    const view = entry(props());
    const field = view.querySelector<HTMLInputElement>('#manual-date')!;
    expect(field.parentElement!.className).toBe('date-input');
    expect(field.nextElementSibling!.matches('svg.date-icon[aria-hidden="true"]')).toBe(true);
  });

  it('is a closed card until opened, with the count of manual rounds in its header', () => {
    const view = ratingPage(props({ rounds: ROUNDS }));
    const toggle = view.querySelector<HTMLButtonElement>('#manual-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toBe('Add a round2 manual rounds');
    expect(view.querySelector('#manual form')).toBeNull();
    const open = ratingPage(props({ rounds: ROUNDS }), true);
    expect(open.querySelector('#manual-toggle .card-teaser')).toBeNull();
    expect(open.querySelector('#manual-body')!.firstElementChild!.className).toBe('card-intro');
    expect(open.querySelector('#manual-body form')).not.toBeNull();
  });

  it('puts the rating first, the date (today by default, up to a year ahead) next, and Add last', () => {
    const view = entry(props());
    const form = view.querySelector('form')!;
    const inputs = [...form.querySelectorAll('input')];
    expect(inputs[0]!.id).toBe('manual-rating');
    expect(inputs[0]!.getAttribute('inputmode')).toBe('numeric');
    const date = form.querySelector<HTMLInputElement>('#manual-date')!;
    expect(date.type).toBe('date');
    expect(date.value).toBe(TODAY);
    expect(date.max).toBe('2027-10-20');
    expect(form.querySelector('#manual-event')!.closest('details')).not.toBeNull();
    expect(form.querySelector('#manual-add')!.nextElementSibling!.firstElementChild!.id).toBe('manual-status');
  });

  it('adds the typed round', () => {
    const onAdd = vi.fn();
    const view = entry(props({ onAdd }));
    type(view, 'manual-rating', '985');
    type(view, 'manual-date', '2026-11-01');
    submit(view);
    expect(onAdd).toHaveBeenCalledWith({ rating: 985, date: '2026-11-01', eventName: '', holes: null });
  });

  it('marks a field that is not valid and says why', () => {
    const onAdd = vi.fn();
    const view = entry(props({ onAdd }));
    type(view, 'manual-rating', '985');
    type(view, 'manual-holes', '100');
    submit(view);
    expect(onAdd).not.toHaveBeenCalled();
    expect(view.querySelector('#manual-holes')!.getAttribute('aria-invalid')).toBe('true');
    expect(view.querySelector<HTMLDetailsElement>('details')!.open).toBe(true);
    expect(view.querySelector('#manual-status')!.textContent).toMatch(/1 to 99/);
  });

  it('keeps what was typed through a re-render, and opens "More" when it holds something', () => {
    const view = entry(props({ draft: draft({ rating: '97', eventName: 'Club night' }) }));
    expect(view.querySelector<HTMLInputElement>('#manual-rating')!.value).toBe('97');
    expect(view.querySelector<HTMLDetailsElement>('details')!.open).toBe(true);
    const onDraft = vi.fn();
    const next = entry(props({ onDraft }));
    const input = next.querySelector<HTMLInputElement>('#manual-rating')!;
    input.value = '9';
    input.dispatchEvent(new Event('input'));
    expect(onDraft).toHaveBeenCalledWith('rating', '9');
  });

  it('says when adding saved the player as a favorite', () => {
    const view = entry(props({ flash: { kind: 'added', rating: 985, savedFavorite: true } }));
    expect(view.querySelector('#manual-status')!.textContent).toBe(
      'Added 985. Test Player #100001 is now a favorite, so the round is kept.',
    );
  });

  it('lists manual rounds newest first, each with a labelled delete button', () => {
    const onDelete = vi.fn();
    const view = entry(props({ rounds: ROUNDS, onDelete }));
    const items = [...view.querySelectorAll('.manual-round')];
    expect(items.map((item) => item.querySelector('.round-rating')!.textContent)).toEqual(['985', '950']);
    expect(items[1]!.textContent).toContain('Club night');
    expect(items[1]!.textContent).toContain('9 holes');
    const button = view.querySelector<HTMLButtonElement>('#manual-delete-m1')!;
    expect(button.getAttribute('aria-label')).toMatch(/^Delete round 950 from /);
    button.click();
    expect(onDelete).toHaveBeenCalledWith('m1');
  });

  it('offers Undo after a delete, beside "Removed" in the status line', () => {
    expect(entry(props({ rounds: ROUNDS })).querySelector('#manual-undo')).toBeNull();
    const onUndo = vi.fn();
    const view = entry(props({ rounds: ROUNDS, undo: { rating: 990, date: '2026-10-12' }, onUndo }));
    expect(view.querySelector('#manual-status')!.textContent).toBe('Removed 990');
    const undo = view.querySelector<HTMLButtonElement>('#manual-undo')!;
    expect(undo.textContent).toBe('Undo');
    expect(undo.getAttribute('aria-label')).toMatch(/^Undo removing round 990 from /);
    undo.click();
    expect(onUndo).toHaveBeenCalled();
    // A newer message wins over "Removed".
    const restored = entry(props({ flash: { kind: 'restored', rating: 990 } }));
    expect(restored.querySelector('#manual-status')!.textContent).toBe('Restored 990.');
  });

  it('asks before deleting all, with Cancel first', () => {
    const onAskClear = vi.fn();
    const onClear = vi.fn();
    entry(props({ rounds: ROUNDS, onAskClear })).querySelector<HTMLButtonElement>('#manual-clear')!.click();
    expect(onAskClear).toHaveBeenCalledWith(true);
    const view = entry(props({ rounds: ROUNDS, confirmClear: true, onAskClear, onClear }));
    expect(view.querySelector('.confirm p')!.textContent).toBe('Delete all 2 manual rounds for this player?');
    const buttons = [...view.querySelectorAll<HTMLButtonElement>('.confirm button')];
    expect(buttons.map((button) => button.id)).toEqual(['manual-clear-cancel', 'manual-clear-confirm']);
    buttons[1]!.click();
    expect(onClear).toHaveBeenCalled();
  });

  it('follows Why it changed on the Rating tab, and its rounds show in the round list', () => {
    const view = ratingPage(props({ rounds: ROUNDS }));
    expect(view.querySelector('#why')!.nextElementSibling!.id).toBe('manual');
    expect([...view.querySelectorAll('.round-meta')].some((meta) => meta.textContent!.includes('Manual'))).toBe(true);
  });
});
