import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions, TextInput, TouchableOpacity, RefreshControl, KeyboardAvoidingView, Platform, Modal, ActivityIndicator } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotification } from '../../components/NotificationProvider';
import { useExpenseSync } from '../../hooks/useExpenseSync';
import { useAuth } from '../../components/AuthProvider';
import { useCurrency } from '../../components/CurrencyProvider';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  current: number;
  deadline?: string;
}

interface GoalDraft {
  id?: string;
  name: string;
  target: string;
  current: string;
  deadline: string;
}

const EMPTY_DRAFT: GoalDraft = { name: '', target: '', current: '0', deadline: '' };

function SectionTitle({ icon, label, color = '#34d399', right }: { icon: React.ComponentProps<typeof FontAwesome>['name']; label: string; color?: string; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between mb-4">
      <View className="flex-row items-center">
        <View className="w-7 h-7 rounded-lg bg-black border border-stone-800 items-center justify-center mr-3">
          <FontAwesome name={icon} size={12} color={color} />
        </View>
        <Text className="text-white text-base font-bold tracking-tight">{label}</Text>
      </View>
      {right}
    </View>
  );
}

export default function SavingsScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { metrics, updateProfile } = useExpenseSync(user?.id);
  const { showNotification } = useNotification();
  const { format, symbol } = useCurrency();
  const { height } = useWindowDimensions();
  const { savingsThisMonth, savingsGoal, totalSavings } = metrics;

  const [goalInput, setGoalInput] = useState(savingsGoal.toString());

  const initialGoals: SavingsGoal[] = (user?.user_metadata?.savings_goals as SavingsGoal[]) || [];
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => { setGoalInput(savingsGoal.toString()); }, [savingsGoal]);

  const handleSaveMonthlyGoal = () => {
    const amount = Number(goalInput);
    if (amount >= 0) {
      updateProfile({ savings_goal: amount });
      showNotification(`Monthly goal updated to ${format(amount)}`, 'success');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['expenses', user?.id] });
    setRefreshing(false);
    showNotification('Synced', 'success');
  };

  const persistGoals = async (goals: SavingsGoal[]) => {
    setSavingGoal(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { savings_goals: goals } });
      if (error) throw error;
      return true;
    } catch (e: any) {
      showNotification(e.message || 'Could not save goals', 'error');
      return false;
    } finally {
      setSavingGoal(false);
    }
  };

  const handleSaveGoalDraft = async () => {
    if (!goalDraft) return;
    const name = goalDraft.name.trim();
    const target = Number(goalDraft.target);
    const current = Number(goalDraft.current) || 0;
    if (!name || isNaN(target) || target <= 0) {
      showNotification('Name and target required', 'error');
      return;
    }
    let next: SavingsGoal[];
    if (goalDraft.id) {
      next = initialGoals.map(g => g.id === goalDraft.id ? { ...g, name, target, current, deadline: goalDraft.deadline || undefined } : g);
    } else {
      next = [...initialGoals, { id: `${Date.now()}`, name, target, current, deadline: goalDraft.deadline || undefined }];
    }
    const ok = await persistGoals(next);
    if (ok) {
      showNotification(goalDraft.id ? 'Goal updated' : 'Goal added', 'success');
      setGoalDraft(null);
    }
  };

  const handleDeleteGoal = async () => {
    if (!goalDraft?.id) return;
    const next = initialGoals.filter(g => g.id !== goalDraft.id);
    const ok = await persistGoals(next);
    if (ok) {
      showNotification('Goal deleted', 'info');
      setGoalDraft(null);
    }
  };

  const handleContribute = async (id: string, delta: number) => {
    const next = initialGoals.map(g => g.id === id ? { ...g, current: Math.max(0, g.current + delta) } : g);
    await persistGoals(next);
  };

  const progressPct = Math.max(0, Math.min(100, (savingsThisMonth / (savingsGoal || 1)) * 100));

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        style={{ flex: 1 }}
      >
        <ScrollView
          className="px-6"
          contentContainerStyle={{ minHeight: height * 0.8, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />}
        >
          <View className="mb-6 mt-1">
            <Text className="text-3xl font-bold text-white tracking-tight">Savings Vault</Text>
            <Text className="text-emerald-400 mt-1 text-[11px] font-semibold tracking-widest uppercase">Wealth Builder</Text>
          </View>

          {/* Hero */}
          <View className="bg-emerald-950/40 border border-emerald-500/20 rounded-3xl p-6 mb-5 items-center">
            <View className="w-12 h-12 bg-emerald-500/15 rounded-2xl items-center justify-center mb-4 border border-emerald-500/30">
              <FontAwesome name="bank" size={20} color="#34d399" />
            </View>
            <Text className="text-emerald-500/70 text-[11px] font-semibold uppercase tracking-widest mb-2">Total Accumulated</Text>
            <Text className="text-4xl font-bold text-emerald-400 tracking-tight">{format(totalSavings)}</Text>
          </View>

          {/* This month */}
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-5">
            <SectionTitle icon="line-chart" label="This Month" />
            <View className="flex-row justify-between items-baseline mb-3">
              <Text className="text-2xl font-bold text-white tracking-tight">{format(savingsThisMonth)}</Text>
              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest">Projected</Text>
            </View>
            <View className="h-2.5 bg-black/60 rounded-full overflow-hidden mb-3 border border-stone-800">
              <View className="h-full bg-emerald-500 rounded-full" style={{ width: `${progressPct}%` }} />
            </View>
            <View className="flex-row justify-between">
              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest">{Math.round(progressPct)}% of Goal</Text>
              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest">Target {format(savingsGoal)}</Text>
            </View>
          </View>

          {/* Monthly goal setter */}
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-5">
            <SectionTitle icon="flag" label="Monthly Goal" />
            <View className="flex-row items-center bg-black rounded-2xl px-4 py-3 border border-stone-800 mb-4">
              <Text className="text-stone-500 text-lg font-semibold mr-3">{symbol}</Text>
              <TextInput
                className="flex-1 text-emerald-400 text-xl font-bold tracking-tight"
                keyboardType="numeric"
                value={goalInput}
                onChangeText={setGoalInput}
              />
            </View>
            <TouchableOpacity
              onPress={handleSaveMonthlyGoal}
              className="bg-emerald-600/15 py-3.5 rounded-2xl items-center border border-emerald-500/30 active:bg-emerald-600/30"
            >
              <Text className="text-emerald-400 text-sm font-bold uppercase tracking-wider">Update Goal</Text>
            </TouchableOpacity>
          </View>

          {/* Specific Goals (multi) */}
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-5">
            <SectionTitle
              icon="star"
              label="Saving Goals"
              color="#fbbf24"
              right={(
                <TouchableOpacity onPress={() => setGoalDraft(EMPTY_DRAFT)} className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                  <Text className="text-emerald-400 text-[11px] font-semibold uppercase tracking-wider">+ Add</Text>
                </TouchableOpacity>
              )}
            />
            {initialGoals.length === 0 ? (
              <View className="py-6 items-center">
                <View className="w-14 h-14 bg-stone-800/50 rounded-2xl items-center justify-center mb-3">
                  <FontAwesome name="star-o" size={20} color="#52525b" />
                </View>
                <Text className="text-stone-400 text-sm font-semibold text-center">No goals yet</Text>
                <Text className="text-stone-600 text-[11px] text-center mt-1.5 uppercase tracking-widest">Add a target like New Laptop or Trip</Text>
              </View>
            ) : (
              initialGoals.map(g => {
                const pct = Math.max(0, Math.min(100, (g.current / Math.max(g.target, 1)) * 100));
                const done = g.current >= g.target;
                const deadline = g.deadline ? new Date(g.deadline) : null;
                return (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => setGoalDraft({ id: g.id, name: g.name, target: g.target.toString(), current: g.current.toString(), deadline: g.deadline || '' })}
                    className="bg-black/40 border border-stone-800 rounded-2xl p-4 mb-2 active:bg-stone-800/40"
                  >
                    <View className="flex-row justify-between items-center mb-2">
                      <View className="flex-row items-center flex-1">
                        <Text className="text-white text-sm font-semibold" numberOfLines={1}>{g.name}</Text>
                        {done && <Text className="text-emerald-400 text-xs ml-2">✓</Text>}
                      </View>
                      <Text className="text-stone-300 text-sm font-bold">{format(g.current)} / {format(g.target)}</Text>
                    </View>
                    <View className="h-2 bg-black rounded-full overflow-hidden mb-2">
                      <View className={`h-full rounded-full ${done ? 'bg-emerald-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                    </View>
                    <View className="flex-row justify-between items-center">
                      <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest">
                        {Math.round(pct)}%{deadline ? ` · By ${deadline.toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}
                      </Text>
                      <View className="flex-row">
                        <TouchableOpacity onPress={() => handleContribute(g.id, -100)} className="w-7 h-7 rounded-full bg-stone-800 items-center justify-center mr-2">
                          <FontAwesome name="minus" size={9} color="#a8a29e" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleContribute(g.id, 100)} className="w-7 h-7 rounded-full bg-emerald-500/20 items-center justify-center">
                          <FontAwesome name="plus" size={9} color="#34d399" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            {initialGoals.length > 0 && (
              <Text className="text-stone-600 text-[10px] text-center mt-2 uppercase tracking-widest">Tap a goal to edit · +/− adds {symbol}100</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Goal Editor Modal */}
      <Modal visible={!!goalDraft} animationType="slide" transparent={true} onRequestClose={() => setGoalDraft(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' }}
        >
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" className="bg-stone-900 rounded-t-3xl border-t border-stone-800" contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            <View className="w-12 h-1.5 bg-stone-700 self-center rounded-full mb-6" />
            <Text className="text-xl font-bold text-white tracking-tight mb-1">{goalDraft?.id ? 'Edit Goal' : 'New Goal'}</Text>
            <Text className="text-stone-400 text-sm mb-5">Track progress toward a specific target</Text>

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Name</Text>
            <TextInput
              placeholder="e.g. New Laptop"
              placeholderTextColor="#78716c"
              value={goalDraft?.name || ''}
              onChangeText={v => setGoalDraft(d => d && { ...d, name: v })}
              className="bg-black text-white text-sm px-4 py-3.5 rounded-2xl border border-stone-800 mb-3"
            />

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Target Amount</Text>
            <View className="flex-row items-center bg-black rounded-2xl px-4 py-3 border border-stone-800 mb-3">
              <Text className="text-stone-500 text-lg font-semibold mr-3">{symbol}</Text>
              <TextInput
                placeholder="0"
                placeholderTextColor="#78716c"
                keyboardType="numeric"
                value={goalDraft?.target || ''}
                onChangeText={v => setGoalDraft(d => d && { ...d, target: v })}
                className="flex-1 text-white text-lg font-bold"
              />
            </View>

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Current Saved</Text>
            <View className="flex-row items-center bg-black rounded-2xl px-4 py-3 border border-stone-800 mb-3">
              <Text className="text-stone-500 text-lg font-semibold mr-3">{symbol}</Text>
              <TextInput
                placeholder="0"
                placeholderTextColor="#78716c"
                keyboardType="numeric"
                value={goalDraft?.current || ''}
                onChangeText={v => setGoalDraft(d => d && { ...d, current: v })}
                className="flex-1 text-white text-lg font-bold"
              />
            </View>

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Deadline (optional, YYYY-MM-DD)</Text>
            <TextInput
              placeholder="2026-12-31"
              placeholderTextColor="#78716c"
              value={goalDraft?.deadline || ''}
              onChangeText={v => setGoalDraft(d => d && { ...d, deadline: v })}
              className="bg-black text-white text-sm px-4 py-3.5 rounded-2xl border border-stone-800 mb-5"
            />

            <View className="flex-row gap-3">
              {goalDraft?.id && (
                <TouchableOpacity onPress={handleDeleteGoal} className="py-4 px-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 items-center">
                  <FontAwesome name="trash" size={14} color="#f43f5e" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setGoalDraft(null)} className="flex-1 py-4 rounded-2xl bg-stone-800 items-center">
                <Text className="text-white text-sm font-semibold uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveGoalDraft} disabled={savingGoal} className="flex-1 py-4 rounded-2xl bg-emerald-600 items-center">
                {savingGoal ? <ActivityIndicator color="white" /> : <Text className="text-white text-sm font-bold uppercase tracking-wider">{goalDraft?.id ? 'Update' : 'Add'}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
