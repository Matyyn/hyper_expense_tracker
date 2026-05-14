import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform, Pressable, RefreshControl } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withRepeat, withTiming, withSequence, interpolate, Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotification } from '../../components/NotificationProvider';
import { useAuth } from '../../components/AuthProvider';
import { useExpenseSync } from '../../hooks/useExpenseSync';
import { supabase } from '../../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function SkeletonBlock({ width, height, className }: { width?: number | string; height: number; className?: string }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.25, 0.55]),
  }));

  return (
    <Animated.View
      style={[animStyle, { width: width as any, height, borderRadius: 12, backgroundColor: '#292524' }, ]}
      className={className}
    />
  );
}

function DashboardSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView className="px-6 py-4" contentContainerStyle={{ paddingBottom: 60 }} scrollEnabled={false}>
        {/* Header skeleton */}
        <View className="flex-row justify-between items-center mb-8 mt-2">
          <View>
            <SkeletonBlock width={180} height={36} className="mb-2 rounded-xl" />
            <SkeletonBlock width={100} height={12} className="rounded-full" />
          </View>
          <SkeletonBlock width={90} height={34} className="rounded-full" />
        </View>

        {/* Hero card skeleton */}
        <View className="bg-stone-900 rounded-[32px] p-6 mb-8">
          <SkeletonBlock width={120} height={12} className="mb-3 rounded-full" />
          <SkeletonBlock width={220} height={48} className="mb-6 rounded-xl" />
          <SkeletonBlock width="100%" height={12} className="mb-6 rounded-full" />
          <View className="flex-row justify-between bg-black/20 rounded-2xl p-4">
            <View>
              <SkeletonBlock width={80} height={10} className="mb-2 rounded-full" />
              <SkeletonBlock width={110} height={24} className="rounded-xl" />
            </View>
            <View className="items-end">
              <SkeletonBlock width={80} height={10} className="mb-2 rounded-full" />
              <SkeletonBlock width={110} height={24} className="rounded-xl" />
            </View>
          </View>
        </View>

        {/* Chart skeleton */}
        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-8">
          <SkeletonBlock width={160} height={18} className="mb-6 rounded-xl" />
          <View className="flex-row justify-between items-end h-32">
            {[65, 40, 80, 55, 90, 30, 70].map((h, i) => (
              <View key={i} className="flex-1 items-center">
                <View className="w-6 bg-stone-800 rounded-t-lg overflow-hidden" style={{ height: '100%' }}>
                  <View className="w-full bg-stone-700 rounded-t-lg absolute bottom-0" style={{ height: `${h}%` }} />
                </View>
                <SkeletonBlock width={20} height={8} className="mt-2 rounded-full" />
              </View>
            ))}
          </View>
        </View>

        {/* Add Expense skeleton */}
        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-8">
          <SkeletonBlock width={140} height={22} className="mb-6 rounded-xl" />
          <SkeletonBlock width="100%" height={52} className="mb-4 rounded-2xl" />
          <View className="flex-row mb-4">
            {[80, 70, 90, 75].map((w, i) => (
              <SkeletonBlock key={i} width={w} height={32} className="mr-2 rounded-full" />
            ))}
          </View>
          <SkeletonBlock width="100%" height={52} className="mb-4 rounded-2xl" />
          <SkeletonBlock width="100%" height={52} className="rounded-2xl" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BounceCard({ onPress, children, className }: { onPress: () => void; children: React.ReactNode; className?: string }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      onPressIn={() => { scale.value = withSpring(0.95, { damping: 15, stiffness: 200 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 200 }); }}
      onPress={onPress}
      style={animStyle}
      className={className}
    >
      {children}
    </AnimatedPressable>
  );
}

const formatPKR = (amount: number) => `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const {
    expenses, weeklyExpenses, metrics, categories, categoryMap,
    commuteTemplates, foodTemplates,
    addExpense, updateProfile, updateTemplate, isAdding, isLoading
  } = useExpenseSync(user?.id);

  const { showNotification } = useNotification();

  const { leftoverBudget, burnRate, weeklyBudget, monthlyBudget, totalSpentMonthly, savingsGoal } = metrics;

  const [newBudget, setNewBudget] = useState(monthlyBudget.toString());
  const [newGoal, setNewGoal] = useState(savingsGoal.toString());
  const [showBudgetModal, setShowBudgetModal] = useState(false);

  // Track edited template amounts locally
  const [templateAmounts, setTemplateAmounts] = useState<Record<string, string>>({});

  // Custom expense state
  const [customExpense, setCustomExpense] = useState({ description: '', amount: '', category: categories[0]?.name || 'Misc' });

  // Date picker
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear] = useState(today.getFullYear());

  useEffect(() => {
    setNewBudget(monthlyBudget.toString());
    setNewGoal(savingsGoal.toString());
  }, [monthlyBudget, savingsGoal]);

  // Initialize template amounts from DB only once or when data truly changes from server
  useEffect(() => {
    const all = [...commuteTemplates, ...foodTemplates];
    if (all.length === 0) return;
    
    setTemplateAmounts(prev => {
      // If we already have values, don't overwrite what the user is typing
      if (Object.keys(prev).length > 0) return prev;
      
      const map: Record<string, string> = {};
      all.forEach(t => { map[t.id] = t.amount.toString(); });
      return map;
    });
  }, [commuteTemplates, foodTemplates]);

  const budgetPercentage = Math.max(0, Math.min(100, (leftoverBudget / (weeklyBudget + 1)) * 100));

  // Weekly chart data
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekData = new Array(7).fill(0);
  weeklyExpenses.forEach(exp => {
    if (exp.created_at) { weekData[new Date(exp.created_at).getDay()] += Number(exp.amount); }
  });
  const maxExpense = Math.max(...weekData, 1);

  const getSelectedDateISO = () => new Date(selectedYear, selectedMonth, selectedDay, 12, 0, 0).toISOString();
  const isToday = selectedDay === today.getDate() && selectedMonth === today.getMonth();

  // Handlers
  const handleTemplateLog = (templateId: string, title: string, category: string) => {
    const amount = Number(templateAmounts[templateId]) || 0;
    if (amount > 0) {
      // Save edited amount back to DB if changed
      const original = [...commuteTemplates, ...foodTemplates].find(t => t.id === templateId);
      if (original && original.amount !== amount) {
        updateTemplate({ id: templateId, amount });
      }
      addExpense({ amount, description: title, category });
      showNotification(`Logged ${formatPKR(amount)} for ${title}`, 'success');
    }
  };

  const handleCustomExpense = () => {
    if (customExpense.description && customExpense.amount) {
      const amount = Number(customExpense.amount);
      addExpense({
        description: customExpense.description,
        amount,
        category: customExpense.category,
        date: isToday ? undefined : getSelectedDateISO(),
      });
      showNotification(`Logged ${formatPKR(amount)} for ${customExpense.description}`, 'success');
      setCustomExpense({ description: '', amount: '', category: categories[0]?.name || 'Misc' });
    }
  };

  const handleSaveSettings = () => {
    updateProfile({ monthly_budget: Number(newBudget), savings_goal: Number(newGoal) });
    setShowBudgetModal(false);
  };

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (isLoading) return <DashboardSkeleton />;

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['expenses', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['quick_templates', user?.id] });
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
        className="px-6 py-4" 
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />}
      >

        {/* Header */}
        <View className="flex-row justify-between items-center mb-8 mt-2">
          <View>
            <Text className="text-4xl font-black text-white tracking-tighter">Hyper Wallet</Text>
            <Text className="text-emerald-400 font-bold mt-1 text-xs tracking-widest uppercase">Smart Tracking</Text>
          </View>
          <TouchableOpacity
            onPress={() => { setNewBudget(monthlyBudget.toString()); setNewGoal(savingsGoal.toString()); setShowBudgetModal(true); }}
            className="bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/30"
          >
            <Text className="text-emerald-400 font-bold text-xs uppercase tracking-wider">Configure</Text>
          </TouchableOpacity>
        </View>

        {/* Weekly Wallet Engine */}
        <View className="bg-emerald-600 rounded-[32px] p-6 mb-8 shadow-2xl">
          <View className="flex-row justify-between items-end mb-4">
            <View>
              <Text className="text-emerald-100/70 text-xs font-black uppercase tracking-widest mb-1">Weekly Leftover</Text>
              <Text className="text-5xl font-black text-white tracking-tighter">{formatPKR(leftoverBudget)}</Text>
            </View>
            <View className="items-end bg-black/20 px-4 py-2 rounded-full">
              <Text className="text-white text-xs font-bold tracking-wider">{leftoverBudget > 0 ? 'ON TRACK' : 'DEFICIT'}</Text>
            </View>
          </View>
          <View className="h-3 bg-black/20 rounded-full mb-6 overflow-hidden">
            <View className="h-full bg-white rounded-full" style={{ width: `${budgetPercentage}%` }} />
          </View>
          <View className="flex-row justify-between bg-black/10 rounded-2xl p-4">
            <View>
              <Text className="text-emerald-100/70 text-[10px] font-black uppercase tracking-wider">Safe Daily Burn</Text>
              <Text className="text-white text-xl font-black mt-1 tracking-tighter">{formatPKR(burnRate)}<Text className="text-xs font-normal text-emerald-200/70">/day</Text></Text>
            </View>
            <View className="items-end">
              <Text className="text-emerald-100/70 text-[10px] font-black uppercase tracking-wider">Spent / Month</Text>
              <Text className="text-white text-xl font-black mt-1 tracking-tighter">{formatPKR(totalSpentMonthly)}</Text>
            </View>
          </View>
        </View>

        {/* Weekly Chart */}
        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-8 shadow-lg">
          <Text className="text-white text-lg font-black mb-4 tracking-tight">Weekly Overview</Text>
          <View className="flex-row justify-between items-end h-32 mt-4">
            {weekData.map((amount, idx) => {
              const barH = (amount / maxExpense) * 100;
              return (
                <View key={idx} className="items-center flex-1">
                  {amount > 0 && <Text className="text-stone-500 text-[8px] font-bold mb-1" numberOfLines={1}>{formatPKR(amount).replace('Rs. ', '')}</Text>}
                  <View className="w-6 bg-stone-800 rounded-t-lg items-end justify-end overflow-hidden" style={{ height: '100%' }}>
                    <View className="w-full bg-emerald-500 rounded-t-lg" style={{ height: `${barH}%` }} />
                  </View>
                  <Text className="text-stone-400 text-[10px] font-bold mt-2">{days[idx]}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {isAdding && (
          <View className="flex-row items-center justify-center mb-6 bg-emerald-500/10 py-3 rounded-full border border-emerald-500/20">
            <ActivityIndicator size="small" color="#818cf8" />
            <Text className="text-emerald-300 ml-3 font-bold text-xs uppercase tracking-widest">Syncing...</Text>
          </View>
        )}

        {/* Add Expense with Date Picker */}
        <View className="mb-8 bg-stone-900 border border-stone-800 rounded-[32px] p-6 shadow-lg">
          <Text className="text-white text-xl font-black mb-4 tracking-tight">Add Expense</Text>

          {/* Date Selector */}
          <View className="mb-4">
            <Text className="text-stone-500 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              {monthNames.map((m, idx) => {
                if (idx > today.getMonth()) return null;
                return (
                  <TouchableOpacity key={m} onPress={() => { setSelectedMonth(idx); if (selectedDay > new Date(selectedYear, idx + 1, 0).getDate()) setSelectedDay(1); }}
                    className={`px-3 py-1.5 mr-2 rounded-full border ${selectedMonth === idx ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}>
                    <Text className={`text-[10px] font-bold uppercase ${selectedMonth === idx ? 'text-white' : 'text-stone-500'}`}>{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                if (selectedMonth === today.getMonth() && d > today.getDate()) return null;
                return (
                  <TouchableOpacity key={d} onPress={() => setSelectedDay(d)}
                    className={`w-9 h-9 mr-1.5 rounded-full items-center justify-center border ${selectedDay === d ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}>
                    <Text className={`text-xs font-bold ${selectedDay === d ? 'text-white' : 'text-stone-500'}`}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {!isToday && (
              <View className="mt-2 bg-amber-500/10 px-3 py-1.5 rounded-full self-start border border-amber-500/20">
                <Text className="text-amber-400 text-[10px] font-bold uppercase tracking-wider">Logging for {monthNames[selectedMonth]} {selectedDay}</Text>
              </View>
            )}
          </View>

          <TextInput placeholder="What did you spend on?" placeholderTextColor="#78716c" value={customExpense.description}
            onChangeText={text => setCustomExpense(prev => ({ ...prev, description: text }))}
            className="bg-black text-white px-4 py-4 rounded-2xl mb-4 border border-stone-800 font-bold" />

          {/* Dynamic categories from DB */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            {categories.map(cat => (
              <TouchableOpacity key={cat.id} onPress={() => setCustomExpense(prev => ({ ...prev, category: cat.name }))}
                className={`px-4 py-2 mr-2 rounded-full border ${customExpense.category === cat.name ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}>
                <Text className={`text-xs font-bold uppercase tracking-widest ${customExpense.category === cat.name ? 'text-white' : 'text-stone-400'}`}>{cat.icon} {cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View className="flex-row items-center bg-black rounded-2xl px-4 py-4 border border-stone-800 mb-4">
            <Text className="text-stone-500 font-bold mr-2 text-lg">Rs.</Text>
            <TextInput placeholder="0" placeholderTextColor="#78716c" keyboardType="numeric" value={customExpense.amount}
              onChangeText={text => setCustomExpense(prev => ({ ...prev, amount: text }))}
              className="flex-1 text-white font-black text-xl" />
          </View>
          <BounceCard onPress={handleCustomExpense} className="bg-emerald-600 py-4 rounded-2xl items-center shadow-xl shadow-emerald-600/30">
            <Text className="text-white font-black uppercase tracking-widest text-sm">+ Add Expense</Text>
          </BounceCard>
        </View>

        {/* Quick Commute — from DB templates */}
        {commuteTemplates.length > 0 && (
          <View className="mb-8">
            <Text className="text-white text-xl font-black mb-4 tracking-tight">Quick Commute</Text>
            <View className="flex-row">
              {commuteTemplates.map(t => (
                <View key={t.id} className="flex-1 mx-1 bg-stone-900 border border-stone-800 rounded-[24px] py-4 px-4 items-center shadow-lg">
                  <Text className="text-3xl mb-3">{t.icon}</Text>
                  <Text className="text-white font-black text-[10px] uppercase tracking-widest text-center mb-2">{t.title}</Text>
                  <View className="flex-row items-center bg-black rounded-lg px-2 py-1 mb-3 border border-stone-800 w-full">
                    <Text className="text-stone-500 text-[10px] mr-1">Rs.</Text>
                    <TextInput value={templateAmounts[t.id] ?? t.amount.toString()}
                      onChangeText={val => setTemplateAmounts(prev => ({ ...prev, [t.id]: val }))}
                      keyboardType="numeric" className="text-white font-black text-xs flex-1 py-1 text-center" />
                  </View>
                  <BounceCard onPress={() => handleTemplateLog(t.id, t.title, t.category)} className="bg-emerald-600 w-full py-2 rounded-xl items-center">
                    <Text className="text-white text-[10px] font-bold uppercase tracking-wider">+ LOG</Text>
                  </BounceCard>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Food & Dining — from DB templates */}
        {foodTemplates.length > 0 && (
          <View className="mb-8">
            <Text className="text-white text-xl font-black mb-4 tracking-tight">Food & Dining</Text>
            <View className="flex-row">
              {foodTemplates.map(t => (
                <View key={t.id} className="flex-1 mx-1 bg-stone-900 border border-stone-800 rounded-[24px] p-4 items-center shadow-lg">
                  <Text className="text-3xl mb-2">{t.icon}</Text>
                  <Text className="text-white font-black text-[10px] uppercase tracking-wider mb-3">{t.title}</Text>
                  <View className="flex-row items-center bg-black rounded-lg px-2 py-1 mb-3 border border-stone-800 w-full">
                    <Text className="text-stone-500 text-[10px] mr-1">Rs.</Text>
                    <TextInput value={templateAmounts[t.id] ?? t.amount.toString()}
                      onChangeText={val => setTemplateAmounts(prev => ({ ...prev, [t.id]: val }))}
                      keyboardType="numeric" className="text-white font-black text-xs flex-1 py-1 text-center" />
                  </View>
                  <BounceCard onPress={() => handleTemplateLog(t.id, t.title, t.category)} className="bg-emerald-600 w-full py-2 rounded-xl items-center">
                    <Text className="text-white text-[10px] font-bold uppercase tracking-wider">+ LOG</Text>
                  </BounceCard>
                </View>
              ))}
            </View>
          </View>
        )}


        {/* Settings Modal */}
        <Modal visible={showBudgetModal} animationType="slide" transparent={true}>
          <View className="flex-1 justify-end bg-black/80">
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View className="bg-stone-900 rounded-t-[40px] p-8 border-t border-stone-800 shadow-2xl">
              <View className="w-12 h-1.5 bg-stone-800 self-center rounded-full mb-8" />
              <Text className="text-3xl font-black text-white mb-2 tracking-tighter">Settings</Text>
              <Text className="text-stone-400 mb-6 font-bold">Configure your wallet.</Text>

              <Text className="text-emerald-400 font-bold text-xs uppercase tracking-widest mb-2 ml-2">Monthly Budget</Text>
              <View className="bg-black/50 rounded-[24px] p-4 border border-stone-800 mb-4 flex-row items-center">
                <Text className="text-stone-500 font-bold text-2xl ml-2 mr-3">Rs.</Text>
                <TextInput className="flex-1 text-white text-3xl font-black tracking-tighter" keyboardType="numeric" value={newBudget} onChangeText={setNewBudget} />
              </View>

              <Text className="text-emerald-400 font-bold text-xs uppercase tracking-widest mb-2 ml-2">Monthly Savings Goal</Text>
              <View className="bg-black/50 rounded-[24px] p-4 border border-emerald-900/30 mb-6 flex-row items-center">
                <Text className="text-stone-500 font-bold text-2xl ml-2 mr-3">Rs.</Text>
                <TextInput className="flex-1 text-emerald-400 text-3xl font-black tracking-tighter" keyboardType="numeric" value={newGoal} onChangeText={setNewGoal} />
              </View>

              <View className="bg-stone-800/30 p-4 rounded-2xl border border-stone-800 mb-6">
                <View className="flex-row justify-between">
                  <View>
                    <Text className="text-stone-400 text-[10px] font-black uppercase tracking-widest mb-1">Weekly Split</Text>
                    <Text className="text-white text-lg font-black tracking-tighter">{formatPKR(Number(newBudget) / 4)}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-stone-400 text-[10px] font-black uppercase tracking-widest mb-1">Daily Limit</Text>
                    <Text className="text-white text-lg font-black tracking-tighter">{formatPKR(Number(newBudget) / 30)}</Text>
                  </View>
                </View>
              </View>
              
              <View className="flex-row gap-4">
                <TouchableOpacity onPress={() => setShowBudgetModal(false)} className="flex-1 py-4 rounded-[24px] bg-stone-800 items-center">
                  <Text className="text-white font-bold tracking-wider uppercase text-xs">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveSettings} className="flex-1 py-4 rounded-[24px] bg-emerald-600 items-center shadow-lg shadow-emerald-600/30">
                  <Text className="text-white font-black tracking-wider uppercase text-xs">Save</Text>
                </TouchableOpacity>
              </View>
            </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
