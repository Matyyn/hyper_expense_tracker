import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, useWindowDimensions, TextInput, TouchableOpacity, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotification } from '../../components/NotificationProvider';
import { useExpenseSync } from '../../hooks/useExpenseSync';
import { useAuth } from '../../components/AuthProvider';
import { useQueryClient } from '@tanstack/react-query';

const formatPKR = (amount: number) => `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;

export default function SavingsScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { metrics, updateProfile } = useExpenseSync(user?.id);
  const { showNotification } = useNotification();
  const { height } = useWindowDimensions();
  const { savingsThisMonth, savingsGoal, totalSavings, monthlyBudget } = metrics;

  const [goalInput, setGoalInput] = useState(savingsGoal.toString());

  useEffect(() => {
    setGoalInput(savingsGoal.toString());
  }, [savingsGoal]);

  const handleSaveGoal = () => {
    const amount = Number(goalInput);
    if (amount >= 0) {
      updateProfile({ savings_goal: amount });
      showNotification(`Savings goal updated to ${formatPKR(amount)}`, 'success');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['expenses', user?.id] });
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 100}
        style={{ flex: 1 }}
      >
      <ScrollView 
        className="px-6" 
        contentContainerStyle={{ minHeight: height * 0.8, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />}
      >
        <View className="mb-8 mt-2">
          <Text className="text-4xl font-black text-white tracking-tighter">Savings Vault</Text>
          <Text className="text-emerald-400 font-bold mt-1 text-xs tracking-widest uppercase">Wealth Builder</Text>
        </View>

        <View className="bg-emerald-950/30 border border-emerald-500/20 rounded-[32px] p-6 mb-8 items-center justify-center py-12" style={{ minHeight: height * 0.25 }}>
          <Text className="text-emerald-500/70 text-xs font-bold uppercase tracking-widest mb-2">Total Accumulated</Text>
          <Text className="text-5xl font-black text-emerald-400 tracking-tighter">{formatPKR(totalSavings)}</Text>
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-8 shadow-lg">
          <Text className="text-white text-lg font-black mb-4 tracking-tight">Current Month Progress</Text>
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-stone-400 font-bold">Projected End</Text>
            <Text className="text-emerald-400 font-black">{formatPKR(savingsThisMonth)}</Text>
          </View>
          <View className="h-3 bg-black/40 rounded-full overflow-hidden mb-2 border border-stone-800">
            <View className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.max(5, Math.min(100, (savingsThisMonth / (savingsGoal || 1)) * 100))}%` }} />
          </View>
          <Text className="text-stone-500 text-[10px] uppercase text-right tracking-widest">of {formatPKR(savingsGoal)} Target</Text>
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-8 shadow-lg">
          <Text className="text-white text-lg font-black mb-4 tracking-tight">Set Monthly Goal</Text>
          <View className="flex-row items-center bg-black rounded-[24px] p-4 border border-stone-800 mb-4">
            <Text className="text-stone-500 font-bold text-xl ml-2 mr-3">Rs.</Text>
            <TextInput
              className="flex-1 text-emerald-400 text-2xl font-black tracking-tighter"
              keyboardType="numeric"
              value={goalInput}
              onChangeText={setGoalInput}
            />
          </View>
          <TouchableOpacity
            onPress={handleSaveGoal}
            className="bg-emerald-600/20 py-4 rounded-2xl items-center border border-emerald-500/30 active:bg-emerald-600/40"
          >
            <Text className="text-emerald-400 font-black uppercase tracking-widest text-sm">Update Goal</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
