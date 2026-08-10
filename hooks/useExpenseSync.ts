import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { isWeekend } from 'date-fns';
import { newId } from '../lib/ids';
import { runWrite } from '../lib/runWrite';
import { DEFAULT_SPEND_FOR, SpendFor, splitBySpendFor, sumAmount } from '../lib/spendFor';

export const INCOME_CATEGORY = 'Income';
export const LENDING_CATEGORY = 'Lending';
export const LOAN_RETURN_CATEGORY = 'Loan Return';

export interface Expense {
  id?: string;
  amount: number;
  description: string;
  category: string;
  is_weekend: boolean;
  created_at?: string;
  source?: string;
  spend_for?: SpendFor;
}

export interface NewExpensePayload {
  amount: number;
  description: string;
  category: string;
  date?: string;
  source?: string;
  spend_for?: SpendFor;
}

export interface Profile {
  id: string;
  monthly_budget: number;
  savings_goal: number;
  total_savings: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
}

export interface QuickTemplate {
  id: string;
  title: string;
  amount: number;
  category: string;
  icon: string;
  group_name: string;
  sort_order: number;
}

export interface NewTemplatePayload {
  title: string;
  amount: number;
  category: string;
  icon: string;
  group_name: string;
}

function computeStreak(expenses: Expense[]): number {
  if (expenses.length === 0) return 0;
  const days = new Set<string>();
  for (const e of expenses) {
    if (!e.created_at) continue;
    const d = new Date(e.created_at);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // Allow streak to start either today or yesterday (don't reset until 2 days missed)
  const todayKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
  if (!days.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (true) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (days.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }
  return streak;
}

export function useExpenseSync(userId: string | undefined, budgetFallback = 0, goalFallback = 0) {
  const queryClient = useQueryClient();

  const { data: profile } = useQuery<Profile | null>({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId || '')
        .maybeSingle();
      if (error) {
        console.error('[profile query error]', error.message, 'userId:', userId);
        throw error;
      }
      return data ?? null;
    },
    enabled: !!userId,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', userId || '')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: quickTemplates = [] } = useQuery<QuickTemplate[]>({
    queryKey: ['quick_templates', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quick_templates')
        .select('*')
        .eq('user_id', userId || '')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: allExpenses = [], isLoading } = useQuery({
    queryKey: ['expenses', userId],
    queryFn: async () => {
      if (!userId) return [];
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', startOfMonth.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Expense[];
    },
    enabled: !!userId,
  });

  // Use a distinct query key ('loans_raw') so this plain table query never
  // overwrites the loans_with_totals cache used by useLoans (key: 'loans').
  const { data: loans = [] } = useQuery({
    queryKey: ['loans_raw', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('loans')
        .select('id, expense_id, type, principal, created_at, settled_at')
        .eq('user_id', userId);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const loanIds = useMemo(() => loans.map(l => l.id), [loans]);

  // Stable key (no loanIds in it) so optimistic loan/payment writes target the
  // same cache entry across loan additions. The current loanIds are read inside
  // the queryFn; loan mutations invalidate this key, refetching with fresh ids.
  const { data: loanPayments = [] } = useQuery({
    queryKey: ['loan_payments_all', userId],
    queryFn: async () => {
      if (!userId || loanIds.length === 0) return [];
      const { data, error } = await supabase
        .from('loan_payments')
        .select('*')
        .in('loan_id', loanIds);
      if (error) throw error;
      return data;
    },
    enabled: !!userId && loanIds.length > 0,
  });

  // Outstanding borrowed balance from loans created this month.
  // Subtract payments (full or partial) so wallet/analytics reflect repayments
  // immediately, even when the user hasn't tapped "Settle" to stamp settled_at.
  const borrowedThisMonth = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const paidByLoan = loanPayments.reduce((acc, p) => {
      acc[p.loan_id] = (acc[p.loan_id] || 0) + Number(p.amount);
      return acc;
    }, {} as Record<string, number>);
    return loans
      .filter(l => {
        if (!l.created_at || l.type !== 'borrowed') return false;
        if (l.settled_at) return false;
        const created = new Date(l.created_at);
        return created >= startOfMonth;
      })
      .reduce((sum, l) => {
        const paid = paidByLoan[l.id] || 0;
        return sum + Math.max(0, Number(l.principal) - paid);
      }, 0);
  }, [loans, loanPayments]);

  const loanRelatedExpenseIds = useMemo(() => {
    const ids = new Set<string>();
    loans.forEach(l => {
      if (l.expense_id) ids.add(l.expense_id);
    });
    loanPayments.forEach(p => {
      if (p.expense_id) ids.add(p.expense_id);
    });
    return ids;
  }, [loans, loanPayments]);

  const baseMonthlyBudget = profile?.monthly_budget || budgetFallback;
  const monthlyBudget = baseMonthlyBudget + borrowedThisMonth;
  const savingsGoal = profile?.savings_goal || goalFallback;
  const weeklyBudget = monthlyBudget / 4;

  // expenses: all non-Income, non-LoanReturn, non-Loan-Related rows (includes Lending) — used for budget math.
  // incomeEntries: regular Income only (salary etc.) — does NOT include Loan Return.
  // loanReturnEntries: lent-money-returned entries — separately netted against Lending for budget.
  // displayExpenses: expenses minus Lending — pure user spend for charts and category breakdown.
  const expenses = useMemo(() =>
    allExpenses.filter(e =>
      e.category !== INCOME_CATEGORY &&
      e.category !== LOAN_RETURN_CATEGORY &&
      !loanRelatedExpenseIds.has(e.id || '')
    ),
    [allExpenses, loanRelatedExpenseIds]
  );
  const incomeEntries = useMemo(() =>
    allExpenses.filter(e =>
      e.category === INCOME_CATEGORY &&
      !loanRelatedExpenseIds.has(e.id || '')
    ),
    [allExpenses, loanRelatedExpenseIds]
  );
  const loanReturnEntries = useMemo(() =>
    allExpenses.filter(e => e.category === LOAN_RETURN_CATEGORY),
    [allExpenses]
  );
  const displayExpenses = useMemo(() =>
    expenses.filter(e => e.category !== LENDING_CATEGORY),
    [expenses]
  );

  const currentWeekStart = new Date();
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
  currentWeekStart.setHours(0, 0, 0, 0);

  const weeklyExpenses = displayExpenses.filter(e => e.created_at && new Date(e.created_at) >= currentWeekStart);
  const totalSpentWeekly = weeklyExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const leftoverBudget = weeklyBudget - totalSpentWeekly;
  const totalSpentMonthly = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const displayTotalMonthly = displayExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const totalIncomeMonthly = incomeEntries.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const totalLoanReturns = loanReturnEntries.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const netMonthly = totalIncomeMonthly - totalSpentMonthly;
  // savingsThisMonth: budget + regular income - all spend (incl. Lending outflows)
  const savingsThisMonth = monthlyBudget + totalIncomeMonthly - totalSpentMonthly;

  const now = new Date();
  const daysLeft = 7 - now.getDay();
  const burnRate = daysLeft === 0 ? leftoverBudget : leftoverBudget / daysLeft;
  const totalSavings = profile?.total_savings || 0;

  const streak = useMemo(() => computeStreak(allExpenses), [allExpenses]);

  // Mutations are registered centrally in lib/offlineMutations.ts (keyed by
  // mutationKey) so they queue offline and replay after a restart. These hooks
  // only shape the variables: mint client UUIDs + stamp timestamps up front so
  // they're identical for the optimistic row and the eventual (possibly much
  // later) server insert.
  // Variables are typed `any` because the mutationFn/onMutate live in the central
  // registry (lib/offlineMutations.ts); these only inherit the defaults by key.
  const addExpenseMutation = useMutation<unknown, unknown, any>({ mutationKey: ['addExpense'] });
  const deleteExpenseMutation = useMutation<unknown, unknown, any>({ mutationKey: ['deleteExpense'] });
  const updateExpenseMutation = useMutation<unknown, unknown, any>({ mutationKey: ['updateExpense'] });
  const updateProfileMutation = useMutation<unknown, unknown, any>({ mutationKey: ['updateProfile'] });
  const updateTemplateMutation = useMutation<unknown, unknown, any>({ mutationKey: ['updateTemplate'] });
  const addTemplateMutation = useMutation<unknown, unknown, any>({ mutationKey: ['addTemplate'] });
  const deleteTemplateMutation = useMutation<unknown, unknown, any>({ mutationKey: ['deleteTemplate'] });

  const buildExpenseVars = (payload: NewExpensePayload) => {
    const date = payload.date ? new Date(payload.date) : new Date();
    return {
      id: newId(),
      userId,
      amount: payload.amount,
      description: payload.description,
      category: payload.category,
      is_weekend: isWeekend(date),
      created_at: date.toISOString(),
      source: payload.source ?? null,
      spend_for: payload.spend_for ?? DEFAULT_SPEND_FOR,
    };
  };

  const addExpense = (payload: NewExpensePayload) => addExpenseMutation.mutate(buildExpenseVars(payload));
  const addExpenseAsync = (payload: NewExpensePayload) => addExpenseMutation.mutateAsync(buildExpenseVars(payload));
  const deleteExpense = (expenseId: string) => deleteExpenseMutation.mutate({ userId, expenseId });
  const deleteExpenseAsync = (expenseId: string) => deleteExpenseMutation.mutateAsync({ userId, expenseId });
  // updates: { description?, amount?, category?, source? }. Pass year/month to
  // optimistically patch the History month cache too (for edits made there).
  const updateExpenseAsync = (
    id: string,
    updates: Record<string, any>,
    opts?: { year?: number; month?: number }
  ) => runWrite(updateExpenseMutation, { userId, id, updates, year: opts?.year, month: opts?.month });
  const updateProfile = (updates: { monthly_budget?: number; savings_goal?: number; total_savings?: number }) =>
    updateProfileMutation.mutate({ userId, updates });
  const updateTemplate = ({ id, ...updates }: { id: string } & Partial<QuickTemplate>) =>
    updateTemplateMutation.mutate({ userId, id, updates });
  const addTemplate = (payload: NewTemplatePayload) =>
    addTemplateMutation.mutate({
      id: newId(),
      userId,
      ...payload,
      sort_order: quickTemplates.filter(t => t.group_name === payload.group_name).length,
    });
  const deleteTemplate = (id: string) => deleteTemplateMutation.mutate({ userId, id });
  const deleteTemplateAsync = (id: string) => runWrite(deleteTemplateMutation, { userId, id });

  const { commuteTemplates, foodTemplates, otherTemplates, templateGroups, categoryMap } = useMemo(() => {
    const commute = quickTemplates.filter(t => t.group_name === 'commute');
    const food = quickTemplates.filter(t => t.group_name === 'food');
    const other = quickTemplates.filter(t => t.group_name !== 'commute' && t.group_name !== 'food');
    const groups = Array.from(new Set(quickTemplates.map(t => t.group_name)));
    const catMap = categories.reduce((acc, cat) => {
      acc[cat.name] = { icon: cat.icon, color: cat.color };
      return acc;
    }, {} as Record<string, { icon: string; color: string }>);

    return { commuteTemplates: commute, foodTemplates: food, otherTemplates: other, templateGroups: groups, categoryMap: catMap };
  }, [quickTemplates, categories]);

  // Per-category spending this month (display expenses only — no loan categories)
  const categorySpend = useMemo(() => {
    const map: Record<string, number> = {};
    displayExpenses.forEach(e => {
      map[e.category] = (map[e.category] || 0) + Number(e.amount);
    });
    return map;
  }, [displayExpenses]);

  // Self / Family split of this month's real spend. Built off displayExpenses so
  // it lines up with displayTotalMonthly (no Income, no loan bookkeeping rows).
  const { selfExpenses, familyExpenses, selfTotalMonthly, familyTotalMonthly } = useMemo(() => {
    const { self, family } = splitBySpendFor(displayExpenses);
    return {
      selfExpenses: self,
      familyExpenses: family,
      selfTotalMonthly: sumAmount(self),
      familyTotalMonthly: sumAmount(family),
    };
  }, [displayExpenses]);

  return {
    expenses,
    incomeEntries,
    allExpenses,
    displayExpenses,
    selfExpenses,
    familyExpenses,
    weeklyExpenses,
    profile,
    categories,
    categoryMap,
    quickTemplates,
    commuteTemplates,
    foodTemplates,
    otherTemplates,
    templateGroups,
    categorySpend,
    isLoading,
    loanRelatedExpenseIds,
    metrics: {
      leftoverBudget,
      burnRate,
      totalSavings,
      weeklyBudget,
      monthlyBudget,
      savingsThisMonth,
      totalSpentMonthly,
      displayTotalMonthly,
      selfTotalMonthly,
      familyTotalMonthly,
      totalIncomeMonthly,
      netMonthly,
      savingsGoal,
      streak,
    },
    addExpense,
    addExpenseAsync,
    deleteExpense,
    deleteExpenseAsync,
    updateExpenseAsync,
    updateProfile,
    updateTemplate,
    addTemplate,
    deleteTemplate,
    deleteTemplateAsync,
    isAdding: addExpenseMutation.isPending,
    isDeleting: deleteExpenseMutation.isPending,
  };
}
