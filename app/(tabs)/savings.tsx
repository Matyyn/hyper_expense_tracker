import React from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useExpenseSync } from '../../hooks/useExpenseSync';

const formatPKR = (amount: number) => `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;

export default function SavingsScreen() {
  const { metrics } = useExpenseSync('test-pk-user-777');
  const { height } = useWindowDimensions();
  const { savingsThisMonth, savingsGoal, totalSavings } = metrics;

  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView className="px-6" contentContainerStyle={{ minHeight: height * 0.8 }}>
        <View className="mb-8 mt-2">
          <Text className="text-4xl font-black text-white tracking-tighter">Savings Vault</Text>
          <Text className="text-emerald-400 font-bold mt-1 text-xs tracking-widest uppercase">Wealth Builder</Text>
        </View>

        <View className="bg-emerald-950/30 border border-emerald-500/20 rounded-[32px] p-6 mb-8 items-center justify-center py-12" style={{ minHeight: height * 0.25 }}>
          <Text className="text-emerald-500/70 text-xs font-bold uppercase tracking-widest mb-2">Total Accumulated</Text>
          <Text className="text-5xl font-black text-emerald-400 tracking-tighter">{formatPKR(totalSavings)}</Text>
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-8 shadow-lg">
          <Text className="text-white text-lg font-black mb-4 tracking-tight">Current Month Goal</Text>
          <View className="flex-row justify-between items-center mb-4">
             <Text className="text-stone-400 font-bold">Projected End</Text>
             <Text className="text-emerald-400 font-black">{formatPKR(savingsThisMonth)}</Text>
          </View>
          <View className="h-3 bg-black/40 rounded-full overflow-hidden mb-2 border border-stone-800">
             <View className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.max(5, Math.min(100, (savingsThisMonth / (savingsGoal || 1)) * 100))}%` }} />
          </View>
          <Text className="text-stone-500 text-[10px] uppercase text-right tracking-widest">of {formatPKR(savingsGoal)} Target</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
