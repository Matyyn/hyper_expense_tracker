import React from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useExpenseSync } from '../../hooks/useExpenseSync';

const formatPKR = (amount: number) => `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;

export default function AnalyticsScreen() {
  const { expenses } = useExpenseSync('test-pk-user-777');
  const { height, width } = useWindowDimensions();

  // Aggregate by category
  const categoryTotals = expenses.reduce((acc, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + Number(exp.amount);
    return acc;
  }, {} as Record<string, number>);

  const total = Object.values(categoryTotals).reduce((a, b) => a + b, 0) || 1;

  const categories = Object.keys(categoryTotals).map(cat => ({
    name: cat,
    amount: categoryTotals[cat],
    percentage: (categoryTotals[cat] / total) * 100
  })).sort((a, b) => b.amount - a.amount);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView className="px-6" contentContainerStyle={{ minHeight: height * 0.8 }}>
        <View className="mb-8 mt-2">
          <Text className="text-4xl font-black text-white tracking-tighter">Analytics</Text>
          <Text className="text-rose-400 font-bold mt-1 text-xs tracking-widest uppercase">Spending Breakdown</Text>
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-8 shadow-lg" style={{ minHeight: height * 0.3 }}>
          <Text className="text-white text-lg font-black mb-6 tracking-tight">Category Distribution</Text>
          
          {categories.length === 0 ? (
            <Text className="text-stone-500 font-bold text-center mt-10">No data available for this month.</Text>
          ) : (
            categories.map((cat, idx) => (
              <View key={idx} className="mb-4">
                <View className="flex-row justify-between mb-2">
                  <Text className="text-stone-300 font-bold text-sm uppercase tracking-wider">{cat.name}</Text>
                  <Text className="text-rose-400 font-black text-sm">{formatPKR(cat.amount)} ({Math.round(cat.percentage)}%)</Text>
                </View>
                <View className="h-2 bg-black rounded-full overflow-hidden">
                  <View 
                    className={`h-full rounded-full ${idx === 0 ? 'bg-rose-500' : idx === 1 ? 'bg-orange-500' : 'bg-amber-500'}`} 
                    style={{ width: `${cat.percentage}%` }} 
                  />
                </View>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
