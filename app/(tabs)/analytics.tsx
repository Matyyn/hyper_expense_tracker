import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions, ActivityIndicator, RefreshControl, Modal, KeyboardAvoidingView, Platform, TouchableOpacity, TextInput, Pressable } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useExpenseSync, INCOME_CATEGORY, LOAN_RETURN_CATEGORY } from '../../hooks/useExpenseSync';
import { useAuth } from '../../components/AuthProvider';
import { useCurrency } from '../../components/CurrencyProvider';
import { useNotification } from '../../components/NotificationProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useUserMetadata, useUpdateMetadata } from '../../hooks/useUserMetadata';
import {
  SPEND_FOR_COLOR,
  SPEND_FOR_ICON,
  SPEND_FOR_LABEL,
  SPEND_FOR_VALUES,
  SpendFor,
  spendForOf,
  sumAmount,
} from '../../lib/spendFor';

type Scope = 'all' | SpendFor;

function SectionTitle({ icon, label, color = '#34d399', right }: { icon: React.ComponentProps<typeof FontAwesome>['name']; label: string; color?: string; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between mb-4">
      <View className="flex-row items-center">
        <View className="w-7 h-7 rounded-lg bg-app border border-line items-center justify-center mr-3">
          <FontAwesome name={icon} size={12} color={color} />
        </View>
        <Text className="text-ink text-base font-bold tracking-tight">{label}</Text>
      </View>
      {right}
    </View>
  );
}

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const metadata = useUserMetadata();
  const { updateMetadata } = useUpdateMetadata();
  const { format, symbol } = useCurrency();
  const { showNotification } = useNotification();
  const [refreshing, setRefreshing] = useState(false);
  const { expenses, allExpenses, displayExpenses, weeklyExpenses, isLoading, metrics, categoryMap, categories, categorySpend } = useExpenseSync(
    user?.id,
    (user?.user_metadata?.monthly_budget as number) || 0,
    (user?.user_metadata?.savings_goal as number) || 0,
  );
  const { monthlyBudget } = metrics;

  // Every section below reads the scoped lists, so the whole screen re-slices
  // to Self or Family from one control. The Self vs Family card is the one
  // exception — it always compares the full month.
  const [scope, setScope] = useState<Scope>('all');
  const inScope = (e: any) => scope === 'all' || spendForOf(e) === scope;
  const scopedDisplay = useMemo(() => displayExpenses.filter(inScope), [displayExpenses, scope]);
  const scopedAll = useMemo(() => allExpenses.filter(inScope), [allExpenses, scope]);
  const scopedWeekly = useMemo(() => weeklyExpenses.filter(inScope), [weeklyExpenses, scope]);
  const scopedTotal = useMemo(() => sumAmount(scopedDisplay), [scopedDisplay]);
  const scopeLabel = scope === 'all' ? 'All' : SPEND_FOR_LABEL[scope];
  const scopeTint = scope === 'all' ? '#f43f5e' : SPEND_FOR_COLOR[scope];

  const initialBudgets: Record<string, number> = (metadata?.category_budgets as Record<string, number>) || {};
  const [showBudgetsModal, setShowBudgetsModal] = useState(false);
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  const [savingBudgets, setSavingBudgets] = useState(false);
  const [weekChartView, setWeekChartView] = useState<'weekly' | 'monthly'>('monthly');

  useEffect(() => {
    const map: Record<string, string> = {};
    Object.entries(initialBudgets).forEach(([k, v]) => { map[k] = String(v); });
    setBudgetDrafts(map);
  }, [showBudgetsModal]);

  const handleSaveBudgets = () => {
    const cleaned: Record<string, number> = {};
    Object.entries(budgetDrafts).forEach(([cat, val]) => {
      const n = Number(val);
      if (!isNaN(n) && n > 0) cleaned[cat] = n;
    });
    // Queued metadata write — applies offline and resyncs on reconnect.
    updateMetadata({ category_budgets: cleaned });
    showNotification('Category budgets saved', 'success');
    setShowBudgetsModal(false);
  };

  const categoryTotals = scopedDisplay.reduce((acc, exp) => {
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

  const sourceTotals = scopedAll.reduce((acc, exp) => {
    const amount = Number(exp.amount) || 0;
    const src = (exp as any).source;
    if (!src || amount <= 0) return acc;
    if (exp.category === INCOME_CATEGORY || exp.category === LOAN_RETURN_CATEGORY) {
      acc[src] = (acc[src] || 0) - amount;
    } else {
      acc[src] = (acc[src] || 0) + amount;
    }
    return acc;
  }, {} as Record<string, number>);
  const positiveSourceTotals = Object.fromEntries(Object.entries(sourceTotals).filter(([, v]) => v > 0));
  const sourceGrandTotal = Object.values(positiveSourceTotals).reduce((a, b) => a + b, 0) || 1;
  const sourceList = Object.entries(positiveSourceTotals)
    .map(([name, amount]) => ({ name, amount, percentage: (amount / sourceGrandTotal) * 100 }))
    .sort((a, b) => b.amount - a.amount);

  const SOURCE_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f43f5e', '#a78bfa', '#38bdf8'];

  const todayMidnight = new Date().setHours(0, 0, 0, 0);
  // Average over the days actually elapsed since the first logged spend, so an
  // account opened mid-month isn't penalised for the days before it existed.
  const dailyAvgOf = (rows: typeof displayExpenses) => {
    const firstSpend = rows
      .filter(e => e.created_at)
      .map(e => new Date(e.created_at!).setHours(0, 0, 0, 0))
      .reduce((min, d) => d < min ? d : min, Infinity);
    const days = firstSpend < Infinity
      ? Math.floor((todayMidnight - firstSpend) / 86400000) + 1
      : 0;
    return days > 0 ? sumAmount(rows) / days : 0;
  };
  const dailyAvg = dailyAvgOf(scopedDisplay);

  const today = new Date();
  const currentWeekOfMonth = Math.ceil(today.getDate() / 7);

  const weeklyMonthData = [0, 0, 0, 0];
  scopedDisplay.forEach(exp => {
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
  scopedWeekly.forEach(exp => {
    if (exp.created_at) weekDayData[new Date(exp.created_at).getDay()] += Number(exp.amount);
  });
  const maxDay = Math.max(...weekDayData, 1);

  const budgetUsedPct = Math.min(100, (scopedTotal / Math.max(monthlyBudget, 1)) * 100);

  // ---- Self vs Family comparison (always whole-month, ignores `scope`) ----
  const spendForStats = useMemo(() => {
    const rowsOf = (s: SpendFor) => displayExpenses.filter(e => spendForOf(e) === s);
    const stats = SPEND_FOR_VALUES.map(s => {
      const rows = rowsOf(s);
      return {
        key: s,
        label: SPEND_FOR_LABEL[s],
        icon: SPEND_FOR_ICON[s],
        color: SPEND_FOR_COLOR[s],
        amount: sumAmount(rows),
        count: rows.length,
        dailyAvg: dailyAvgOf(rows),
        topCategory: Object.entries(
          rows.reduce((acc, e) => {
            const cat = e.category || 'Uncategorized';
            acc[cat] = (acc[cat] || 0) + (Number(e.amount) || 0);
            return acc;
          }, {} as Record<string, number>)
        ).sort((a, b) => b[1] - a[1])[0]?.[0],
      };
    });
    const combined = stats.reduce((sum, s) => sum + s.amount, 0);
    return stats.map(s => ({ ...s, share: combined > 0 ? (s.amount / combined) * 100 : 0, combined }));
  }, [displayExpenses]);

  const totalBothScopes = spendForStats[0]?.combined || 0;

  // Per-category self/family split — where the two scopes actually diverge.
  const categorySplit = useMemo(() => {
    const map: Record<string, { self: number; family: number }> = {};
    displayExpenses.forEach(e => {
      const amount = Number(e.amount) || 0;
      if (amount <= 0) return;
      const cat = e.category || 'Uncategorized';
      if (!map[cat]) map[cat] = { self: 0, family: 0 };
      map[cat][spendForOf(e)] += amount;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v, total: v.self + v.family }))
      .sort((a, b) => b.total - a.total);
  }, [displayExpenses]);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['expenses', user?.id] });
    setRefreshing(false);
    showNotification('Synced', 'success');
  };

  const spendCategories = categories.filter(c => c.name !== INCOME_CATEGORY);

  return (
    <SafeAreaView className="flex-1 bg-app">
      <ScrollView
        className="px-6"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />}
      >
        <View className="mb-4 mt-1">
          <Text className="text-3xl font-bold text-ink tracking-tight">Analytics</Text>
          <Text className="text-rose-400 mt-1 text-[11px] font-semibold tracking-widest uppercase">Spending Insights</Text>
        </View>

        {/* Scope switch — re-slices every section below to Self or Family */}
        <View className="flex-row bg-surface rounded-full p-1 border border-line mb-4">
          {(['all', ...SPEND_FOR_VALUES] as Scope[]).map(s => {
            const selected = scope === s;
            const tint = s === 'all' ? '#f43f5e' : SPEND_FOR_COLOR[s];
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setScope(s)}
                style={selected ? { backgroundColor: tint } : undefined}
                className="flex-1 flex-row items-center justify-center py-2.5 rounded-full"
              >
                {s !== 'all' && <Text className="text-xs mr-1.5">{SPEND_FOR_ICON[s]}</Text>}
                <Text className={`text-[11px] font-semibold uppercase tracking-wider ${selected ? 'text-black' : 'text-muted'}`}>
                  {s === 'all' ? 'Everything' : SPEND_FOR_LABEL[s]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="flex-row mb-5 -mx-1">
          <View className="flex-1 mx-1 bg-surface border border-line rounded-3xl p-4">
            <View className="flex-row items-center mb-2">
              <View className="w-6 h-6 rounded-md items-center justify-center mr-2" style={{ backgroundColor: `${scopeTint}1a` }}>
                <FontAwesome name="dollar" size={10} color={scopeTint} />
              </View>
              <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest">
                {scope === 'all' ? 'Total' : `${scopeLabel} Total`}
              </Text>
            </View>
            <Text className="text-lg font-bold tracking-tight" style={{ color: scopeTint }}>{format(scopedTotal)}</Text>
            {scope !== 'all' && totalBothScopes > 0 && (
              <Text className="text-faint text-[10px] font-semibold uppercase tracking-widest mt-1">
                {Math.round((scopedTotal / totalBothScopes) * 100)}% of {format(totalBothScopes)}
              </Text>
            )}
          </View>
          <View className="flex-1 mx-1 bg-surface border border-line rounded-3xl p-4">
            <View className="flex-row items-center mb-2">
              <View className="w-6 h-6 rounded-md bg-amber-500/10 items-center justify-center mr-2">
                <FontAwesome name="calendar-o" size={10} color="#fbbf24" />
              </View>
              <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest">Daily Avg</Text>
            </View>
            <Text className="text-amber-400 text-lg font-bold tracking-tight">{format(dailyAvg)}</Text>
          </View>
        </View>

        {/* Self vs Family — always the whole month, regardless of the scope switch */}
        <View className="bg-surface border border-line rounded-3xl p-5 mb-5">
          <SectionTitle icon="users" label="Self vs Family" color={SPEND_FOR_COLOR.family} />
          {totalBothScopes === 0 ? (
            <View className="py-6 items-center">
              <Text className="text-muted text-sm font-semibold text-center">Nothing logged yet</Text>
              <Text className="text-faint text-[11px] text-center mt-1.5 uppercase tracking-widest">
                Tag expenses as Self or Family to compare
              </Text>
            </View>
          ) : (
            <>
              {/* Share bar */}
              <View className="flex-row h-3 rounded-full overflow-hidden mb-4 bg-app">
                {spendForStats.map(s => (
                  s.share > 0 ? (
                    <View key={s.key} style={{ width: `${s.share}%`, backgroundColor: s.color }} />
                  ) : null
                ))}
              </View>

              <View className="flex-row -mx-1 mb-1">
                {spendForStats.map(s => (
                  <View key={s.key} className="flex-1 mx-1 bg-app border border-line rounded-2xl p-3.5">
                    <View className="flex-row items-center mb-2">
                      <Text className="text-sm mr-1.5">{s.icon}</Text>
                      <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest">{s.label}</Text>
                    </View>
                    <Text className="text-lg font-bold tracking-tight" style={{ color: s.color }}>
                      {format(s.amount)}
                    </Text>
                    <Text className="text-faint text-[10px] font-semibold uppercase tracking-widest mt-1">
                      {Math.round(s.share)}% · {s.count} {s.count === 1 ? 'entry' : 'entries'}
                    </Text>
                    <View className="h-px bg-line my-2.5" />
                    <Text className="text-muted text-[10px] font-semibold uppercase tracking-widest">Daily avg</Text>
                    <Text className="text-ink text-sm font-bold tracking-tight mt-0.5">{format(s.dailyAvg)}</Text>
                    <Text className="text-muted text-[10px] font-semibold uppercase tracking-widest mt-2">Top category</Text>
                    <Text className="text-ink text-xs font-semibold mt-0.5" numberOfLines={1}>
                      {s.topCategory ? `${categoryMap[s.topCategory]?.icon || '💸'} ${s.topCategory}` : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Where the two scopes diverge, category by category */}
        {categorySplit.length > 0 && (
          <View className="bg-surface border border-line rounded-3xl p-5 mb-5">
            <SectionTitle icon="columns" label="Category Split" color={SPEND_FOR_COLOR.self} />
            <View className="flex-row items-center mb-4">
              {SPEND_FOR_VALUES.map(s => (
                <View key={s} className="flex-row items-center mr-4">
                  <View className="w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: SPEND_FOR_COLOR[s] }} />
                  <Text className="text-muted text-[10px] font-semibold uppercase tracking-widest">
                    {SPEND_FOR_LABEL[s]}
                  </Text>
                </View>
              ))}
            </View>
            {categorySplit.map((cat, idx) => (
              <View key={cat.name} className={idx === categorySplit.length - 1 ? '' : 'mb-4'}>
                <View className="flex-row justify-between items-center mb-2">
                  <View className="flex-row items-center flex-1">
                    <Text className="text-base mr-2">{categoryMap[cat.name]?.icon || '💸'}</Text>
                    <Text className="text-ink text-sm font-semibold" numberOfLines={1}>{cat.name}</Text>
                  </View>
                  <Text className="text-ink text-sm font-bold ml-2">{format(cat.total)}</Text>
                </View>
                <View className="flex-row h-1.5 rounded-full overflow-hidden bg-app mb-1.5">
                  {cat.self > 0 && (
                    <View style={{ width: `${(cat.self / cat.total) * 100}%`, backgroundColor: SPEND_FOR_COLOR.self }} />
                  )}
                  {cat.family > 0 && (
                    <View style={{ width: `${(cat.family / cat.total) * 100}%`, backgroundColor: SPEND_FOR_COLOR.family }} />
                  )}
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-[10px] font-semibold" style={{ color: SPEND_FOR_COLOR.self }}>
                    {format(cat.self)}
                  </Text>
                  <Text className="text-[10px] font-semibold" style={{ color: SPEND_FOR_COLOR.family }}>
                    {format(cat.family)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View className="bg-surface border border-line rounded-3xl p-5 mb-5">
          <SectionTitle
            icon="pie-chart"
            label={scope === 'all' ? 'Category Breakdown' : `${scopeLabel} Categories`}
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
              <Text className="text-muted text-sm font-semibold text-center">No data yet</Text>
              <Text className="text-faint text-[11px] text-center mt-1.5 uppercase tracking-widest">Log expenses to see charts</Text>
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
                      <Text className="text-ink text-sm font-semibold">{cat.name}</Text>
                      {overLimit && (
                        <View className="ml-2 bg-rose-500/15 px-1.5 py-0.5 rounded-full">
                          <Text className="text-rose-400 text-[9px] font-bold uppercase">Over</Text>
                        </View>
                      )}
                    </View>
                    <Text className={`text-sm font-bold ${overLimit ? 'text-rose-400' : 'text-ink'}`}>{format(cat.amount)}</Text>
                  </View>
                  <View className="flex-row items-center">
                    <View className="flex-1 h-1.5 bg-app rounded-full overflow-hidden mr-3">
                      <View className="h-full rounded-full" style={{ width: `${pctOfLimit ?? cat.percentage}%`, backgroundColor: overLimit ? '#f43f5e' : cat.color }} />
                    </View>
                    {cat.limit ? (
                      <Text className="text-muted text-[10px] font-semibold w-20 text-right">{Math.round(pctOfLimit!)}% of {cat.limit >= 100 ? `${(cat.limit / 1000).toFixed(1)}k` : cat.limit}</Text>
                    ) : (
                      <Text className="text-muted text-xs font-semibold w-10 text-right">{Math.round(cat.percentage)}%</Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {sourceList.length > 0 && (
          <View className="bg-surface border border-line rounded-3xl p-5 mb-5">
            <SectionTitle icon="credit-card" label="By Source" color="#818cf8" />
            {sourceList.map((src, idx) => (
              <View key={src.name} className={idx === sourceList.length - 1 ? '' : 'mb-4'}>
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-ink text-sm font-semibold">{src.name}</Text>
                  <Text className="text-ink text-sm font-bold">{format(src.amount)}</Text>
                </View>
                <View className="flex-row items-center">
                  <View className="flex-1 h-1.5 bg-app rounded-full overflow-hidden mr-3">
                    <View
                      className="h-full rounded-full"
                      style={{ width: `${src.percentage}%`, backgroundColor: SOURCE_COLORS[idx % SOURCE_COLORS.length] }}
                    />
                  </View>
                  <Text className="text-muted text-xs font-semibold w-10 text-right">{Math.round(src.percentage)}%</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View className="bg-surface border border-line rounded-3xl p-5 mb-5">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <View className="w-7 h-7 rounded-lg bg-app border border-line items-center justify-center mr-3">
                <FontAwesome name="line-chart" size={12} color="#f43f5e" />
              </View>
              <Text className="text-ink text-base font-bold tracking-tight">
                {weekChartView === 'weekly' ? "This Week" : "Monthly Weeks"}
              </Text>
            </View>
            <View className="flex-row bg-app rounded-full p-1 border border-line">
              {(['weekly', 'monthly'] as const).map(v => (
                <TouchableOpacity
                  key={v}
                  onPress={() => setWeekChartView(v)}
                  className={`px-3 py-1.5 rounded-full ${weekChartView === v ? 'bg-rose-500' : ''}`}
                >
                  <Text className={`text-[11px] font-semibold uppercase tracking-wider ${weekChartView === v ? 'text-white' : 'text-muted'}`}>
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
                      <Text className="text-muted text-[10px] font-semibold mb-1.5" style={{ minHeight: 14 }} numberOfLines={1}>
                        {amount > 0 ? (amount >= 100 ? `${(amount / 1000).toFixed(1)}k` : Math.round(amount)) : ''}
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
                  <Text key={idx} className={`flex-1 text-center text-[11px] font-semibold ${idx === today.getDay() ? 'text-rose-400' : 'text-muted'}`}>{d}</Text>
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
                      <Text className="text-muted text-[10px] font-semibold mb-1.5" style={{ minHeight: 14 }} numberOfLines={1}>
                        {!isFuture && amount > 0 ? (amount >= 100 ? `${(amount / 1000).toFixed(1)}k` : Math.round(amount)) : ''}
                      </Text>
                      <View className={`flex-1 w-full rounded-t-2xl overflow-hidden justify-end ${isFuture ? 'bg-stone-800/20 border border-line' : 'bg-stone-800/50'}`}>
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
                    <Text key={idx} className={`flex-1 text-center text-[11px] font-semibold mx-1 ${isCurrent ? 'text-rose-400' : isFuture ? 'text-faint' : 'text-muted'}`}>
                      Week {weekNum}
                    </Text>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        <View className="bg-surface border border-line rounded-3xl p-5 mb-5">
          <SectionTitle
            icon="tachometer"
            label={scope === 'all' ? 'Budget Utilization' : `Budget Utilization · ${scopeLabel}`}
            color="#f43f5e"
          />
          <View className="flex-row justify-between items-baseline mb-3">
            <Text className="text-4xl font-bold text-ink tracking-tight">{Math.round(budgetUsedPct)}%</Text>
            <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest">Used</Text>
          </View>
          <View className="h-2.5 bg-app rounded-full overflow-hidden mb-3">
            <View className={`h-full rounded-full ${budgetUsedPct >= 90 ? 'bg-rose-500' : budgetUsedPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${budgetUsedPct}%` }} />
          </View>
          <View className="flex-row justify-between">
            <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest">Spent {format(scopedTotal)}</Text>
            <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest">of {format(monthlyBudget)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Category Budgets Modal */}
      <Modal visible={showBudgetsModal} animationType="slide" transparent={true} onRequestClose={() => setShowBudgetsModal(false)}>
        <Pressable onPress={() => setShowBudgetsModal(false)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <Pressable onPress={() => {}} className="bg-surface rounded-t-3xl border-t border-line" style={{ maxHeight: '75%' }}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            <TouchableOpacity onPress={() => setShowBudgetsModal(false)} activeOpacity={0.6} className="self-center mb-6 py-2 px-8">
              <View className="w-12 h-1.5 bg-faint rounded-full" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-ink tracking-tight mb-1">Category Budgets</Text>
            <Text className="text-muted text-sm mb-5">Set monthly limits per category. We'll alert you at 80% and 100%.</Text>

            {spendCategories.map(cat => (
              <View key={cat.id} className="bg-black/40 rounded-2xl border border-line px-4 py-3 mb-2 flex-row items-center">
                <Text className="text-xl mr-2">{cat.icon}</Text>
                <Text className="text-ink text-sm font-semibold flex-1">{cat.name}</Text>
                <View className="flex-row items-center bg-surface rounded-xl px-3 py-2 border border-line" style={{ minWidth: 140 }}>
                  <Text className="text-muted text-xs font-semibold mr-2">{symbol}</Text>
                  <TextInput
                    value={budgetDrafts[cat.name] || ''}
                    onChangeText={v => setBudgetDrafts(prev => ({ ...prev, [cat.name]: v }))}
                    placeholder="No limit"
                    placeholderTextColor="#52525b"
                    keyboardType="numeric"
                    className="text-ink text-sm font-bold flex-1"
                  />
                </View>
              </View>
            ))}

            <View className="flex-row gap-3 mt-4">
              <TouchableOpacity onPress={() => setShowBudgetsModal(false)} className="flex-1 py-4 rounded-2xl bg-elevated items-center">
                <Text className="text-ink text-sm font-semibold uppercase tracking-wider">Cancel</Text>
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
