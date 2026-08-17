// ============================================================================
// Splitwise: informal debts between the user and other people.
// ----------------------------------------------------------------------------
// Deliberately kept OUT of the money layer. Entries live in Supabase Auth
// user_metadata under `splitwise_entries` — never in the expenses table — so by
// construction they cannot reach the budget, per-source allocations, analytics,
// history, charts, the month-end rollover or the loans feature. This is a
// standalone ledger you read, not money you can spend.
//
// Writes go through the existing ['updateMetadata'] offline mutation, which
// patches shallowly (last-write-wins per top-level key). Every mutation is
// therefore a read-modify-write of the whole array: always rebuild it from a
// fresh readSplitwiseEntries() inside the handler rather than from a value
// captured during render.
// ============================================================================

export type SplitwiseDirection = 'owes_you' | 'you_owe';

export interface SplitwiseEntry {
  id: string;
  name: string;
  direction: SplitwiseDirection;
  amount: number;
  created_at: string;
}

export const SPLITWISE_DIRECTIONS: SplitwiseDirection[] = ['owes_you', 'you_owe'];
export const DEFAULT_SPLITWISE_DIRECTION: SplitwiseDirection = 'owes_you';

// user_metadata rides along in every auth session, so the ledger is capped
// rather than allowed to grow without bound.
export const MAX_SPLITWISE_ENTRIES = 50;

export const SPLITWISE_LABEL: Record<SplitwiseDirection, string> = {
  owes_you: 'Owes you',
  you_owe: 'You owe',
};

export const SPLITWISE_ICON: Record<SplitwiseDirection, string> = {
  owes_you: '📥',
  you_owe: '📤',
};

// Violet / amber — clear of the emerald (income, positive) and rose (spend,
// negative) that already carry meaning across the app, so a debt is never read
// as money moving into or out of the budget.
export const SPLITWISE_COLOR: Record<SplitwiseDirection, string> = {
  owes_you: '#a78bfa',
  you_owe: '#fbbf24',
};

/** Anything that isn't an explicit 'you_owe' buckets as 'owes_you'. */
export function directionOf(
  entry: { direction?: string | null } | null | undefined,
): SplitwiseDirection {
  return entry?.direction === 'you_owe' ? 'you_owe' : 'owes_you';
}

/**
 * Normalising read of metadata.splitwise_entries. The key is absent for every
 * existing user and the blob is untyped JSON, so drop anything unusable rather
 * than letting a malformed row crash the dashboard.
 */
export function readSplitwiseEntries(
  metadata: Record<string, any> | null | undefined,
): SplitwiseEntry[] {
  const raw = metadata?.splitwise_entries;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e.id === 'string' && Number.isFinite(Number(e.amount)))
    .map((e) => ({
      id: e.id as string,
      name: typeof e.name === 'string' ? e.name : '',
      direction: directionOf(e),
      amount: Number(e.amount),
      created_at: typeof e.created_at === 'string' ? e.created_at : '',
    }));
}

/** Split a list into { owes_you, you_owe } keeping original order. */
export function splitByDirection(entries: SplitwiseEntry[]) {
  const owes_you: SplitwiseEntry[] = [];
  const you_owe: SplitwiseEntry[] = [];
  for (const entry of entries) {
    (directionOf(entry) === 'you_owe' ? you_owe : owes_you).push(entry);
  }
  return { owes_you, you_owe };
}

/** Per-direction totals plus the net (positive = you're owed overall). */
export function sumByDirection(entries: SplitwiseEntry[]) {
  const { owes_you, you_owe } = splitByDirection(entries);
  const owed = owes_you.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const owing = you_owe.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  return { owes_you: owed, you_owe: owing, net: owed - owing };
}
