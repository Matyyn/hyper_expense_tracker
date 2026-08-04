import { supabase } from './supabase';
import { INCOME_CATEGORY, LOAN_RETURN_CATEGORY } from '../hooks/useExpenseSync';

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

// budget + income - spend, floored at 0. Loan Return rows are netted out of
// spend the same way the Wallet's budget math does it.
export function leftoverOf(rows: Array<{ amount: number; category: string }>, budget: number) {
  let spent = 0;
  let income = 0;
  for (const r of rows) {
    const amount = Number(r.amount) || 0;
    if (r.category === INCOME_CATEGORY) income += amount;
    else if (r.category !== LOAN_RETURN_CATEGORY) spent += amount;
  }
  return { spent, income, amount: Math.max(0, budget + income - spent) };
}

// Read every expense row the user has and fold it into per-calendar-month
// leftovers. Only *closed* months are returned — the month in progress has no
// final figure yet. Months with no rows at all are skipped: an empty bucket
// can't distinguish "spent nothing" from "wasn't using the app yet", and
// crediting a full budget for those would invent savings.
export async function scanMonthlyLeftovers(
  userId: string,
  budget: number,
): Promise<MonthlyLeftover[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('amount, category, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const buckets = new Map<string, Array<{ amount: number; category: string }>>();
  for (const row of data || []) {
    if (!row.created_at) continue;
    const key = monthKey(new Date(row.created_at));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row as any);
    else buckets.set(key, [row as any]);
  }

  const currentKey = monthKey(new Date());
  return Array.from(buckets.entries())
    .filter(([key]) => key < currentKey)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, rows]) => {
      const [year, month] = key.split('-').map(Number);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);
      const { spent, income, amount } = leftoverOf(rows, budget);
      return {
        key,
        label: monthLabel(new Date(year, month - 1, 1)),
        amount,
        date: endOfMonth.toISOString(),
        origin: 'backfill' as const,
        spent,
        income,
        budget,
      };
    });
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
