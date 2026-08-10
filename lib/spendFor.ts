// ============================================================================
// Spend scope: who an expense was for — the user themselves, or the family.
// ----------------------------------------------------------------------------
// Stored on expenses.spend_for (text, defaults to 'self' server-side). Rows
// written before this feature have no value, so every read goes through
// spendForOf() which treats anything that isn't 'family' as 'self'. That keeps
// old rows, optimistic rows and rows from a DB without the migration applied
// all landing in the same bucket instead of an "unknown" third one.
// ============================================================================

export type SpendFor = 'self' | 'family';

export const SPEND_FOR_VALUES: SpendFor[] = ['self', 'family'];
export const DEFAULT_SPEND_FOR: SpendFor = 'self';

export const SPEND_FOR_LABEL: Record<SpendFor, string> = {
  self: 'Self',
  family: 'Family',
};

export const SPEND_FOR_ICON: Record<SpendFor, string> = {
  self: '🙋',
  family: '👨‍👩‍👧',
};

// Sky / orange — deliberately clear of the emerald (income, positive) and rose
// (spend, negative) already carrying meaning across the app.
export const SPEND_FOR_COLOR: Record<SpendFor, string> = {
  self: '#38bdf8',
  family: '#fb923c',
};

export function spendForOf(row: { spend_for?: string | null } | null | undefined): SpendFor {
  return row?.spend_for === 'family' ? 'family' : 'self';
}

/** Split a list of expenses into { self, family } keeping original order. */
export function splitBySpendFor<T extends { spend_for?: string | null }>(rows: T[]) {
  const self: T[] = [];
  const family: T[] = [];
  for (const row of rows) {
    (spendForOf(row) === 'family' ? family : self).push(row);
  }
  return { self, family };
}

export function sumAmount(rows: Array<{ amount: number | string }>): number {
  return rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}
