import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { isWeekend } from 'date-fns';

export interface Expense {
  id?: string;
  amount: number;
  description: string;
  category: string;
  is_weekend: boolean;
  created_at?: string;
}

export interface NewExpensePayload {
  amount: number;
  description: string;
  category: string;
  date?: string;
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

export function useExpenseSync(userId: string | undefined) {
  const queryClient = useQueryClient();

  // ── Profile ──
  const { data: profile } = useQuery<Profile>({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId || '')
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  // ── Categories (from DB) ──
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

  // ── Quick Templates (from DB) ──
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

  const monthlyBudget = profile?.monthly_budget || 20000;
  const savingsGoal = profile?.savings_goal || 5000;
  const weeklyBudget = monthlyBudget / 4;

  // ── Expenses (current month) ──
  const { data: expenses = [], isLoading } = useQuery({
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

  // ── Derived Metrics ──
  const currentWeekStart = new Date();
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
  currentWeekStart.setHours(0, 0, 0, 0);

  const weeklyExpenses = expenses.filter(e => e.created_at && new Date(e.created_at) >= currentWeekStart);
  const totalSpentWeekly = weeklyExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const leftoverBudget = weeklyBudget - totalSpentWeekly;
  const totalSpentMonthly = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const savingsThisMonth = monthlyBudget - totalSpentMonthly;

  const now = new Date();
  const daysLeft = 7 - now.getDay();
  const burnRate = daysLeft === 0 ? leftoverBudget : leftoverBudget / daysLeft;
  const totalSavings = profile?.total_savings || 0;

  // ── Add Expense ──
  const addExpenseMutation = useMutation({
    mutationFn: async (payload: NewExpensePayload) => {
      const expenseDate = payload.date ? new Date(payload.date) : new Date();
      const insertData: any = {
        amount: payload.amount,
        description: payload.description,
        category: payload.category,
        user_id: userId,
        is_weekend: isWeekend(expenseDate),
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
        { id: `optimistic-${Date.now()}`, amount: payload.amount, description: payload.description, category: payload.category, is_weekend: isWeekend(expenseDate), created_at: expenseDate.toISOString() },
        ...(old || []),
      ]);
      return { prev };
    },
    onError: (e, _p, ctx) => { 
      console.error("Add Expense Error:", e);
      if (ctx?.prev) queryClient.setQueryData(['expenses', userId], ctx.prev); 
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['expenses', userId] }),
  });

  // ── Delete Expense ──
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
      console.error("Delete Expense Error:", e);
      if (ctx?.prev) queryClient.setQueryData(['expenses', userId], ctx.prev); 
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['expenses', userId] }),
  });

  // ── Update Profile (budget + savings goal) ──
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
      console.error("Update Profile Error:", e);
      if (ctx?.prev) queryClient.setQueryData(['profile', userId], ctx.prev); 
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
  });

  // ── Update Quick Template Amount ──
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { error } = await supabase.from('quick_templates').update({ amount }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, amount }) => {
      await queryClient.cancelQueries({ queryKey: ['quick_templates', userId] });
      const prev = queryClient.getQueryData(['quick_templates', userId]);
      queryClient.setQueryData(['quick_templates', userId], (old: any) =>
        (old || []).map((t: QuickTemplate) => t.id === id ? { ...t, amount } : t)
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      console.error("Update Template Error:", e);
      if (ctx?.prev) queryClient.setQueryData(['quick_templates', userId], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['quick_templates', userId] }),
  });

  // ── Memoized Derived Data ──
  const { commuteTemplates, foodTemplates, categoryMap } = useMemo(() => {
    const commute = quickTemplates.filter(t => t.group_name === 'commute');
    const food = quickTemplates.filter(t => t.group_name === 'food');
    const catMap = categories.reduce((acc, cat) => {
      acc[cat.name] = { icon: cat.icon, color: cat.color };
      return acc;
    }, {} as Record<string, { icon: string; color: string }>);
    
    return { commuteTemplates: commute, foodTemplates: food, categoryMap: catMap };
  }, [quickTemplates, categories]);

  return {
    expenses,
    weeklyExpenses,
    profile,
    categories,
    categoryMap,
    quickTemplates,
    commuteTemplates,
    foodTemplates,
    isLoading,
    metrics: {
      leftoverBudget,
      burnRate,
      totalSavings,
      weeklyBudget,
      monthlyBudget,
      savingsThisMonth,
      totalSpentMonthly,
      savingsGoal,
    },
    addExpense: addExpenseMutation.mutate,
    deleteExpense: deleteExpenseMutation.mutate,
    updateProfile: updateProfileMutation.mutate,
    updateTemplate: updateTemplateMutation.mutate,
    isAdding: addExpenseMutation.isPending,
    isDeleting: deleteExpenseMutation.isPending,
  };
}
