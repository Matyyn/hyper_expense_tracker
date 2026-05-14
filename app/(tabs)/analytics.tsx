import React, { useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useExpenseSync } from '../../hooks/useExpenseSync';
import { useAuth } from '../../components/AuthProvider';
import { useQueryClient } from '@tanstack/react-query';

const formatPKR = (amount: number) => `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { expenses, weeklyExpenses, isLoading, metrics, categoryMap } = useExpenseSync(user?.id);
  const { height } = useWindowDimensions();
  const { totalSpentMonthly, monthlyBudget } = metrics;

  // Aggregate by category
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
    percentage: (categoryTotals[cat] / total) * 100
  })).sort((a, b) => b.amount - a.amount);

  const dayOfMonth = new Date().getDate();
  const dailyAvg = totalSpentMonthly / dayOfMonth;

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekData = new Array(7).fill(0);
  weeklyExpenses.forEach(exp => {
    if (exp.created_at) { weekData[new Date(exp.created_at).getDay()] += Number(exp.amount); }
  });
  const maxDay = Math.max(...weekData, 1);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['expenses', user?.id] });
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView 
        className="px-6" 
        contentContainerStyle={{ minHeight: height * 0.8, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />}
      >
        <View className="mb-8 mt-2">
          <Text className="text-4xl font-black text-white tracking-tighter">Analytics</Text>
          <Text className="text-rose-400 font-bold mt-1 text-xs tracking-widest uppercase">Spending Insights</Text>
        </View>

        <View className="flex-row mb-8">
          <View className="flex-1 bg-stone-900 border border-stone-800 rounded-[24px] p-4 mr-2 items-center">
            <Text className="text-stone-500 text-[10px] font-bold uppercase tracking-widest mb-1">Total Spent</Text>
            <Text className="text-rose-400 text-xl font-black tracking-tighter">{formatPKR(totalSpentMonthly)}</Text>
          </View>
          <View className="flex-1 bg-stone-900 border border-stone-800 rounded-[24px] p-4 ml-2 items-center">
            <Text className="text-stone-500 text-[10px] font-bold uppercase tracking-widest mb-1">Daily Avg</Text>
            <Text className="text-amber-400 text-xl font-black tracking-tighter">{formatPKR(dailyAvg)}</Text>
          </View>
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-8 shadow-lg" style={{ minHeight: height * 0.25 }}>
          <Text className="text-white text-lg font-black mb-6 tracking-tight">Category Breakdown</Text>
          {isLoading ? (
            <View className="mt-10 items-center">
              <ActivityIndicator size="large" color="#f43f5e" />
              <Text className="text-stone-500 mt-4 font-bold uppercase tracking-widest text-xs">Crunching numbers...</Text>
            </View>
          ) : categoriesList.length === 0 ? (
            <View className="mt-6 items-center">
              <Text className="text-4xl mb-4">📊</Text>
              <Text className="text-stone-500 font-bold text-center">No data available yet.</Text>
              <Text className="text-stone-600 text-[10px] text-center mt-2 uppercase tracking-widest">Log expenses to see charts</Text>
            </View>
          ) : (
            categoriesList.map((cat, idx) => (
              <View key={idx} className="mb-5">
                <View className="flex-row justify-between items-center mb-2">
                  <View className="flex-row items-center">
                    <Text className="text-lg mr-2">{cat.icon}</Text>
                    <Text className="text-stone-300 font-bold text-sm uppercase tracking-wider">{cat.name}</Text>
                  </View>
                  <Text className="text-rose-400 font-black text-sm">{formatPKR(cat.amount)}</Text>
                </View>
                <View className="flex-row items-center">
                  <View className="flex-1 h-2.5 bg-black rounded-full overflow-hidden mr-3">
                    <View className="h-full rounded-full" style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }} />
                  </View>
                  <Text className="text-stone-500 text-xs font-bold w-10 text-right">{Math.round(cat.percentage)}%</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-8 shadow-lg">
          <Text className="text-white text-lg font-black mb-4 tracking-tight">This Week's Trend</Text>
          <View className="flex-row justify-between items-end h-28 mt-4">
            {weekData.map((amount, idx) => {
              const barH = (amount / maxDay) * 100;
              const isCurrent = idx === new Date().getDay();
              return (
                <View key={idx} className="items-center flex-1">
                  {amount > 0 && <Text className="text-stone-500 text-[8px] font-bold mb-1" numberOfLines={1}>{formatPKR(amount).replace('Rs. ', '')}</Text>}
                  <View className="w-6 bg-stone-800 rounded-t-lg items-end justify-end overflow-hidden" style={{ height: '100%' }}>
                    <View className={`w-full rounded-t-lg ${isCurrent ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ height: `${barH}%` }} />
                  </View>
                  <Text className={`text-[10px] font-bold mt-2 ${isCurrent ? 'text-rose-400' : 'text-stone-400'}`}>{days[idx]}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-8 shadow-lg">
          <Text className="text-white text-lg font-black mb-4 tracking-tight">Budget Utilization</Text>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-stone-400 font-bold text-sm">Used</Text>
            <Text className="text-rose-400 font-black text-sm">{Math.round((totalSpentMonthly / monthlyBudget) * 100)}%</Text>
          </View>
          <View className="h-4 bg-black rounded-full overflow-hidden mb-2">
            <View className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(100, (totalSpentMonthly / monthlyBudget) * 100)}%` }} />
          </View>
          <View className="flex-row justify-between mt-2">
            <Text className="text-stone-600 text-[10px] font-bold uppercase tracking-widest">Spent: {formatPKR(totalSpentMonthly)}</Text>
            <Text className="text-stone-600 text-[10px] font-bold uppercase tracking-widest">Budget: {formatPKR(monthlyBudget)}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
