import type { QueryKey } from '@tanstack/react-query';
import { supabase } from './supabase';
import { queryClient } from './queryClient';
import { isOnline } from './online';
import { DEFAULT_SPEND_FOR } from './spendFor';

// ============================================================================
// Offline mutation registry
// ----------------------------------------------------------------------------
// Every write in the app is registered here as a *mutation default* keyed by a
// stable `mutationKey`. Hooks call `useMutation({ mutationKey: [...] })` and
// inherit this mutationFn/onMutate/onError/onSettled.
//
// Why a central registry (not inline in the hooks): when a write is made
// offline it is *paused* and serialized to disk. The function itself is NOT
// serializable, so on a later app launch react-query rehydrates the paused
// mutation and looks the function back up *by mutationKey* via these defaults.
// This module MUST be imported synchronously at startup (before render and
// before resumePausedMutations runs) or replay throws "No mutationFn found".
//
// Hard rules (see the offline design notes):
//  - All ids/timestamps/derived decisions are minted by the CALLER and passed
//    in `variables`. Never `new Date()` / `randomUUID()` inside mutationFn — it
//    runs at *reconnect* time, not action time. onMutate also does NOT re-run on
//    restart-replay, so anything that must survive a restart lives in variables.
//  - mutationFn reads everything from `variables` (incl. userId) — no closures.
//  - Optimistic cache writes happen in onMutate (in-session); after a restart
//    the persisted *query* cache is what shows the row, not onMutate.
// ============================================================================

export const INCOME_CATEGORY = 'Income';
export const LENDING_CATEGORY = 'Lending';

// ---- query key helpers ----
const kExpenses = (userId: string): QueryKey => ['expenses', userId];
const kProfile = (userId: string): QueryKey => ['profile', userId];
const kTemplates = (userId: string): QueryKey => ['quick_templates', userId];
const kLoans = (userId: string): QueryKey => ['loans', userId];
const kLoansRaw = (userId: string): QueryKey => ['loans_raw', userId];
const kLoanPaymentsAll = (userId: string): QueryKey => ['loan_payments_all', userId];
const kMetadata = (userId: string): QueryKey => ['metadata', userId];

// Invalidate to reconcile optimistic state with the server. Safe while offline
// (the refetch is itself paused and leaves optimistic data intact), but we skip
// it then to avoid churn. onSettled/onError only actually run once online.
function reconcile(keys: QueryKey[]) {
  if (!isOnline()) return;
  for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
  // history is keyed by [.., year, month]; invalidate the whole family
  queryClient.invalidateQueries({ queryKey: ['expenses-history'] });
}

// PostgREST reports an unknown column as PGRST204 against its schema cache.
// Turn that into an actionable message instead of a raw driver error, the same
// way the quick_templates delete policy gap is surfaced below.
function assertNoMissingColumn(error: any) {
  if (error?.code === 'PGRST204' && String(error?.message || '').includes('spend_for')) {
    throw new Error(
      'Could not save the Self/Family tag. Run the latest database migration (expenses.spend_for).'
    );
  }
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Insert/replace an expense row in the month-scoped cache, keeping desc order by
// created_at. Rows outside the current month are intentionally omitted — the
// ['expenses'] query only holds created_at >= start-of-month (write is still
// saved server-side, just not shown in this month's view).
function upsertExpenseInCache(userId: string, row: any) {
  if (new Date(row.created_at) < startOfMonth()) return;
  queryClient.setQueryData(kExpenses(userId), (old: any[] = []) => {
    const without = old.filter((e) => e.id !== row.id);
    return [...without, row].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });
}

function removeExpenseFromCache(userId: string, expenseId: string) {
  queryClient.setQueryData(kExpenses(userId), (old: any[] = []) =>
    old.filter((e) => e.id !== expenseId)
  );
}

// Recompute a loans_with_totals view row from a raw loan + its payments, matching
// the SQL view exactly (migration 20260520000000_loans.sql):
//   paid       = sum(payments.amount)
//   remaining  = principal - paid            (NOT clamped)
//   is_settled = settled_at != null || paid >= principal
//   is_overdue = due_date != null && due_date < now && settled_at == null && paid < principal
function synthLoanRow(rawLoan: any, payments: any[]): any {
  const paid = payments
    .filter((p) => p.loan_id === rawLoan.id)
    .reduce((s, p) => s + Number(p.amount), 0);
  const principal = Number(rawLoan.principal);
  const now = Date.now();
  return {
    ...rawLoan,
    principal,
    paid,
    remaining: principal - paid,
    is_settled: rawLoan.settled_at != null || paid >= principal,
    is_overdue:
      rawLoan.due_date != null &&
      new Date(rawLoan.due_date).getTime() < now &&
      rawLoan.settled_at == null &&
      paid < principal,
  };
}

// Rebuild the ['loans'] (view) cache for a single loan id from the raw + payments
// caches. Call after mutating loans_raw / loan_payments_all optimistically.
function refreshLoanViewRow(userId: string, loanId: string) {
  const raw = (queryClient.getQueryData(kLoansRaw(userId)) as any[]) || [];
  const payments = (queryClient.getQueryData(kLoanPaymentsAll(userId)) as any[]) || [];
  const rawLoan = raw.find((l) => l.id === loanId);
  queryClient.setQueryData(kLoans(userId), (old: any[] = []) => {
    const without = old.filter((l) => l.id !== loanId);
    if (!rawLoan) return without; // deleted
    const synth = synthLoanRow(rawLoan, payments);
    return [synth, ...without].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });
}

let registered = false;

export function registerOfflineMutations() {
  if (registered) return;
  registered = true;

  // ===================== EXPENSES =====================

  queryClient.setMutationDefaults(['addExpense'], {
    mutationFn: async (v: any) => {
      const { error } = await supabase.from('expenses').insert([
        {
          id: v.id,
          user_id: v.userId,
          amount: v.amount,
          description: v.description,
          category: v.category,
          is_weekend: v.is_weekend,
          source: v.source ?? null,
          spend_for: v.spend_for ?? DEFAULT_SPEND_FOR,
          created_at: v.created_at,
        },
      ]);
      assertNoMissingColumn(error);
      if (error) throw error;
    },
    onMutate: (v: any) => {
      upsertExpenseInCache(v.userId, {
        id: v.id,
        amount: v.amount,
        description: v.description,
        category: v.category,
        is_weekend: v.is_weekend,
        created_at: v.created_at,
        source: v.source ?? null,
        spend_for: v.spend_for ?? DEFAULT_SPEND_FOR,
      });
    },
    onError: (e, v: any) => {
      console.error('Add Expense Error:', e);
      removeExpenseFromCache(v.userId, v.id);
      reconcile([kExpenses(v.userId)]);
    },
    onSettled: (_d, _e, v: any) => reconcile([kExpenses(v.userId)]),
  });

  queryClient.setMutationDefaults(['deleteExpense'], {
    mutationFn: async (v: any) => {
      const { error } = await supabase.from('expenses').delete().eq('id', v.expenseId);
      if (error) throw error;
    },
    onMutate: (v: any) => {
      const prev = queryClient.getQueryData(kExpenses(v.userId));
      removeExpenseFromCache(v.userId, v.expenseId);
      return { prev };
    },
    onError: (e, v: any, ctx: any) => {
      console.error('Delete Expense Error:', e);
      if (ctx?.prev) queryClient.setQueryData(kExpenses(v.userId), ctx.prev);
      reconcile([kExpenses(v.userId)]);
    },
    onSettled: (_d, _e, v: any) => reconcile([kExpenses(v.userId)]),
  });

  queryClient.setMutationDefaults(['updateExpense'], {
    mutationFn: async (v: any) => {
      const { error } = await supabase.from('expenses').update(v.updates).eq('id', v.id);
      assertNoMissingColumn(error);
      if (error) throw error;
    },
    onMutate: (v: any) => {
      const apply = (old: any[] = []) =>
        old.map((e) => (e.id === v.id ? { ...e, ...v.updates } : e));
      queryClient.setQueryData(kExpenses(v.userId), apply);
      if (v.year != null && v.month != null) {
        queryClient.setQueryData(['expenses-history', v.userId, v.year, v.month], apply);
      }
    },
    onError: (e, v: any) => {
      console.error('Update Expense Error:', e);
      reconcile([kExpenses(v.userId)]);
    },
    onSettled: (_d, _e, v: any) => reconcile([kExpenses(v.userId)]),
  });

  // ===================== PROFILE =====================

  queryClient.setMutationDefaults(['updateProfile'], {
    mutationFn: async (v: any) => {
      const { error } = await supabase.from('profiles').update(v.updates).eq('id', v.userId);
      if (error) throw error;
    },
    onMutate: (v: any) => {
      const prev = queryClient.getQueryData(kProfile(v.userId));
      queryClient.setQueryData(kProfile(v.userId), (old: any) => ({ ...old, ...v.updates }));
      return { prev };
    },
    onError: (e, v: any, ctx: any) => {
      console.error('Update Profile Error:', e);
      if (ctx?.prev) queryClient.setQueryData(kProfile(v.userId), ctx.prev);
      reconcile([kProfile(v.userId)]);
    },
    onSettled: (_d, _e, v: any) => reconcile([kProfile(v.userId)]),
  });

  // ===================== TEMPLATES =====================

  queryClient.setMutationDefaults(['addTemplate'], {
    mutationFn: async (v: any) => {
      const { error } = await supabase.from('quick_templates').insert([
        {
          id: v.id,
          user_id: v.userId,
          title: v.title,
          amount: v.amount,
          category: v.category,
          icon: v.icon,
          group_name: v.group_name,
          sort_order: v.sort_order,
        },
      ]);
      if (error) throw error;
    },
    onMutate: (v: any) => {
      queryClient.setQueryData(kTemplates(v.userId), (old: any[] = []) => [
        ...old,
        {
          id: v.id,
          title: v.title,
          amount: v.amount,
          category: v.category,
          icon: v.icon,
          group_name: v.group_name,
          sort_order: v.sort_order,
        },
      ]);
    },
    onError: (e, v: any) => {
      console.error('Add Template Error:', e);
      queryClient.setQueryData(kTemplates(v.userId), (old: any[] = []) =>
        old.filter((t) => t.id !== v.id)
      );
      reconcile([kTemplates(v.userId)]);
    },
    onSettled: (_d, _e, v: any) => reconcile([kTemplates(v.userId)]),
  });

  queryClient.setMutationDefaults(['updateTemplate'], {
    mutationFn: async (v: any) => {
      const { error } = await supabase.from('quick_templates').update(v.updates).eq('id', v.id);
      if (error) throw error;
    },
    onMutate: (v: any) => {
      const prev = queryClient.getQueryData(kTemplates(v.userId));
      queryClient.setQueryData(kTemplates(v.userId), (old: any[] = []) =>
        old.map((t) => (t.id === v.id ? { ...t, ...v.updates } : t))
      );
      return { prev };
    },
    onError: (e, v: any, ctx: any) => {
      console.error('Update Template Error:', e);
      if (ctx?.prev) queryClient.setQueryData(kTemplates(v.userId), ctx.prev);
      reconcile([kTemplates(v.userId)]);
    },
    onSettled: (_d, _e, v: any) => reconcile([kTemplates(v.userId)]),
  });

  queryClient.setMutationDefaults(['deleteTemplate'], {
    mutationFn: async (v: any) => {
      // Select the deleted rows back so an RLS-blocked delete (0 rows, no error)
      // surfaces as a real failure instead of a phantom success.
      const { data, error } = await supabase
        .from('quick_templates')
        .delete()
        .eq('id', v.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          'Could not delete template. Run the latest database migration (quick_templates delete policy).'
        );
      }
    },
    onMutate: (v: any) => {
      const prev = queryClient.getQueryData(kTemplates(v.userId));
      queryClient.setQueryData(kTemplates(v.userId), (old: any[] = []) =>
        old.filter((t) => t.id !== v.id)
      );
      return { prev };
    },
    onError: (e, v: any, ctx: any) => {
      console.error('Delete Template Error:', e);
      if (ctx?.prev) queryClient.setQueryData(kTemplates(v.userId), ctx.prev);
      reconcile([kTemplates(v.userId)]);
    },
    onSettled: (_d, _e, v: any) => reconcile([kTemplates(v.userId)]),
  });

  // ===================== LOANS =====================
  // All loan flows are serialized per-loan via scope.id so that, on reconnect,
  // addLoan completes before a later addPayment/settle for the same loan runs
  // (otherwise the FK insert would race). See useLoans.ts for variable shaping.

  queryClient.setMutationDefaults(['addLoan'], {
    mutationFn: async (v: any) => {
      // 1. linked principal expense (Lending if lent, Income if borrowed)
      const { error: expErr } = await supabase.from('expenses').insert([
        {
          id: v.expenseId,
          user_id: v.userId,
          amount: v.principal,
          description:
            v.type === 'lent' ? `Lent to ${v.person}` : `Borrowed from ${v.person}`,
          category: v.type === 'lent' ? LENDING_CATEGORY : INCOME_CATEGORY,
          source: v.source ?? null,
          is_weekend: v.is_weekend,
          created_at: v.created_at,
        },
      ]);
      if (expErr) throw expErr;

      // 2. the loan itself
      const { error: loanErr } = await supabase.from('loans').insert([
        {
          id: v.loanId,
          user_id: v.userId,
          type: v.type,
          person: v.person,
          principal: v.principal,
          source: v.source ?? null,
          description: v.description ?? null,
          due_date: v.due_date ?? null,
          expense_id: v.expenseId,
          created_at: v.created_at,
          settled_at: v.settled_at ?? null,
        },
      ]);
      if (loanErr) {
        await supabase.from('expenses').delete().eq('id', v.expenseId);
        throw loanErr;
      }

      // 3. optional initial payment (+ repayment expense for borrowed)
      if (v.paid && v.paid > 0) {
        if (v.payExpenseId) {
          const { error: payExpErr } = await supabase.from('expenses').insert([
            {
              id: v.payExpenseId,
              user_id: v.userId,
              amount: v.paid,
              description: `Repayment to ${v.person}`,
              category: LENDING_CATEGORY,
              source: v.source ?? null,
              is_weekend: v.is_weekend,
              created_at: v.created_at,
            },
          ]);
          if (payExpErr) throw payExpErr;
        }
        const { error: payErr } = await supabase.from('loan_payments').insert([
          {
            id: v.paymentId,
            loan_id: v.loanId,
            amount: v.paid,
            note: 'Initial paid amount',
            expense_id: v.payExpenseId ?? null,
            paid_at: v.created_at,
          },
        ]);
        if (payErr) {
          if (v.payExpenseId) await supabase.from('expenses').delete().eq('id', v.payExpenseId);
          throw payErr;
        }
      }
    },
    onMutate: (v: any) => {
      // raw loan row
      queryClient.setQueryData(kLoansRaw(v.userId), (old: any[] = []) => [
        ...old,
        {
          id: v.loanId,
          user_id: v.userId,
          type: v.type,
          principal: v.principal,
          created_at: v.created_at,
          settled_at: v.settled_at ?? null,
          person: v.person,
          source: v.source ?? null,
          description: v.description ?? null,
          due_date: v.due_date ?? null,
          expense_id: v.expenseId,
        },
      ]);
      // principal expense
      upsertExpenseInCache(v.userId, {
        id: v.expenseId,
        amount: v.principal,
        description: v.type === 'lent' ? `Lent to ${v.person}` : `Borrowed from ${v.person}`,
        category: v.type === 'lent' ? LENDING_CATEGORY : INCOME_CATEGORY,
        is_weekend: v.is_weekend,
        created_at: v.created_at,
        source: v.source ?? null,
      });
      // optional initial payment + repayment expense
      if (v.paid && v.paid > 0) {
        queryClient.setQueryData(kLoanPaymentsAll(v.userId), (old: any[] = []) => [
          ...old,
          {
            id: v.paymentId,
            loan_id: v.loanId,
            amount: v.paid,
            note: 'Initial paid amount',
            expense_id: v.payExpenseId ?? null,
            paid_at: v.created_at,
          },
        ]);
        if (v.payExpenseId) {
          upsertExpenseInCache(v.userId, {
            id: v.payExpenseId,
            amount: v.paid,
            description: `Repayment to ${v.person}`,
            category: LENDING_CATEGORY,
            is_weekend: v.is_weekend,
            created_at: v.created_at,
            source: v.source ?? null,
          });
        }
      }
      refreshLoanViewRow(v.userId, v.loanId);
    },
    onError: (e, v: any) => {
      console.error('Add Loan Error:', e);
      reconcile([kLoans(v.userId), kLoansRaw(v.userId), kLoanPaymentsAll(v.userId), kExpenses(v.userId)]);
    },
    onSettled: (_d, _e, v: any) =>
      reconcile([kLoans(v.userId), kLoansRaw(v.userId), kLoanPaymentsAll(v.userId), kExpenses(v.userId)]),
  });

  queryClient.setMutationDefaults(['updateLoan'], {
    mutationFn: async (v: any) => {
      const { error } = await supabase.from('loans').update(v.patch).eq('id', v.id);
      if (error) throw error;
      if (v.expenseId && v.expensePatch && Object.keys(v.expensePatch).length > 0) {
        const { error: expErr } = await supabase
          .from('expenses')
          .update(v.expensePatch)
          .eq('id', v.expenseId);
        if (expErr) throw expErr;
      }
    },
    onMutate: (v: any) => {
      queryClient.setQueryData(kLoansRaw(v.userId), (old: any[] = []) =>
        old.map((l) => (l.id === v.id ? { ...l, ...v.patch } : l))
      );
      if (v.expenseId && v.expensePatch) {
        queryClient.setQueryData(kExpenses(v.userId), (old: any[] = []) =>
          old.map((e) => (e.id === v.expenseId ? { ...e, ...v.expensePatch } : e))
        );
      }
      refreshLoanViewRow(v.userId, v.id);
    },
    onError: (e, v: any) => {
      console.error('Update Loan Error:', e);
      reconcile([kLoans(v.userId), kLoansRaw(v.userId), kExpenses(v.userId)]);
    },
    onSettled: (_d, _e, v: any) =>
      reconcile([kLoans(v.userId), kLoansRaw(v.userId), kExpenses(v.userId)]),
  });

  queryClient.setMutationDefaults(['deleteLoan'], {
    mutationFn: async (v: any) => {
      const { error } = await supabase.from('loans').delete().eq('id', v.id);
      if (error) throw error;
      if (v.expenseId) {
        await supabase.from('expenses').delete().eq('id', v.expenseId);
      }
    },
    onMutate: (v: any) => {
      queryClient.setQueryData(kLoansRaw(v.userId), (old: any[] = []) =>
        old.filter((l) => l.id !== v.id)
      );
      queryClient.setQueryData(kLoans(v.userId), (old: any[] = []) =>
        old.filter((l) => l.id !== v.id)
      );
      if (v.expenseId) removeExpenseFromCache(v.userId, v.expenseId);
    },
    onError: (e, v: any) => {
      console.error('Delete Loan Error:', e);
      reconcile([kLoans(v.userId), kLoansRaw(v.userId), kLoanPaymentsAll(v.userId), kExpenses(v.userId)]);
    },
    onSettled: (_d, _e, v: any) =>
      reconcile([kLoans(v.userId), kLoansRaw(v.userId), kLoanPaymentsAll(v.userId), kExpenses(v.userId)]),
  });

  queryClient.setMutationDefaults(['addPayment'], {
    mutationFn: async (v: any) => {
      if (v.expenseId) {
        const { error: expErr } = await supabase.from('expenses').insert([
          {
            id: v.expenseId,
            user_id: v.userId,
            amount: v.amount,
            description: `Repayment to ${v.person}`,
            category: LENDING_CATEGORY,
            source: v.source ?? null,
            is_weekend: v.is_weekend,
            created_at: v.created_at,
          },
        ]);
        if (expErr) throw expErr;
      }
      const { error } = await supabase.from('loan_payments').insert([
        {
          id: v.paymentId,
          loan_id: v.loanId,
          amount: v.amount,
          note: v.note ?? null,
          expense_id: v.expenseId ?? null,
          paid_at: v.created_at,
        },
      ]);
      if (error) {
        if (v.expenseId) await supabase.from('expenses').delete().eq('id', v.expenseId);
        throw error;
      }
      if (v.settled_at) {
        const { error: setErr } = await supabase
          .from('loans')
          .update({ settled_at: v.settled_at })
          .eq('id', v.loanId);
        if (setErr) throw setErr;
      }
    },
    onMutate: (v: any) => {
      queryClient.setQueryData(kLoanPaymentsAll(v.userId), (old: any[] = []) => [
        ...old,
        {
          id: v.paymentId,
          loan_id: v.loanId,
          amount: v.amount,
          note: v.note ?? null,
          expense_id: v.expenseId ?? null,
          paid_at: v.created_at,
        },
      ]);
      if (v.expenseId) {
        upsertExpenseInCache(v.userId, {
          id: v.expenseId,
          amount: v.amount,
          description: `Repayment to ${v.person}`,
          category: LENDING_CATEGORY,
          is_weekend: v.is_weekend,
          created_at: v.created_at,
          source: v.source ?? null,
        });
      }
      if (v.settled_at) {
        queryClient.setQueryData(kLoansRaw(v.userId), (old: any[] = []) =>
          old.map((l) => (l.id === v.loanId ? { ...l, settled_at: v.settled_at } : l))
        );
      }
      refreshLoanViewRow(v.userId, v.loanId);
    },
    onError: (e, v: any) => {
      console.error('Add Payment Error:', e);
      reconcile([kLoans(v.userId), kLoansRaw(v.userId), kLoanPaymentsAll(v.userId), kExpenses(v.userId)]);
    },
    onSettled: (_d, _e, v: any) =>
      reconcile([kLoans(v.userId), kLoansRaw(v.userId), kLoanPaymentsAll(v.userId), kExpenses(v.userId)]),
  });

  queryClient.setMutationDefaults(['settleLoan'], {
    mutationFn: async (v: any) => {
      if (v.remaining > 0) {
        if (v.expenseId) {
          const { error: expErr } = await supabase.from('expenses').insert([
            {
              id: v.expenseId,
              user_id: v.userId,
              amount: v.remaining,
              description: `Repayment to ${v.person}`,
              category: LENDING_CATEGORY,
              source: v.source ?? null,
              is_weekend: v.is_weekend,
              created_at: v.created_at,
            },
          ]);
          if (expErr) throw expErr;
        }
        const { error: payErr } = await supabase.from('loan_payments').insert([
          {
            id: v.paymentId,
            loan_id: v.id,
            amount: v.remaining,
            note: 'Settled',
            expense_id: v.expenseId ?? null,
            paid_at: v.created_at,
          },
        ]);
        if (payErr) {
          if (v.expenseId) await supabase.from('expenses').delete().eq('id', v.expenseId);
          throw payErr;
        }
      }
      const { error } = await supabase
        .from('loans')
        .update({ settled_at: v.settled_at })
        .eq('id', v.id);
      if (error) throw error;
    },
    onMutate: (v: any) => {
      if (v.remaining > 0) {
        queryClient.setQueryData(kLoanPaymentsAll(v.userId), (old: any[] = []) => [
          ...old,
          {
            id: v.paymentId,
            loan_id: v.id,
            amount: v.remaining,
            note: 'Settled',
            expense_id: v.expenseId ?? null,
            paid_at: v.created_at,
          },
        ]);
        if (v.expenseId) {
          upsertExpenseInCache(v.userId, {
            id: v.expenseId,
            amount: v.remaining,
            description: `Repayment to ${v.person}`,
            category: LENDING_CATEGORY,
            is_weekend: v.is_weekend,
            created_at: v.created_at,
            source: v.source ?? null,
          });
        }
      }
      queryClient.setQueryData(kLoansRaw(v.userId), (old: any[] = []) =>
        old.map((l) => (l.id === v.id ? { ...l, settled_at: v.settled_at } : l))
      );
      refreshLoanViewRow(v.userId, v.id);
    },
    onError: (e, v: any) => {
      console.error('Settle Loan Error:', e);
      reconcile([kLoans(v.userId), kLoansRaw(v.userId), kLoanPaymentsAll(v.userId), kExpenses(v.userId)]);
    },
    onSettled: (_d, _e, v: any) =>
      reconcile([kLoans(v.userId), kLoansRaw(v.userId), kLoanPaymentsAll(v.userId), kExpenses(v.userId)]),
  });

  queryClient.setMutationDefaults(['deletePayment'], {
    mutationFn: async (v: any) => {
      const { error } = await supabase.from('loan_payments').delete().eq('id', v.paymentId);
      if (error) throw error;
      if (v.expenseId) {
        await supabase.from('expenses').delete().eq('id', v.expenseId);
      }
      if (v.reopen) {
        await supabase.from('loans').update({ settled_at: null }).eq('id', v.loanId);
      }
    },
    onMutate: (v: any) => {
      queryClient.setQueryData(kLoanPaymentsAll(v.userId), (old: any[] = []) =>
        old.filter((p) => p.id !== v.paymentId)
      );
      // single-loan payment list (used by useLoanPayments)
      queryClient.setQueryData(['loan_payments', v.loanId], (old: any[] = []) =>
        old.filter((p) => p.id !== v.paymentId)
      );
      if (v.expenseId) removeExpenseFromCache(v.userId, v.expenseId);
      if (v.reopen) {
        queryClient.setQueryData(kLoansRaw(v.userId), (old: any[] = []) =>
          old.map((l) => (l.id === v.loanId ? { ...l, settled_at: null } : l))
        );
      }
      refreshLoanViewRow(v.userId, v.loanId);
    },
    onError: (e, v: any) => {
      console.error('Delete Payment Error:', e);
      reconcile([kLoans(v.userId), kLoansRaw(v.userId), kLoanPaymentsAll(v.userId), kExpenses(v.userId)]);
      queryClient.invalidateQueries({ queryKey: ['loan_payments', v.loanId] });
    },
    onSettled: (_d, _e, v: any) => {
      reconcile([kLoans(v.userId), kLoansRaw(v.userId), kLoanPaymentsAll(v.userId), kExpenses(v.userId)]);
      if (isOnline()) queryClient.invalidateQueries({ queryKey: ['loan_payments', v.loanId] });
    },
  });

  // ===================== AUTH user_metadata =====================
  // user_metadata lives in the Supabase Session, not the query cache. We mirror
  // it into a ['metadata', userId] query (seeded by MetadataProvider) and read
  // through that everywhere. Patches are shallow last-write-wins per top-level
  // key (the UIs read-modify-write whole arrays like savings_goals).

  queryClient.setMutationDefaults(['updateMetadata'], {
    mutationFn: async (v: any) => {
      const { error } = await supabase.auth.updateUser({ data: v.patch });
      if (error) throw error;
    },
    onMutate: (v: any) => {
      const prev = queryClient.getQueryData(kMetadata(v.userId));
      queryClient.setQueryData(kMetadata(v.userId), (old: any) => ({ ...(old || {}), ...v.patch }));
      return { prev };
    },
    onError: (e, v: any, ctx: any) => {
      console.error('Update Metadata Error:', e);
      if (ctx?.prev) queryClient.setQueryData(kMetadata(v.userId), ctx.prev);
    },
    // No invalidate: there is no queryFn for ['metadata']; AuthProvider reseeds it
    // from the confirmed session on the USER_UPDATED event after the server write.
  });
}
