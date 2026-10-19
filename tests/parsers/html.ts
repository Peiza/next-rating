/*
 * Small synthetic pdga.com pages, shaped like the real ones. All names,
 * numbers and results here are invented.
 */

export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

export function page(body: string, canonical = '', title = 'Example | Professional Disc Golf Association'): string {
  const link = canonical ? `<link rel="canonical" href="${canonical}">` : '';
  return `<!doctype html><html><head><title>${title}</title>${link}</head><body>${body}</body></html>`;
}

export function playerHeader(name = 'Test Player', pdgaNumber = '100001', rating = '950'): string {
  return `<h1 class="title" id="page-title">${name} #${pdgaNumber}</h1>
    <ul class="player-info info-list"><li class="current-rating"> <strong>Current Rating:</strong> ${rating}
    <a class="rating-difference gain" href="/player/${pdgaNumber}/history">+3</a>
    <small class="rating-date">(as of 08-Sep-2026)</small> </li></ul>`;
}

export function layoutTooltip(id: string, holes: number): string {
  return `<div class="tooltip-templates"><div id="${id}"><div><a href="/node/1">Example Park</a> - Main; ${holes} holes; Par 60; 2,000 m</div></div></div>`;
}

export interface DetailsRowOptions {
  eventId?: string;
  eventName?: string;
  tier?: string;
  date?: string;
  division?: string;
  round?: string;
  tooltip?: string;
  score?: string;
  rating?: string;
  evaluated?: string;
  included?: string;
  rowClass?: string;
}

export function detailsRow(options: DetailsRowOptions = {}): string {
  const {
    eventId = '900001',
    eventName = 'Example Open',
    tier = 'C',
    date = '6-Aug-2026',
    division = 'MA1',
    round = '1',
    tooltip = '',
    score = '54',
    rating = '950',
    evaluated = 'Yes',
    included = 'Yes',
    rowClass = '',
  } = options;
  const tip = tooltip ? ` data-tooltip-content="${tooltip}"` : '';
  return `<tr class="${rowClass}"><td class="tournament"><a href="/tour/event/${eventId}">${eventName}</a></td>
    <td class="tier">${tier}</td><td class="date">${date}</td><td class="division">${division}</td>
    <td class="round tooltip"${tip}>${round}</td><td class="score">${score}</td><td class="round-rating">${rating}</td>
    <td class="evaluated">${evaluated}</td><td class="included">${included}</td></tr>`;
}

export function detailsTable(rows: string[], id = 'player-results-details'): string {
  return `<table id="${id}" class="sticky-enabled"><thead><tr><th class="tournament">Tournament</th><th class="tier">Tier</th>
    <th class="dates">Date</th><th class="division">Division</th><th class="round">Round</th><th class="score">Score</th>
    <th class="round-rating">Rating</th><th class="evaluated">Evaluated</th><th class="included">Included</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table>`;
}

export interface EventRowOptions {
  name?: string;
  pdgaNumber?: string;
  rounds?: [score: string, rating: string][];
  withPoints?: boolean;
}

export function eventRow({
  name = 'Test Player',
  pdgaNumber = '100001',
  rounds = [['54', '950']],
  withPoints = false,
}: EventRowOptions = {}): string {
  const player = pdgaNumber ? `<a href="/player/${pdgaNumber}">${name}</a>` : name;
  const points = withPoints ? '<td class="points">40.00</td>' : '';
  const cells = rounds.map(([score, rating]) => `<td class="round">${score}</td><td class="round-rating">${rating}</td>`);
  return `<tr><td class="place">1</td>${points}<td class="player">${player}</td><td class="pdga-number">${pdgaNumber}</td>
    <td class="player-rating">940</td><td class="par">+2</td>${cells.join('')}<td class="total">108</td></tr>`;
}

export function eventDivision(division: string, roundTooltips: string[], rows: string[], withPoints = false): string {
  const rounds = roundTooltips.map(
    (tip, i) =>
      `<th class="round tooltip"${tip ? ` data-tooltip-content="${tip}"` : ''}>Rd${i + 1}</th><th class="round-rating"></th>`,
  );
  const points = withPoints ? '<th class="points">Points</th>' : '';
  return `<details open><summary><h3 class="division" id="${division}">${division} &middot; Example</h3></summary>
    <div class="table-container"><table class="results sticky-enabled"><thead><tr><th class="place">Place</th>${points}
    <th class="name">Name</th><th class="pdga-number">PDGA#</th><th class="player-rating">Rating</th><th class="par">Par</th>
    ${rounds.join('')}<th class="total">Total</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></details>`;
}

export function eventPage(options: {
  eventId?: string;
  name?: string;
  date?: string;
  mode?: 'normal' | 'live';
  body: string;
}): string {
  const { eventId = '900001', name = 'Example Open', date = '22-Aug to 23-Aug-2026', mode = 'normal', body } = options;
  const heading = mode === 'live' ? 'Unofficial Results' : 'Official Results';
  return page(
    `<h1 class="title" id="page-title">${name}</h1>
     <ul class="event-info info-list"><li class="tournament-date"><strong>Date</strong>: ${date}</li></ul>
     <h2>${heading}</h2><div class="leaderboard singles mode-${mode}">${body}</div>`,
    `https://www.pdga.com/tour/event/${eventId}`,
  );
}
