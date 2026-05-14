import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { isWeekend } from 'date-fns';
import * as SecureStore from 'expo-secure-store';

export interface Expense {
  id?: string;
  amount: number;
  description: string;
  category: string;
  is_weekend: boolean;
  created_at?: string;
}

export interface Profile {
  id: string;
  monthly_budget: number;
  total_savings: number;
}

export function useExpenseSync(userId: string | undefined) {
  const queryClient = useQueryClient();

  // Fetch the User Profile for Budget
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

  // Fetch Local Savings Goal
  const { data: savingsGoal = 5000 } = useQuery({
    queryKey: ['savingsGoal'],
    queryFn: async () => {
      const val = await SecureStore.getItemAsync('savingsGoal');
      return val ? Number(val) : 5000;
    }
  });

  const monthlyBudget = profile?.monthly_budget || 20000;
  const weeklyBudget = monthlyBudget / 4; 

  // Fetch expenses for the current month
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

  // Calculate wallet metrics
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
  const burnRate = Object.is(daysLeft, 0) ? leftoverBudget : leftoverBudget / daysLeft;
  
  const totalSavings = profile?.total_savings || 0;

  // Add expense mutation
  const addExpenseMutation = useMutation({
    mutationFn: async (newExpense: Omit<Expense, 'id' | 'is_weekend' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('expenses')
        .insert([{
          ...newExpense,
          user_id: userId,
          is_weekend: isWeekend(new Date()),
        }])
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onMutate: async (newExpense) => {
      await queryClient.cancelQueries({ queryKey: ['expenses', userId] });
      const previousExpenses = queryClient.getQueryData(['expenses', userId]);
      queryClient.setQueryData(['expenses', userId], (old: any) => [
        { id: Math.random().toString(), ...newExpense, is_weekend: isWeekend(new Date()), created_at: new Date().toISOString() },
        ...(old || []),
      ]);
      return { previousExpenses };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['expenses', userId] }),
  });

  // Update budget mutation
  const updateBudgetMutation = useMutation({
    mutationFn: async (newBudget: number) => {
      const { error } = await supabase
        .from('profiles')
        .update({ monthly_budget: newBudget })
        .eq('id', userId || '');
      if (error) throw error;
    },
    onMutate: async (newBudget) => {
      await queryClient.cancelQueries({ queryKey: ['profile', userId] });
      const previousProfile = queryClient.getQueryData(['profile', userId]);
      queryClient.setQueryData(['profile', userId], (old: any) => ({
        ...old,
        monthly_budget: newBudget
      }));
      return { previousProfile };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
  });

  // Update savings goal mutation
  const updateSavingsGoalMutation = useMutation({
    mutationFn: async (goal: number) => {
      await SecureStore.setItemAsync('savingsGoal', goal.toString());
    },
    onMutate: async (goal) => {
      await queryClient.cancelQueries({ queryKey: ['savingsGoal'] });
      queryClient.setQueryData(['savingsGoal'], goal);
    }
  });

  return {
    expenses,
    weeklyExpenses,
    profile,
    isLoading,
    metrics: {
      leftoverBudget,
      burnRate,
      totalSavings,
      weeklyBudget,
      monthlyBudget,
      savingsThisMonth,
      totalSpentMonthly,
      savingsGoal
    },
    addExpense: addExpenseMutation.mutate,
    updateBudget: updateBudgetMutation.mutate,
    updateSavingsGoal: updateSavingsGoalMutation.mutate,
    isAdding: addExpenseMutation.isPending
  };
}
