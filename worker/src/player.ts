/*
 * Turns the answer of /services/json/players into the trimmed object the
 * app gets. The answer is `{ sessid, status, players: [...] }`, every value
 * in it is a string, and "not found" is an empty players list. Anything
 * unexpected becomes null instead of being passed on.
 */

export type Membership = 'current' | 'expired' | 'none';

export interface ApiPlayer {
  pdgaNumber: number;
  name: string | null;
  rating: number | null;
  /** YYYY-MM-DD. */
  ratingDate: string | null;
  membership: Membership;
  membershipExpires: string | null;
  classification: 'pro' | 'amateur' | null;
  /** ISO time the Worker asked PDGA. */
  fetchedAt: string;
}

const NAME_LENGTH = 100;

function text(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  // Control characters are dropped; the app renders text only anyway.
  const clean = String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return clean === '' ? null : clean.slice(0, NAME_LENGTH);
}

function integer(value: unknown, min: number, max: number): number | null {
  const raw = text(value);
  if (raw === null || !/^[0-9]{1,8}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

/** YYYY-MM-DD from "2026-10-14" or "2026-10-14 00:00:00", if it is a real date. */
export function plainDate(value: unknown): string | null {
  const raw = text(value);
  const match = raw === null ? null : /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(raw);
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1970 || y > 2200) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** The player, null when the list is empty, or 'malformed'. */
export function mapPlayer(json: unknown, pdgaNumber: number, now: Date): ApiPlayer | null | 'malformed' {
  if (typeof json !== 'object' || json === null) return 'malformed';
  const players = (json as Record<string, unknown>).players;
  if (players === undefined || players === null) return null;
  if (!Array.isArray(players)) return 'malformed';
  // Only the asked number counts, whatever else the list holds.
  const raw = players.find(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null && integer((entry as Record<string, unknown>).pdga_number, 1, 99_999_999) === pdgaNumber,
  );
  if (!raw) return null;

  const first = text(raw.first_name);
  const last = text(raw.last_name);
  const name = [first, last].filter(Boolean).join(' ').slice(0, NAME_LENGTH) || null;

  const rating = integer(raw.rating, 0, 2000);
  const ratingDate = rating === null ? null : plainDate(raw.rating_effective_date);

  const membershipExpires = plainDate(raw.membership_expiration_date);
  const status = text(raw.membership_status)?.toLowerCase();
  const today = now.toISOString().slice(0, 10);
  const membership: Membership =
    status === 'current' ? 'current' : membershipExpires !== null && membershipExpires < today ? 'expired' : 'none';

  const classification = text(raw.classification)?.toUpperCase();

  return {
    pdgaNumber,
    name,
    rating,
    ratingDate,
    membership,
    membershipExpires,
    classification: classification === 'P' ? 'pro' : classification === 'A' ? 'amateur' : null,
    fetchedAt: now.toISOString(),
  };
}
