import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { isWeekend } from 'date-fns';

export const INCOME_CATEGORY = 'Income';
export const LENDING_CATEGORY = 'Lending';

export interface Expense {
  id?: string;
  amount: number;
  description: string;
  category: string;
  is_weekend: boolean;
  created_at?: string;
  source?: string;
}

export interface NewExpensePayload {
  amount: number;
  description: string;
  category: string;
  date?: string;
  source?: string;
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

  const monthlyBudget = profile?.monthly_budget || budgetFallback;
  const savingsGoal = profile?.savings_goal || goalFallback;
  const weeklyBudget = monthlyBudget / 4;

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

  // Separate income from spend. Lending counts as spend (lent money is out
  // of your wallet) so it stays in the expenses bucket.
  const expenses = useMemo(() => allExpenses.filter(e => e.category !== INCOME_CATEGORY), [allExpenses]);
  const incomeEntries = useMemo(() => allExpenses.filter(e => e.category === INCOME_CATEGORY), [allExpenses]);

  const currentWeekStart = new Date();
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
  currentWeekStart.setHours(0, 0, 0, 0);

  const weeklyExpenses = expenses.filter(e => e.created_at && new Date(e.created_at) >= currentWeekStart);
  const totalSpentWeekly = weeklyExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const leftoverBudget = weeklyBudget - totalSpentWeekly;
  const totalSpentMonthly = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const totalIncomeMonthly = incomeEntries.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const netMonthly = totalIncomeMonthly - totalSpentMonthly;
  const savingsThisMonth = monthlyBudget - totalSpentMonthly;

  const now = new Date();
  const daysLeft = 7 - now.getDay();
  const burnRate = daysLeft === 0 ? leftoverBudget : leftoverBudget / daysLeft;
  const totalSavings = profile?.total_savings || 0;

  const streak = useMemo(() => computeStreak(allExpenses), [allExpenses]);

  const addExpenseMutation = useMutation({
    mutationFn: async (payload: NewExpensePayload) => {
      const expenseDate = payload.date ? new Date(payload.date) : new Date();
      const insertData: any = {
        amount: payload.amount,
        description: payload.description,
        category: payload.category,
        user_id: userId,
        is_weekend: isWeekend(expenseDate),
        source: payload.source || null,
      };
      if (payload.date) {
        insertData.created_at = new Date(payload.date).toISOString();
      }
      const { data, error } = await supabase.from('expenses').insert([insertData]).select().single();
      if (error) throw error;
      return data;
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['expenses', userId] });
      const prev = queryClient.getQueryData(['expenses', userId]);
      const expenseDate = payload.date ? new Date(payload.date) : new Date();
      queryClient.setQueryData(['expenses', userId], (old: any) => [
        { id: `optimistic-${Date.now()}`, amount: payload.amount, description: payload.description, category: payload.category, is_weekend: isWeekend(expenseDate), created_at: expenseDate.toISOString(), source: payload.source },
        ...(old || []),
      ]);
      return { prev };
    },
    onError: (e, _p, ctx) => {
      console.error('Add Expense Error:', e);
      if (ctx?.prev) queryClient.setQueryData(['expenses', userId], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['expenses', userId] }),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
      if (error) throw error;
    },
    onMutate: async (expenseId) => {
      await queryClient.cancelQueries({ queryKey: ['expenses', userId] });
      const prev = queryClient.getQueryData(['expenses', userId]);
      queryClient.setQueryData(['expenses', userId], (old: any) => (old || []).filter((e: Expense) => e.id !== expenseId));
      return { prev };
    },
    onError: (e, _id, ctx) => {
      console.error('Delete Expense Error:', e);
      if (ctx?.prev) queryClient.setQueryData(['expenses', userId], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['expenses', userId] }),
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: { monthly_budget?: number; savings_goal?: number }) => {
      const { error } = await supabase.from('profiles').update(updates).eq('id', userId || '');
      if (error) throw error;
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ['profile', userId] });
      const prev = queryClient.getQueryData(['profile', userId]);
      queryClient.setQueryData(['profile', userId], (old: any) => ({ ...old, ...updates }));
      return { prev };
    },
    onError: (e, _u, ctx) => {
      console.error('Update Profile Error:', e);
      if (ctx?.prev) queryClient.setQueryData(['profile', userId], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<QuickTemplate>) => {
      const { error } = await supabase.from('quick_templates').update(updates).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: ['quick_templates', userId] });
      const prev = queryClient.getQueryData(['quick_templates', userId]);
      queryClient.setQueryData(['quick_templates', userId], (old: any) =>
        (old || []).map((t: QuickTemplate) => t.id === id ? { ...t, ...updates } : t)
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      console.error('Update Template Error:', e);
      if (ctx?.prev) queryClient.setQueryData(['quick_templates', userId], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['quick_templates', userId] }),
  });

  const addTemplateMutation = useMutation({
    mutationFn: async (payload: NewTemplatePayload) => {
      const sort_order = quickTemplates.filter(t => t.group_name === payload.group_name).length;
      const { data, error } = await supabase.from('quick_templates').insert([{ ...payload, user_id: userId, sort_order }]).select().single();
      if (error) throw error;
      return data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['quick_templates', userId] }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quick_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['quick_templates', userId] });
      const prev = queryClient.getQueryData(['quick_templates', userId]);
      queryClient.setQueryData(['quick_templates', userId], (old: any) =>
        (old || []).filter((t: QuickTemplate) => t.id !== id)
      );
      return { prev };
    },
    onError: (e, _id, ctx) => {
      console.error('Delete Template Error:', e);
      if (ctx?.prev) queryClient.setQueryData(['quick_templates', userId], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['quick_templates', userId] }),
  });

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

  // Per-category spending this month
  const categorySpend = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(e => {
      map[e.category] = (map[e.category] || 0) + Number(e.amount);
    });
    return map;
  }, [expenses]);

  return {
    expenses,
    incomeEntries,
    allExpenses,
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
    metrics: {
      leftoverBudget,
      burnRate,
      totalSavings,
      weeklyBudget,
      monthlyBudget,
      savingsThisMonth,
      totalSpentMonthly,
      totalIncomeMonthly,
      netMonthly,
      savingsGoal,
      streak,
    },
    addExpense: addExpenseMutation.mutate,
    addExpenseAsync: addExpenseMutation.mutateAsync,
    deleteExpense: deleteExpenseMutation.mutate,
    deleteExpenseAsync: deleteExpenseMutation.mutateAsync,
    updateProfile: updateProfileMutation.mutate,
    updateTemplate: updateTemplateMutation.mutate,
    addTemplate: addTemplateMutation.mutate,
    deleteTemplate: deleteTemplateMutation.mutate,
    isAdding: addExpenseMutation.isPending,
    isDeleting: deleteExpenseMutation.isPending,
  };
}
