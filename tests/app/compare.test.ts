// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { compareLine, headToHead } from '../../src/app/compare';
import { buildModel } from '../../src/app/model';
import { compareView, type CompareProps } from '../../src/app/views/compare';
import type { ListedRound } from '../../src/parsers';
import { rawDetailsRow, rawPlayer } from '../handoff/raw';

/* All names, numbers and results here are invented. */

function round(eventKey: string, roundLabel: string, rating: number | null, extra: Partial<ListedRound> = {}): ListedRound {
  return {
    id: `${eventKey}-${roundLabel}-${rating}`,
    rating,
    date: '2026-08-02',
    eventKey,
    source: 'official',
    eventId: null,
    eventName: 'Example Open',
    roundLabel,
    ...extra,
  };
}

describe('head-to-head', () => {
  it('meets in the same event and round, in any division, and wins by the higher round rating', () => {
    const mine = [round('e:1', '1', 950), round('e:1', '2', 960), round('e:2', '1', 900), round('e:3', '1', 980)];
    const theirs = [round('e:1', '1', 940), round('e:1', '2', 975), round('e:2', '1', 900), round('e:4', '1', 990)];
    expect(headToHead(mine, theirs)).toEqual({
      events: 2,
      eventsWon: 0,
      eventsLost: 1,
      eventsTied: 1,
      rounds: 3,
      roundsWon: 1,
      roundsLost: 1,
      roundsTied: 1,
      played: [
        { mine: mine[0], theirs: theirs[0] },
        { mine: mine[1], theirs: theirs[1] },
        { mine: mine[2], theirs: theirs[2] },
      ],
    });
  });

  it('lists the rounds newest event first, each event in round order', () => {
    const mine = [
      round('e:1', '2', 950, { date: '2026-05-01' }),
      round('e:2', 'Finals', 990),
      round('e:2', '2', 970),
      round('e:1', '1', 940, { date: '2026-05-01' }),
      round('e:2', '1', 960),
    ];
    const theirs = mine.map((own) => ({ ...own, id: `${own.id}-b` }));
    expect(headToHead(mine, theirs).played.map(({ mine }) => `${mine.eventKey} ${mine.roundLabel}`)).toEqual([
      'e:2 1',
      'e:2 2',
      'e:2 Finals',
      'e:1 1',
      'e:1 2',
    ]);
  });

  it('decides an event by the rounds both played only', () => {
    const mine = [round('e:1', '1', 950), round('e:1', '2', 900)];
    const theirs = [round('e:1', '1', 940)];
    expect(headToHead(mine, theirs)).toMatchObject({ events: 1, eventsWon: 1, rounds: 1, roundsWon: 1 });
  });

  it('leaves out manual rounds and DNF rounds', () => {
    const mine = [round('m:a', '', 1000, { source: 'manual' }), round('e:1', '1', null, { dnf: true }), round('e:2', 'Finals', 950)];
    const theirs = [round('m:a', '', 900, { source: 'manual' }), round('e:1', '1', 940), round('e:2', 'Finals', 950, { source: 'unofficial' })];
    expect(headToHead(mine, theirs)).toMatchObject({ events: 1, eventsTied: 1, rounds: 1, roundsTied: 1 });
  });

  it('is the same meetings from the other side', () => {
    const mine = [round('e:1', '1', 950), round('e:1', '2', 960)];
    const theirs = [round('e:1', '1', 940), round('e:1', '2', 975)];
    expect(headToHead(theirs, mine)).toMatchObject({ eventsWon: 1, roundsWon: 1, roundsLost: 1 });
  });
});

describe('compare players view', () => {
  const NOW = new Date('2026-10-01T10:00:00.000Z');
  const model = buildModel(
    {
      at: '2026-10-01T10:00:00.000Z',
      events: [],
      player: rawPlayer(),
      details: [rawDetailsRow({ eventId: '900001', date: '2-Aug-2026', rating: '960' })],
      career: { events: '10', wins: '1' },
      wins: [{ eventId: '900001', name: 'Example Open', division: 'Mixed Pro Open', tier: 'C', date: '02-Aug-2026' }],
    },
    100001,
    NOW,
  );

  function view(props: Partial<CompareProps> = {}) {
    return compareView({
      players: [
        { pdgaNumber: 100001, label: 'Test Player #100001', name: 'Test Player' },
        { pdgaNumber: 100002, label: 'Other Player #100002', name: 'Other Player' },
      ],
      picked: [100001, 100002],
      lines: [compareLine(model), { pdgaNumber: 100002, rating: null, events: 3, wins: null, average: null }],
      meetings: [
        {
          a: 100001,
          b: 100002,
          result: { events: 2, eventsWon: 1, eventsLost: 0, eventsTied: 1, rounds: 5, roundsWon: 3, roundsLost: 2, roundsTied: 0, played: [] },
        },
      ],
      onPick: vi.fn(),
      onBack: vi.fn(),
      ...props,
    });
  }

  it("shows each picked player's window figures, with the wins and their share", () => {
    const rows = [...view().querySelectorAll('tbody tr')].map((row) => [...row.children].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['Test Player', '950', '1', '1 (100%)', '960.00'],
      ['Other Player', '–', '3', '–', '–'],
    ]);
  });

  it('tells each meeting from the first player\'s side, leaving out what is 0', () => {
    const item = view().querySelector('.compare-meetings li')!;
    expect(item.querySelector('strong')!.textContent).toBe('Test Player vs Other Player');
    expect([...item.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['2 events: 1 won, 1 tied', '5 rounds: 3 won, 2 lost']);
  });

  it('lists the rounds of each pair behind a toggle, by event, with scores, ratings and layouts', () => {
    const own = (label: string, rating: number, extra: Partial<ListedRound> = {}) =>
      round('e:900001', label, rating, { eventId: 900001, score: 54, layout: 'Example Park - Main', ...extra });
    const played = [
      { mine: own('1', 960), theirs: own('1', 950, { score: 55 }) },
      { mine: own('2', 940, { layout: 'Example Park - Long' }), theirs: own('2', 945, { score: undefined }) },
    ];
    const result = { events: 1, eventsWon: 0, eventsLost: 0, eventsTied: 1, rounds: 2, roundsWon: 1, roundsLost: 1, roundsTied: 0, played };
    const onToggle = vi.fn();
    const page = view({ meetings: [{ a: 100001, b: 100002, result }], pairOpen: () => ({ open: true, onToggle }) });
    const list = page.querySelector<HTMLDetailsElement>('.compare-rounds')!;
    expect(list.open).toBe(true);
    expect(list.querySelector('summary')!.textContent).toBe('Show the rounds (2)');
    const event = list.querySelector('.compare-event-name')!;
    expect(event.textContent).toMatch(/^Example Open · \S+$/);
    expect(event.querySelector('a')!.getAttribute('href')).toBe('https://www.pdga.com/tour/event/900001');
    const lines = [...list.querySelectorAll('li')].map((li) => [...li.children].map((part) => part.textContent));
    expect(lines).toEqual([
      ['Round 1', 'Example Park - Main', 'Test Player 54 (960) – Other Player 55 (950)'],
      ['Round 2', 'Test Player: Example Park - Long · Other Player: Example Park - Main', 'Test Player 54 (940) – Other Player 945'],
    ]);
    expect(list.querySelector('li strong')!.textContent).toBe('Test Player 54 (960)');
  });

  it('says when two players never met', () => {
    const result = { events: 0, eventsWon: 0, eventsLost: 0, eventsTied: 0, rounds: 0, roundsWon: 0, roundsLost: 0, roundsTied: 0, played: [] };
    const item = view({ meetings: [{ a: 100001, b: 100002, result }] }).querySelector('.compare-meetings li')!;
    expect(item.textContent).toBe('Test Player vs Other Player No rounds in common in the imported data.');
  });

  it('asks for two players before it compares, and picks with a checkbox', () => {
    const onPick = vi.fn();
    const page = view({ picked: [100001], lines: [compareLine(model)], meetings: [], onPick });
    expect(page.querySelector('table')).toBeNull();
    expect(page.textContent).toContain('Pick at least two players.');
    const box = page.querySelector<HTMLInputElement>('#compare-100002')!;
    expect(box.checked).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(onPick).toHaveBeenCalledWith(100002, true);
  });

  it('needs two imported players', () => {
    const page = view({ players: [{ pdgaNumber: 100001, label: 'Test Player #100001', name: 'Test Player' }], picked: [], lines: [], meetings: [] });
    expect(page.querySelector('fieldset')).toBeNull();
    expect(page.textContent).toContain('Import at least two players');
  });
});
