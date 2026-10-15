import { supabase } from './supabase';
import { INCOME_CATEGORY, LOAN_RETURN_CATEGORY } from '../hooks/useExpenseSync';
import { spendForOf } from './spendFor';

// ============================================================================
// Monthly savings history
// ----------------------------------------------------------------------------
// `user_metadata.monthly_savings_history` is the month-wise list rendered by the
// Savings tab. Two things write to it:
//
//  1. The Wallet's month-end rollover (origin: 'rollover') — the authoritative
//     entry, written when a budget period actually closes and its leftover is
//     swept into `profiles.total_savings`.
//  2. `scanMonthlyLeftovers` (origin: 'backfill') — a read-only reconstruction
//     from the `expenses` table for months that closed before the rollover
//     existed (or while the app wasn't opened). These are ESTIMATES: the DB has
//     no per-month budget history, so the caller's current budget is assumed for
//     every past month. Backfilled entries are display-only and deliberately do
//     NOT move `total_savings` — that money was never swept.
//
// Rollover entries always win over backfilled ones for the same month key.
//
// Each entry also carries a Self / Family split of its leftover. The split is
// each scope's allocation (Wallet Settings → Budget Split) minus what was spent
// for that scope; income is credited to Self, the same way income rows are
// stamped. `self + family` equals the unfloored leftover, so a scope that went
// over its allocation shows a negative share rather than silently borrowing
// from the other one. Entries written before the split existed have no
// self/family until a Rescan fills them in (see `withSplit`).
//
// Months before the first Family-tagged expense are halved 50/50 instead:
// every row back then defaulted to Self, so applying today's allocation would
// show the whole Family allocation as saved and Self as overspent.
// ============================================================================

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface MonthlySavingsEntry {
  key: string;    // "YYYY-MM" — zero-padded so plain string compare sorts correctly
  label: string;  // "Jan 2026"
  amount: number;
  date: string;   // ISO
  origin?: 'rollover' | 'backfill';
  self?: number;   // Self share of the leftover — may be negative
  family?: number; // Family share of the leftover — may be negative
  edited?: boolean; // amounts were corrected by hand in the Savings tab
}

export interface SpendForAllocation {
  self: number;
  family: number;
}

// The Self/Family split of `budget`. Users who never opened Budget Split have
// no `spend_for_budgets`, which means the whole budget is theirs (Self).
export function allocationOf(
  stored: { self?: number; family?: number } | null | undefined,
  budget: number,
): SpendForAllocation {
  return {
    self: Number(stored?.self ?? budget) || 0,
    family: Number(stored?.family ?? 0) || 0,
  };
}

export interface MonthlyLeftover extends MonthlySavingsEntry {
  spent: number;
  income: number;
  budget: number;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// The period end one month on from `end`, pinned to `anchorDay` and clamped to
// the length of that month (a 31st anchor lands on the 30th/28th where needed).
export function nextPeriodEnd(end: Date, anchorDay: number): Date {
  const y = end.getFullYear();
  const m = end.getMonth();
  const daysInNext = new Date(y, m + 2, 0).getDate();
  return new Date(y, m + 1, Math.min(anchorDay, daysInNext), 23, 59, 59, 999);
}

// First period end strictly after `from`, on the same day-of-month anchor.
export function periodEndAfter(from: Date, anchorDay: number): Date {
  const y = from.getFullYear();
  const m = from.getMonth();
  const daysThisMonth = new Date(y, m + 1, 0).getDate();
  const candidate = new Date(
    y, m, Math.min(anchorDay, daysThisMonth), 23, 59, 59, 999,
  );
  return candidate > from ? candidate : nextPeriodEnd(candidate, anchorDay);
}

type LeftoverRow = { amount: number; category: string; spend_for?: string | null };

// budget + income - spend, floored at 0. Loan Return rows are netted out of
// spend the same way the Wallet's budget math does it. `self`/`family` split
// that same leftover by scope using `alloc` (see the header comment).
export function leftoverOf(
  rows: LeftoverRow[],
  budget: number,
  alloc: SpendForAllocation = { self: budget, family: 0 },
) {
  let spent = 0;
  let income = 0;
  let familySpent = 0;
  for (const r of rows) {
    const amount = Number(r.amount) || 0;
    if (r.category === INCOME_CATEGORY) income += amount;
    else if (r.category !== LOAN_RETURN_CATEGORY) {
      spent += amount;
      if (spendForOf(r) === 'family') familySpent += amount;
    }
  }
  const family = alloc.family - familySpent;
  const self = budget + income - spent - family;
  return { spent, income, amount: Math.max(0, budget + income - spent), self, family };
}

// True for months before the user first tagged anything as Family (or every
// month, if they never have) — those get the 50/50 split.
export function isBeforeFamilyTagging(key: string, firstFamilyKey: string | null): boolean {
  return firstFamilyKey === null || key < firstFamilyKey;
}

export function halfSplit(amount: number) {
  const self = amount / 2;
  return { self, family: amount - self };
}

// Give a legacy entry (no split) its Self/Family shares. Months before Family
// tagging are halved; otherwise Family comes from the scanned month and Self
// takes the rest, so the shares still add up to the amount actually on record
// — a real rollover's period doesn't line up exactly with the calendar month
// the scan used.
export function withSplit(
  entry: MonthlySavingsEntry,
  scanned: { family?: number } | undefined,
  firstFamilyKey: string | null,
): MonthlySavingsEntry {
  if (entry.self != null && entry.family != null) return entry;
  if (isBeforeFamilyTagging(entry.key, firstFamilyKey)) {
    return { ...entry, ...halfSplit(entry.amount) };
  }
  const family = scanned?.family ?? 0;
  return { ...entry, family, self: entry.amount - family };
}

// Read every expense row the user has and fold it into per-calendar-month
// leftovers. Only *closed* months are returned — the month in progress has no
// final figure yet. Months with no rows at all are skipped: an empty bucket
// can't distinguish "spent nothing" from "wasn't using the app yet", and
// crediting a full budget for those would invent savings.
export async function scanMonthlyLeftovers(
  userId: string,
  budget: number,
  alloc: SpendForAllocation = { self: budget, family: 0 },
): Promise<{ months: MonthlyLeftover[]; firstFamilyKey: string | null }> {
  // '*' rather than naming spend_for: a DB without that migration would reject
  // the column, while spendForOf() already reads a missing value as Self.
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const buckets = new Map<string, LeftoverRow[]>();
  let firstFamilyKey: string | null = null;
  for (const row of data || []) {
    if (!row.created_at) continue;
    const key = monthKey(new Date(row.created_at));
    // Rows arrive oldest first, so the first Family row marks the cutoff.
    if (firstFamilyKey === null && spendForOf(row) === 'family') firstFamilyKey = key;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row as any);
    else buckets.set(key, [row as any]);
  }

  const currentKey = monthKey(new Date());
  const months = Array.from(buckets.entries())
    .filter(([key]) => key < currentKey)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, rows]) => {
      const [year, month] = key.split('-').map(Number);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);
      const leftover = leftoverOf(rows, budget, alloc);
      const { spent, income, amount } = leftover;
      const { self, family } = isBeforeFamilyTagging(key, firstFamilyKey)
        ? halfSplit(amount)
        : leftover;
      return {
        key,
        label: monthLabel(new Date(year, month - 1, 1)),
        amount,
        date: endOfMonth.toISOString(),
        origin: 'backfill' as const,
        self,
        family,
        spent,
        income,
        budget,
      };
    });
  return { months, firstFamilyKey };
}

// Union by month key. The entry already on record wins — which keeps re-running
// the scan idempotent — with one exception: a real rollover always replaces a
// reconstructed estimate for the same month. Without that exception a backfilled
// estimate would shadow the genuine sweep that arrives when the period closes.
// Legacy entries written before `origin` existed are real rollovers, and an
// undefined origin is correctly treated as non-backfill here.
export function mergeMonthlySavings(
  existing: MonthlySavingsEntry[],
  incoming: MonthlySavingsEntry[],
): MonthlySavingsEntry[] {
  const byKey = new Map<string, MonthlySavingsEntry>();
  for (const entry of existing) byKey.set(entry.key, entry);
  for (const entry of incoming) {
    const current = byKey.get(entry.key);
    if (!current || (current.origin === 'backfill' && entry.origin === 'rollover')) {
      byKey.set(entry.key, entry);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
}
