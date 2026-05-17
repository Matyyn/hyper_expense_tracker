import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions, ActivityIndicator, RefreshControl, Modal, KeyboardAvoidingView, Platform, TouchableOpacity, TextInput, Pressable } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useExpenseSync, INCOME_CATEGORY } from '../../hooks/useExpenseSync';
import { useAuth } from '../../components/AuthProvider';
import { useCurrency } from '../../components/CurrencyProvider';
import { useNotification } from '../../components/NotificationProvider';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

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

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { format, symbol } = useCurrency();
  const { showNotification } = useNotification();
  const [refreshing, setRefreshing] = useState(false);
  const { expenses, weeklyExpenses, isLoading, metrics, categoryMap, categories, categorySpend } = useExpenseSync(user?.id);
  const { totalSpentMonthly, monthlyBudget } = metrics;

  const initialBudgets: Record<string, number> = (user?.user_metadata?.category_budgets as Record<string, number>) || {};
  const [showBudgetsModal, setShowBudgetsModal] = useState(false);
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  const [savingBudgets, setSavingBudgets] = useState(false);
  const [weekChartView, setWeekChartView] = useState<'weekly' | 'monthly'>('monthly');

  useEffect(() => {
    const map: Record<string, string> = {};
    Object.entries(initialBudgets).forEach(([k, v]) => { map[k] = String(v); });
    setBudgetDrafts(map);
  }, [showBudgetsModal]);

  const handleSaveBudgets = async () => {
    setSavingBudgets(true);
    try {
      const cleaned: Record<string, number> = {};
      Object.entries(budgetDrafts).forEach(([cat, val]) => {
        const n = Number(val);
        if (!isNaN(n) && n > 0) cleaned[cat] = n;
      });
      const { error } = await supabase.auth.updateUser({ data: { category_budgets: cleaned } });
      if (error) throw error;
      await supabase.auth.refreshSession();
      showNotification('Category budgets saved', 'success');
      setShowBudgetsModal(false);
    } catch (e: any) {
      showNotification(e.message || 'Could not save budgets', 'error');
    } finally {
      setSavingBudgets(false);
    }
  };

  const categoryTotals = expenses.reduce((acc, exp) => {
    const amount = Number(exp.amount) || 0;
    if (amount > 0) {
      const cat = exp.category || 'Uncategorized';
      acc[cat] = (acc[cat] || 0) + amount;
    }
    return acc;
  }, {} as Record<string, number>);

  const total = Object.values(categoryTotals).reduce((a, b) => a + b, 0) || 1;

  const categoriesList = Object.keys(categoryTotals).map(cat => ({
    name: cat,
    icon: categoryMap[cat]?.icon || '💸',
    color: categoryMap[cat]?.color || '#818cf8',
    amount: categoryTotals[cat],
    percentage: (categoryTotals[cat] / total) * 100,
    limit: initialBudgets[cat],
  })).sort((a, b) => b.amount - a.amount);

  const todayMidnight = new Date().setHours(0, 0, 0, 0);
  const firstSpend = expenses
    .filter(e => e.created_at)
    .map(e => new Date(e.created_at!).setHours(0, 0, 0, 0))
    .reduce((min, d) => d < min ? d : min, Infinity);
  const daysSinceFirst = firstSpend < Infinity
    ? Math.floor((todayMidnight - firstSpend) / 86400000) + 1
    : 0;
  const dailyAvg = daysSinceFirst > 0 ? totalSpentMonthly / daysSinceFirst : 0;

  const today = new Date();
  const currentWeekOfMonth = Math.ceil(today.getDate() / 7);

  const weeklyMonthData = [0, 0, 0, 0];
  expenses.forEach(exp => {
    if (exp.created_at) {
      const d = new Date(exp.created_at);
      if (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()) {
        const week = Math.min(Math.ceil(d.getDate() / 7), 4) - 1;
        weeklyMonthData[week] += Number(exp.amount);
      }
    }
  });
  const maxWeekAmount = Math.max(...weeklyMonthData, 1);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekDayData = new Array(7).fill(0);
  weeklyExpenses.forEach(exp => {
    if (exp.created_at) weekDayData[new Date(exp.created_at).getDay()] += Number(exp.amount);
  });
  const maxDay = Math.max(...weekDayData, 1);

  const budgetUsedPct = Math.min(100, (totalSpentMonthly / Math.max(monthlyBudget, 1)) * 100);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['expenses', user?.id] });
    setRefreshing(false);
    showNotification('Synced', 'success');
  };

  const spendCategories = categories.filter(c => c.name !== INCOME_CATEGORY);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView
        className="px-6"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />}
      >
        <View className="mb-6 mt-1">
          <Text className="text-3xl font-bold text-white tracking-tight">Analytics</Text>
          <Text className="text-rose-400 mt-1 text-[11px] font-semibold tracking-widest uppercase">Spending Insights</Text>
        </View>

        <View className="flex-row mb-5 -mx-1">
          <View className="flex-1 mx-1 bg-stone-900 border border-stone-800 rounded-3xl p-4">
            <View className="flex-row items-center mb-2">
              <View className="w-6 h-6 rounded-md bg-rose-500/10 items-center justify-center mr-2">
                <FontAwesome name="dollar" size={10} color="#f43f5e" />
              </View>
              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest">Total</Text>
            </View>
            <Text className="text-rose-400 text-lg font-bold tracking-tight">{format(totalSpentMonthly)}</Text>
          </View>
          <View className="flex-1 mx-1 bg-stone-900 border border-stone-800 rounded-3xl p-4">
            <View className="flex-row items-center mb-2">
              <View className="w-6 h-6 rounded-md bg-amber-500/10 items-center justify-center mr-2">
                <FontAwesome name="calendar-o" size={10} color="#fbbf24" />
              </View>
              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest">Daily Avg</Text>
            </View>
            <Text className="text-amber-400 text-lg font-bold tracking-tight">{format(dailyAvg)}</Text>
          </View>
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-5">
          <SectionTitle
            icon="pie-chart"
            label="Category Breakdown"
            color="#f43f5e"
            right={(
              <TouchableOpacity onPress={() => setShowBudgetsModal(true)} className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                <Text className="text-emerald-400 text-[11px] font-semibold uppercase tracking-wider">Set Limits</Text>
              </TouchableOpacity>
            )}
          />
          {isLoading ? (
            <View className="mt-4 items-center">
              <ActivityIndicator size="large" color="#f43f5e" />
            </View>
          ) : categoriesList.length === 0 ? (
            <View className="py-8 items-center">
              <View className="w-14 h-14 bg-stone-800/50 rounded-2xl items-center justify-center mb-3">
                <FontAwesome name="bar-chart" size={20} color="#52525b" />
              </View>
              <Text className="text-stone-400 text-sm font-semibold text-center">No data yet</Text>
              <Text className="text-stone-600 text-[11px] text-center mt-1.5 uppercase tracking-widest">Log expenses to see charts</Text>
            </View>
          ) : (
            categoriesList.map((cat, idx) => {
              const pctOfLimit = cat.limit ? Math.min(100, (cat.amount / cat.limit) * 100) : null;
              const overLimit = cat.limit && cat.amount > cat.limit;
              return (
                <View key={idx} className={idx === categoriesList.length - 1 ? '' : 'mb-4'}>
                  <View className="flex-row justify-between items-center mb-2">
                    <View className="flex-row items-center">
                      <Text className="text-base mr-2">{cat.icon}</Text>
                      <Text className="text-stone-300 text-sm font-semibold">{cat.name}</Text>
                      {overLimit && (
                        <View className="ml-2 bg-rose-500/15 px-1.5 py-0.5 rounded-full">
                          <Text className="text-rose-400 text-[9px] font-bold uppercase">Over</Text>
                        </View>
                      )}
                    </View>
                    <Text className={`text-sm font-bold ${overLimit ? 'text-rose-400' : 'text-stone-200'}`}>{format(cat.amount)}</Text>
                  </View>
                  <View className="flex-row items-center">
                    <View className="flex-1 h-1.5 bg-black rounded-full overflow-hidden mr-3">
                      <View className="h-full rounded-full" style={{ width: `${pctOfLimit ?? cat.percentage}%`, backgroundColor: overLimit ? '#f43f5e' : cat.color }} />
                    </View>
                    {cat.limit ? (
                      <Text className="text-stone-500 text-[10px] font-semibold w-20 text-right">{Math.round(pctOfLimit!)}% of {Math.round(cat.limit / 1000) >= 1 ? `${(cat.limit / 1000).toFixed(0)}k` : cat.limit}</Text>
                    ) : (
                      <Text className="text-stone-500 text-xs font-semibold w-10 text-right">{Math.round(cat.percentage)}%</Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-5">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <View className="w-7 h-7 rounded-lg bg-black border border-stone-800 items-center justify-center mr-3">
                <FontAwesome name="line-chart" size={12} color="#f43f5e" />
              </View>
              <Text className="text-white text-base font-bold tracking-tight">
                {weekChartView === 'weekly' ? "This Week" : "Monthly Weeks"}
              </Text>
            </View>
            <View className="flex-row bg-black rounded-full p-1 border border-stone-800">
              {(['weekly', 'monthly'] as const).map(v => (
                <TouchableOpacity
                  key={v}
                  onPress={() => setWeekChartView(v)}
                  className={`px-3 py-1.5 rounded-full ${weekChartView === v ? 'bg-rose-500' : ''}`}
                >
                  <Text className={`text-[11px] font-semibold uppercase tracking-wider ${weekChartView === v ? 'text-white' : 'text-stone-500'}`}>
                    {v === 'weekly' ? 'Week' : 'Month'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {weekChartView === 'weekly' ? (
            <View style={{ height: 180 }} className="mt-2">
              <View className="flex-row justify-between items-end" style={{ height: 148 }}>
                {weekDayData.map((amount, idx) => {
                  const barH = Math.max((amount / maxDay) * 100, amount > 0 ? 4 : 0);
                  const isCurrent = idx === today.getDay();
                  return (
                    <View key={idx} className="items-center flex-1" style={{ height: '100%' }}>
                      <Text className="text-stone-500 text-[10px] font-semibold mb-1.5" style={{ minHeight: 14 }} numberOfLines={1}>
                        {amount > 0 ? (Math.round(amount / 1000) >= 1 ? `${(amount / 1000).toFixed(0)}k` : Math.round(amount)) : ''}
                      </Text>
                      <View className="flex-1 w-7 bg-stone-800/60 rounded-t-xl overflow-hidden justify-end">
                        <View className={`w-full rounded-t-xl ${isCurrent ? 'bg-rose-500' : 'bg-emerald-600/70'}`} style={{ height: `${barH}%` }} />
                      </View>
                    </View>
                  );
                })}
              </View>
              <View className="flex-row justify-between mt-3">
                {days.map((d, idx) => (
                  <Text key={idx} className={`flex-1 text-center text-[11px] font-semibold ${idx === today.getDay() ? 'text-rose-400' : 'text-stone-500'}`}>{d}</Text>
                ))}
              </View>
            </View>
          ) : (
            <View style={{ height: 180 }} className="mt-2">
              <View className="flex-row justify-between items-end" style={{ height: 148 }}>
                {weeklyMonthData.map((amount, idx) => {
                  const weekNum = idx + 1;
                  const isCurrent = weekNum === currentWeekOfMonth;
                  const isFuture = weekNum > currentWeekOfMonth;
                  const barH = isFuture ? 0 : Math.max((amount / maxWeekAmount) * 100, amount > 0 ? 4 : 0);
                  return (
                    <View key={idx} className="items-center flex-1 mx-1" style={{ height: '100%' }}>
                      <Text className="text-stone-500 text-[10px] font-semibold mb-1.5" style={{ minHeight: 14 }} numberOfLines={1}>
                        {!isFuture && amount > 0 ? (Math.round(amount / 1000) >= 1 ? `${(amount / 1000).toFixed(0)}k` : Math.round(amount)) : ''}
                      </Text>
                      <View className={`flex-1 w-full rounded-t-2xl overflow-hidden justify-end ${isFuture ? 'bg-stone-800/20 border border-stone-800' : 'bg-stone-800/50'}`}>
                        {isFuture ? (
                          <View className="flex-1 items-center justify-center">
                            <FontAwesome name="lock" size={14} color="#292524" />
                          </View>
                        ) : (
                          <View className={`w-full rounded-t-2xl ${isCurrent ? 'bg-rose-500' : 'bg-emerald-600/70'}`} style={{ height: `${barH}%` }} />
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
              <View className="flex-row justify-between mt-3">
                {weeklyMonthData.map((_, idx) => {
                  const weekNum = idx + 1;
                  const isCurrent = weekNum === currentWeekOfMonth;
                  const isFuture = weekNum > currentWeekOfMonth;
                  return (
                    <Text key={idx} className={`flex-1 text-center text-[11px] font-semibold mx-1 ${isCurrent ? 'text-rose-400' : isFuture ? 'text-stone-700' : 'text-stone-500'}`}>
                      Week {weekNum}
                    </Text>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-5">
          <SectionTitle icon="tachometer" label="Budget Utilization" color="#f43f5e" />
          <View className="flex-row justify-between items-baseline mb-3">
            <Text className="text-4xl font-bold text-white tracking-tight">{Math.round(budgetUsedPct)}%</Text>
            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest">Used</Text>
          </View>
          <View className="h-2.5 bg-black rounded-full overflow-hidden mb-3">
            <View className={`h-full rounded-full ${budgetUsedPct >= 90 ? 'bg-rose-500' : budgetUsedPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${budgetUsedPct}%` }} />
          </View>
          <View className="flex-row justify-between">
            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest">Spent {format(totalSpentMonthly)}</Text>
            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest">of {format(monthlyBudget)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Category Budgets Modal */}
      <Modal visible={showBudgetsModal} animationType="slide" transparent={true} onRequestClose={() => setShowBudgetsModal(false)}>
        <Pressable onPress={() => setShowBudgetsModal(false)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <Pressable onPress={() => {}} className="bg-stone-900 rounded-t-3xl border-t border-stone-800" style={{ maxHeight: '75%' }}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            <TouchableOpacity onPress={() => setShowBudgetsModal(false)} activeOpacity={0.6} className="self-center mb-6 py-2 px-8">
              <View className="w-12 h-1.5 bg-stone-700 rounded-full" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-white tracking-tight mb-1">Category Budgets</Text>
            <Text className="text-stone-400 text-sm mb-5">Set monthly limits per category. We'll alert you at 80% and 100%.</Text>

            {spendCategories.map(cat => (
              <View key={cat.id} className="bg-black/40 rounded-2xl border border-stone-800 px-4 py-3 mb-2 flex-row items-center">
                <Text className="text-xl mr-2">{cat.icon}</Text>
                <Text className="text-stone-300 text-sm font-semibold flex-1">{cat.name}</Text>
                <View className="flex-row items-center bg-stone-900 rounded-xl px-3 py-2 border border-stone-800" style={{ minWidth: 140 }}>
                  <Text className="text-stone-500 text-xs font-semibold mr-2">{symbol}</Text>
                  <TextInput
                    value={budgetDrafts[cat.name] || ''}
                    onChangeText={v => setBudgetDrafts(prev => ({ ...prev, [cat.name]: v }))}
                    placeholder="No limit"
                    placeholderTextColor="#52525b"
                    keyboardType="numeric"
                    className="text-white text-sm font-bold flex-1"
                  />
                </View>
              </View>
            ))}

            <View className="flex-row gap-3 mt-4">
              <TouchableOpacity onPress={() => setShowBudgetsModal(false)} className="flex-1 py-4 rounded-2xl bg-stone-800 items-center">
                <Text className="text-white text-sm font-semibold uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveBudgets} disabled={savingBudgets} className="flex-1 py-4 rounded-2xl bg-emerald-600 items-center">
                {savingBudgets ? <ActivityIndicator color="white" /> : <Text className="text-white text-sm font-bold uppercase tracking-wider">Save</Text>}
              </TouchableOpacity>
            </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
