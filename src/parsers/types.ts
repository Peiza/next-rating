import type { PlainDate } from '../engine/dates';

/*
 * Raw records: what the extract layer reads from a page, as plain strings.
 * They are what the app stores, and are
 * untrusted until a normalize function has validated them. An empty string
 * means the page did not show the value.
 */

export interface RawPlayer {
  pdgaNumber: string;
  name: string;
  currentRating: string;
  /** For example "(as of 08-Sep-2026)". */
  ratingDate: string;
}

export interface RawDetailsRow {
  eventId: string;
  eventName: string;
  tier: string;
  /** For example "6-Aug-2026" or "1-Aug to 2-Aug-2026". */
  date: string;
  division: string;
  /** Round number when the page shows it, otherwise the round label. */
  round: string;
  /** Round label as shown, for example "2" or "Finals". */
  roundLabel: string;
  score: string;
  rating: string;
  holes: string;
  /** "Yes" or "No". */
  evaluated: string;
  /** "Yes" or "No". */
  included: string;
}

export interface RawProfileEvent {
  eventId: string;
  division: string;
  name: string;
  tier: string;
  date: string;
}

export interface RawEventRound {
  score: string;
  rating: string;
}

export interface RawEventRow {
  pdgaNumber: string;
  name: string;
  rounds: RawEventRound[];
}

export interface RawEventDivision {
  division: string;
  /** Hole count per round, in round order. */
  holes: string[];
  rows: RawEventRow[];
}

export interface RawEvent {
  eventId: string;
  name: string;
  date: string;
  /** "official", "unofficial" or "" when the page does not say. */
  status: string;
  divisions: RawEventDivision[];
}

/* Typed records: the validated output of the normalize layer. */

export interface PlayerInfo {
  pdgaNumber: number;
  name: string;
  currentRating: number | null;
  ratingDate: PlainDate | null;
}

export interface DetailsRound {
  eventId: number | null;
  eventName: string;
  tier: string;
  /** For a multi-day event, the last day of the event. */
  date: PlainDate;
  division: string;
  round: number | null;
  roundLabel: string;
  score: number | null;
  rating: number;
  holes: number | null;
  evaluated: boolean;
  included: boolean;
}

export interface RatingsDetails {
  rounds: DetailsRound[];
  /** Rows without a readable date or rating. */
  skipped: number;
}

export interface ProfileEvent {
  eventId: number;
  division: string;
  name: string;
  tier: string;
  date: PlainDate | null;
}

export interface EventRound {
  score: number | null;
  /** Null for a DNF round, and for a round that has no rating yet. */
  rating: number | null;
  dnf: boolean;
}

export interface EventRow {
  pdgaNumber: number | null;
  name: string;
  rounds: EventRound[];
}

export interface EventDivision {
  division: string;
  holes: (number | null)[];
  rows: EventRow[];
}

export interface EventResults {
  eventId: number | null;
  name: string;
  /** For a multi-day event, the last day of the event. */
  date: PlainDate | null;
  /** False while ratings are unofficial, null when the page does not say. */
  official: boolean | null;
  divisions: EventDivision[];
}
