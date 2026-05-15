import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform, Pressable, RefreshControl } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withRepeat, withTiming, withSequence, interpolate, Easing, FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotification } from '../../components/NotificationProvider';
import { useAuth } from '../../components/AuthProvider';
import { useCurrency } from '../../components/CurrencyProvider';
import { useExpenseSync, INCOME_CATEGORY, QuickTemplate } from '../../hooks/useExpenseSync';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function SkeletonBlock({ width, height, className }: { width?: number | string; height: number; className?: string }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ), -1, false);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: interpolate(pulse.value, [0, 1], [0.25, 0.55]) }));
  return <Animated.View style={[animStyle, { width: width as any, height, borderRadius: 12, backgroundColor: '#292524' }]} className={className} />;
}

function DashboardSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView className="px-6" contentContainerStyle={{ paddingBottom: 60 }} scrollEnabled={false}>
        <View className="flex-row justify-between items-center mb-6 mt-2">
          <View>
            <SkeletonBlock width={180} height={32} className="mb-2 rounded-xl" />
            <SkeletonBlock width={100} height={10} className="rounded-full" />
          </View>
          <SkeletonBlock width={90} height={32} className="rounded-full" />
        </View>
        <View className="bg-stone-900 rounded-3xl p-6 mb-5">
          <SkeletonBlock width={120} height={10} className="mb-3 rounded-full" />
          <SkeletonBlock width={220} height={42} className="mb-5 rounded-xl" />
          <SkeletonBlock width="100%" height={8} className="mb-5 rounded-full" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BounceCard({ onPress, onLongPress, children, className, style }: { onPress: () => void; onLongPress?: () => void; children: React.ReactNode; className?: string; style?: any }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 15, stiffness: 220 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 200 }); }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={[animStyle, style]}
      className={className}
    >
      {children}
    </AnimatedPressable>
  );
}

function SectionTitle({ icon, label, color = '#34d399' }: { icon: React.ComponentProps<typeof FontAwesome>['name']; label: string; color?: string }) {
  return (
    <View className="flex-row items-center mb-4">
      <View className="w-7 h-7 rounded-lg bg-stone-900 border border-stone-800 items-center justify-center mr-3">
        <FontAwesome name={icon} size={12} color={color} />
      </View>
      <Text className="text-white text-base font-bold tracking-tight">{label}</Text>
    </View>
  );
}

type TemplateDraft = {
  id?: string;
  title: string;
  icon: string;
  amount: string;
  category: string;
  group_name: string;
};

const EMPTY_DRAFT: TemplateDraft = { title: '', icon: '⚡', amount: '', category: 'Misc', group_name: 'commute' };

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { format, symbol } = useCurrency();
  const [refreshing, setRefreshing] = useState(false);

  const {
    expenses, incomeEntries, weeklyExpenses, metrics, categories, categoryMap,
    commuteTemplates, foodTemplates, otherTemplates,
    categorySpend,
    addExpense, updateProfile, updateTemplate, addTemplate, deleteTemplate, isAdding, isLoading
  } = useExpenseSync(user?.id);

  const { showNotification, history, unreadCount, markAllRead, clearHistory } = useNotification();
  const { leftoverBudget, burnRate, weeklyBudget, monthlyBudget, totalSpentMonthly, totalIncomeMonthly, savingsGoal, streak } = metrics;

  const [newBudget, setNewBudget] = useState(monthlyBudget.toString());
  const [newGoal, setNewGoal] = useState(savingsGoal.toString());
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [templateAmounts, setTemplateAmounts] = useState<Record<string, string>>({});
  const [quickLogTab, setQuickLogTab] = useState<'commute' | 'food' | 'other'>('commute');
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [logMode, setLogMode] = useState<'expense' | 'income'>('expense');

  // Template editor
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);

  const [customExpense, setCustomExpense] = useState({ description: '', amount: '', category: categories[0]?.name || 'Misc' });

  const today = new Date();
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear] = useState(today.getFullYear());

  useEffect(() => {
    setNewBudget(monthlyBudget.toString());
    setNewGoal(savingsGoal.toString());
  }, [monthlyBudget, savingsGoal]);

  useEffect(() => {
    const all = [...commuteTemplates, ...foodTemplates, ...otherTemplates];
    if (all.length === 0) return;
    setTemplateAmounts(prev => {
      const map: Record<string, string> = { ...prev };
      all.forEach(t => { if (map[t.id] === undefined) map[t.id] = t.amount.toString(); });
      return map;
    });
  }, [commuteTemplates, foodTemplates, otherTemplates]);

  // Ensure Income category exists for existing users (one-time idempotent insert)
  useEffect(() => {
    if (!user?.id || categories.length === 0) return;
    if (categories.find(c => c.name === INCOME_CATEGORY)) return;
    (async () => {
      await supabase.from('categories').insert([
        { user_id: user.id, name: INCOME_CATEGORY, icon: '💰', color: '#10b981', sort_order: 99 }
      ]);
      queryClient.invalidateQueries({ queryKey: ['categories', user.id] });
    })();
  }, [user?.id, categories]);

  const budgetPercentage = Math.max(0, Math.min(100, (leftoverBudget / (weeklyBudget + 1)) * 100));

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekData = new Array(7).fill(0);
  weeklyExpenses.forEach(exp => {
    if (exp.created_at) { weekData[new Date(exp.created_at).getDay()] += Number(exp.amount); }
  });
  const maxExpense = Math.max(...weekData, 1);

  const getSelectedDateISO = () => new Date(selectedYear, selectedMonth, selectedDay, 12, 0, 0).toISOString();
  const isToday = selectedDay === today.getDate() && selectedMonth === today.getMonth();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

  // Category budget alerts (read from user_metadata)
  const categoryBudgets: Record<string, number> = (user?.user_metadata?.category_budgets as Record<string, number>) || {};
  const checkCategoryAlert = (category: string, addedAmount: number) => {
    const limit = categoryBudgets[category];
    if (!limit) return;
    const before = categorySpend[category] || 0;
    const after = before + addedAmount;
    const pctBefore = (before / limit) * 100;
    const pctAfter = (after / limit) * 100;
    if (pctBefore < 100 && pctAfter >= 100) {
      showNotification(`${category} budget exceeded`, 'error');
    } else if (pctBefore < 80 && pctAfter >= 80) {
      showNotification(`${category} at ${Math.round(pctAfter)}% of budget`, 'info');
    }
  };

  const handleTemplateLog = (templateId: string, title: string, category: string) => {
    const amount = Number(templateAmounts[templateId]) || 0;
    if (amount > 0) {
      const original = [...commuteTemplates, ...foodTemplates, ...otherTemplates].find(t => t.id === templateId);
      if (original && original.amount !== amount) {
        updateTemplate({ id: templateId, amount });
      }
      addExpense({ amount, description: title, category });
      showNotification(`Logged ${format(amount)} for ${title}`, 'success');
      checkCategoryAlert(category, amount);
    }
  };

  const handleCustomEntry = () => {
    if (!customExpense.description || !customExpense.amount) return;
    const amount = Number(customExpense.amount);
    const category = logMode === 'income' ? INCOME_CATEGORY : customExpense.category;
    addExpense({
      description: customExpense.description,
      amount,
      category,
      date: isToday ? undefined : getSelectedDateISO(),
    });
    showNotification(logMode === 'income' ? `Income ${format(amount)} logged` : `Logged ${format(amount)} for ${customExpense.description}`, 'success');
    if (logMode === 'expense') checkCategoryAlert(category, amount);
    setCustomExpense({ description: '', amount: '', category: categories[0]?.name || 'Misc' });
  };

  const handleSaveSettings = () => {
    updateProfile({ monthly_budget: Number(newBudget), savings_goal: Number(newGoal) });
    setShowBudgetModal(false);
    showNotification('Budget settings saved', 'success');
  };

  const openNewTemplate = (group: 'commute' | 'food' | 'other') => {
    setTemplateDraft({ ...EMPTY_DRAFT, group_name: group, category: categories.filter(c => c.name !== INCOME_CATEGORY)[0]?.name || 'Misc' });
  };

  const openEditTemplate = (t: QuickTemplate) => {
    setTemplateDraft({ id: t.id, title: t.title, icon: t.icon, amount: t.amount.toString(), category: t.category, group_name: t.group_name });
  };

  const handleSaveTemplate = () => {
    if (!templateDraft) return;
    const { id, title, icon, amount, category, group_name } = templateDraft;
    const amt = Number(amount);
    if (!title.trim() || !icon.trim() || isNaN(amt) || amt <= 0) {
      showNotification('Fill in all fields', 'error');
      return;
    }
    if (id) {
      updateTemplate({ id, title: title.trim(), icon: icon.trim(), amount: amt, category, group_name });
      showNotification('Template updated', 'success');
    } else {
      addTemplate({ title: title.trim(), icon: icon.trim(), amount: amt, category, group_name });
      showNotification('Template added', 'success');
    }
    setTemplateDraft(null);
  };

  const handleDeleteTemplate = () => {
    if (!templateDraft?.id) return;
    deleteTemplate(templateDraft.id);
    showNotification('Template deleted', 'info');
    setTemplateDraft(null);
  };

  if (isLoading) return <DashboardSkeleton />;

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['expenses', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['quick_templates', user?.id] });
    setRefreshing(false);
    showNotification('Synced', 'success');
  };

  const activeTemplates = quickLogTab === 'commute' ? commuteTemplates : quickLogTab === 'food' ? foodTemplates : otherTemplates;

  const reminderEnabled = user?.user_metadata?.reminder_enabled !== false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const loggedToday = expenses.some(e => e.created_at && new Date(e.created_at) >= startOfToday);
  const showReminderBanner = reminderEnabled && !loggedToday && !reminderDismissed && !isAdding;

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        style={{ flex: 1 }}
      >
        <ScrollView
          className="px-6"
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />}
        >
          {/* Header */}
          <View className="flex-row justify-between items-center mb-5 mt-1">
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="text-3xl font-bold text-white tracking-tight">Hyper Wallet</Text>
                {streak >= 2 && (
                  <View className="ml-2 flex-row items-center bg-amber-500/15 border border-amber-500/30 px-2 py-1 rounded-full">
                    <Text className="text-amber-400 text-xs">🔥</Text>
                    <Text className="text-amber-300 text-xs font-bold ml-1">{streak}</Text>
                  </View>
                )}
              </View>
              <Text className="text-emerald-400 mt-1 text-[11px] font-semibold tracking-widest uppercase">Smart Tracking</Text>
            </View>
            <View className="flex-row items-center">
              <TouchableOpacity
                onPress={() => { setShowNotifModal(true); markAllRead(); }}
                className="w-11 h-11 bg-stone-900 border border-stone-800 rounded-full items-center justify-center active:bg-stone-800 mr-2"
              >
                <FontAwesome name="bell" size={15} color="#34d399" />
                {unreadCount > 0 && (
                  <View className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-rose-500 rounded-full items-center justify-center border-2 border-black">
                    <Text className="text-white text-[9px] font-bold">{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setNewBudget(monthlyBudget.toString()); setNewGoal(savingsGoal.toString()); setShowBudgetModal(true); }}
                className="w-11 h-11 bg-stone-900 border border-stone-800 rounded-full items-center justify-center active:bg-stone-800"
              >
                <FontAwesome name="sliders" size={16} color="#34d399" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Reminder Banner */}
          {showReminderBanner && (
            <Animated.View entering={FadeIn.duration(300)} className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 mb-5 flex-row items-center">
              <View className="w-9 h-9 rounded-xl bg-amber-500/15 items-center justify-center mr-3">
                <FontAwesome name="bell-o" size={14} color="#fbbf24" />
              </View>
              <View className="flex-1">
                <Text className="text-amber-300 text-sm font-semibold">Don't forget to log</Text>
                <Text className="text-amber-200/70 text-xs mt-0.5">You haven't tracked any expense today.</Text>
              </View>
              <TouchableOpacity onPress={() => setReminderDismissed(true)} className="w-8 h-8 items-center justify-center">
                <FontAwesome name="close" size={14} color="#fbbf24" />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Hero Card */}
          <Animated.View entering={FadeIn.duration(400)} className="bg-emerald-600 rounded-3xl p-6 mb-5">
            <View className="flex-row justify-between items-start mb-4">
              <View className="flex-1">
                <Text className="text-emerald-100/80 text-[11px] font-semibold uppercase tracking-widest mb-2">Weekly Leftover</Text>
                <Text className="text-4xl font-bold text-white tracking-tight">{format(leftoverBudget)}</Text>
              </View>
              <View className={`px-3 py-1.5 rounded-full ${leftoverBudget > 0 ? 'bg-black/20' : 'bg-rose-500/30'}`}>
                <Text className="text-white text-[11px] font-semibold uppercase tracking-wider">
                  {leftoverBudget > 0 ? 'On Track' : 'Deficit'}
                </Text>
              </View>
            </View>
            <View className="h-2 bg-black/20 rounded-full mb-5 overflow-hidden">
              <View className="h-full bg-white rounded-full" style={{ width: `${budgetPercentage}%` }} />
            </View>
            <View className="flex-row bg-black/10 rounded-2xl p-3">
              <View className="flex-1 px-2">
                <Text className="text-emerald-100/70 text-[10px] font-semibold uppercase tracking-wider mb-1">Daily Burn</Text>
                <Text className="text-white text-base font-bold tracking-tight">{format(burnRate)}</Text>
              </View>
              <View className="w-px bg-black/20" />
              <View className="flex-1 px-2 items-center">
                <Text className="text-emerald-100/70 text-[10px] font-semibold uppercase tracking-wider mb-1">Spent</Text>
                <Text className="text-white text-base font-bold tracking-tight">{format(totalSpentMonthly)}</Text>
              </View>
              <View className="w-px bg-black/20" />
              <View className="flex-1 px-2 items-end">
                <Text className="text-emerald-100/70 text-[10px] font-semibold uppercase tracking-wider mb-1">Income</Text>
                <Text className="text-white text-base font-bold tracking-tight">{format(totalIncomeMonthly)}</Text>
              </View>
            </View>
          </Animated.View>

          {/* Weekly Chart */}
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-5">
            <SectionTitle icon="bar-chart" label="Weekly Overview" />
            <View className="flex-row justify-between items-end h-24 mt-1 mb-1">
              {weekData.map((amount, idx) => {
                const barH = (amount / maxExpense) * 100;
                const isCurrent = idx === new Date().getDay();
                return (
                  <View key={idx} className="items-center flex-1">
                    {amount > 0 && (
                      <Text className="text-stone-500 text-[10px] font-semibold mb-1" numberOfLines={1}>
                        {Math.round(amount / 1000) >= 1 ? `${(amount / 1000).toFixed(0)}k` : Math.round(amount)}
                      </Text>
                    )}
                    <View className="w-5 bg-stone-800/60 rounded-t-md items-end justify-end overflow-hidden" style={{ height: '100%' }}>
                      <View className={`w-full rounded-t-md ${isCurrent ? 'bg-emerald-400' : 'bg-emerald-600/70'}`} style={{ height: `${barH}%` }} />
                    </View>
                    <Text className={`text-[10px] font-semibold mt-2 ${isCurrent ? 'text-emerald-400' : 'text-stone-500'}`}>{days[idx]}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {isAdding && (
            <View className="flex-row items-center justify-center mb-4 bg-emerald-500/10 py-2.5 rounded-full border border-emerald-500/20">
              <ActivityIndicator size="small" color="#34d399" />
              <Text className="text-emerald-300 ml-3 text-xs font-semibold uppercase tracking-widest">Syncing...</Text>
            </View>
          )}

          {/* Add Entry */}
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-5">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row bg-black rounded-full p-1 border border-stone-800">
                <TouchableOpacity onPress={() => setLogMode('expense')} className={`px-3.5 py-1.5 rounded-full ${logMode === 'expense' ? 'bg-rose-500/90' : ''}`}>
                  <Text className={`text-[11px] font-semibold uppercase tracking-wider ${logMode === 'expense' ? 'text-white' : 'text-stone-500'}`}>− Expense</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setLogMode('income')} className={`px-3.5 py-1.5 rounded-full ${logMode === 'income' ? 'bg-emerald-600' : ''}`}>
                  <Text className={`text-[11px] font-semibold uppercase tracking-wider ${logMode === 'income' ? 'text-white' : 'text-stone-500'}`}>+ Income</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => setShowDateModal(true)}
                className={`flex-row items-center px-3 py-1.5 rounded-full border ${isToday ? 'bg-stone-800/50 border-stone-700' : 'bg-amber-500/10 border-amber-500/30'}`}
              >
                <FontAwesome name="calendar" size={10} color={isToday ? '#a8a29e' : '#fbbf24'} />
                <Text className={`text-[11px] font-semibold ml-2 ${isToday ? 'text-stone-400' : 'text-amber-400'}`}>
                  {isToday ? 'Today' : `${monthNames[selectedMonth]} ${selectedDay}`}
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              placeholder={logMode === 'income' ? 'Source of income' : 'What did you spend on?'}
              placeholderTextColor="#78716c"
              value={customExpense.description}
              onChangeText={text => setCustomExpense(prev => ({ ...prev, description: text }))}
              className="bg-black text-white text-sm px-4 py-3.5 rounded-2xl mb-3 border border-stone-800"
            />

            {logMode === 'expense' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                {categories.filter(c => c.name !== INCOME_CATEGORY).map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setCustomExpense(prev => ({ ...prev, category: cat.name }))}
                    className={`px-3.5 py-2 mr-2 rounded-full border ${customExpense.category === cat.name ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}
                  >
                    <Text className={`text-xs font-semibold ${customExpense.category === cat.name ? 'text-white' : 'text-stone-400'}`}>{cat.icon} {cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View className="flex-row items-center bg-black rounded-2xl px-4 py-3 border border-stone-800 mb-3">
              <Text className="text-stone-500 text-base font-semibold mr-2">{symbol}</Text>
              <TextInput
                placeholder="0"
                placeholderTextColor="#78716c"
                keyboardType="numeric"
                value={customExpense.amount}
                onChangeText={text => setCustomExpense(prev => ({ ...prev, amount: text }))}
                className="flex-1 text-white font-bold text-lg"
              />
            </View>
            <BounceCard onPress={handleCustomEntry} className={`py-3.5 rounded-2xl items-center ${logMode === 'income' ? 'bg-emerald-600 active:bg-emerald-500' : 'bg-rose-500 active:bg-rose-400'}`}>
              <Text className="text-white text-sm font-bold uppercase tracking-wider">{logMode === 'income' ? 'Add Income' : 'Add Expense'}</Text>
            </BounceCard>
          </View>

          {/* Quick Log */}
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-5">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <View className="w-7 h-7 rounded-lg bg-black border border-stone-800 items-center justify-center mr-3">
                  <FontAwesome name="bolt" size={12} color="#34d399" />
                </View>
                <Text className="text-white text-base font-bold tracking-tight">Quick Log</Text>
              </View>
              <View className="flex-row bg-black rounded-full p-1 border border-stone-800">
                {(['commute', 'food', 'other'] as const).map(g => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setQuickLogTab(g)}
                    className={`px-3 py-1.5 rounded-full ${quickLogTab === g ? 'bg-emerald-600' : ''}`}
                  >
                    <Text className={`text-[11px] font-semibold uppercase tracking-wider ${quickLogTab === g ? 'text-white' : 'text-stone-500'}`}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View className="flex-row flex-wrap -mx-1">
              {activeTemplates.map(t => (
                <View key={t.id} style={{ width: '33.33%' }} className="px-1 mb-2">
                  <BounceCard
                    onPress={() => handleTemplateLog(t.id, t.title, t.category)}
                    onLongPress={() => openEditTemplate(t)}
                    className="bg-black/40 border border-stone-800 rounded-2xl py-3 px-2 items-center"
                  >
                    <Text className="text-2xl mb-2">{t.icon}</Text>
                    <Text className="text-stone-300 text-[11px] font-semibold uppercase tracking-wider text-center mb-2.5" numberOfLines={1}>{t.title}</Text>
                    <View className="flex-row items-center bg-stone-900 rounded-lg px-2 py-1 mb-2.5 border border-stone-800 w-full">
                      <Text className="text-stone-500 text-[10px] mr-1">{symbol}</Text>
                      <TextInput
                        value={templateAmounts[t.id] ?? t.amount.toString()}
                        onChangeText={val => setTemplateAmounts(prev => ({ ...prev, [t.id]: val }))}
                        keyboardType="numeric"
                        className="text-white font-semibold text-xs flex-1 py-0.5 text-center"
                      />
                    </View>
                    <View className="bg-emerald-600 w-full py-2 rounded-xl items-center">
                      <Text className="text-white text-[11px] font-bold uppercase tracking-wider">Log</Text>
                    </View>
                  </BounceCard>
                </View>
              ))}
              <View style={{ width: '33.33%' }} className="px-1 mb-2">
                <TouchableOpacity
                  onPress={() => openNewTemplate(quickLogTab)}
                  className="bg-black/20 border border-dashed border-stone-700 rounded-2xl py-3 px-2 items-center justify-center"
                  style={{ minHeight: 120 }}
                >
                  <View className="w-10 h-10 rounded-full bg-stone-800 items-center justify-center mb-2">
                    <FontAwesome name="plus" size={14} color="#78716c" />
                  </View>
                  <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-wider text-center">Add Template</Text>
                </TouchableOpacity>
              </View>
            </View>
            {activeTemplates.length > 0 && (
              <Text className="text-stone-600 text-[10px] text-center mt-2 uppercase tracking-widest">Long-press a tile to edit</Text>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date Picker Modal */}
      <Modal visible={showDateModal} animationType="slide" transparent={true} onRequestClose={() => setShowDateModal(false)}>
        <Pressable onPress={() => setShowDateModal(false)} className="flex-1 justify-end bg-black/80">
          <Pressable onPress={() => {}} className="bg-stone-900 rounded-t-3xl p-6 border-t border-stone-800">
            <View className="w-12 h-1.5 bg-stone-700 self-center rounded-full mb-6" />
            <Text className="text-xl font-bold text-white tracking-tight mb-1">Select Date</Text>
            <Text className="text-stone-400 text-sm mb-5">Choose when this entry was made</Text>
            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Month</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              {monthNames.map((m, idx) => {
                if (idx > today.getMonth()) return null;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => { setSelectedMonth(idx); if (selectedDay > new Date(selectedYear, idx + 1, 0).getDate()) setSelectedDay(1); }}
                    className={`px-3.5 py-2 mr-2 rounded-full border ${selectedMonth === idx ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}
                  >
                    <Text className={`text-xs font-semibold uppercase tracking-wider ${selectedMonth === idx ? 'text-white' : 'text-stone-500'}`}>{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                if (selectedMonth === today.getMonth() && d > today.getDate()) return null;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setSelectedDay(d)}
                    className={`w-10 h-10 mr-1.5 rounded-full items-center justify-center border ${selectedDay === d ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}
                  >
                    <Text className={`text-xs font-semibold ${selectedDay === d ? 'text-white' : 'text-stone-500'}`}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity onPress={() => setShowDateModal(false)} className="py-4 rounded-2xl bg-emerald-600 items-center">
              <Text className="text-white text-sm font-bold uppercase tracking-wider">Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={showBudgetModal} animationType="slide" transparent={true} onRequestClose={() => setShowBudgetModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' }}
        >
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" className="bg-stone-900 rounded-t-3xl border-t border-stone-800" contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            <View className="w-12 h-1.5 bg-stone-700 self-center rounded-full mb-6" />
            <Text className="text-xl font-bold text-white tracking-tight mb-1">Wallet Settings</Text>
            <Text className="text-stone-400 text-sm mb-5">Configure your monthly budget & goals</Text>
            <Text className="text-emerald-400 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Monthly Budget</Text>
            <View className="bg-black rounded-2xl p-4 border border-stone-800 mb-4 flex-row items-center">
              <Text className="text-stone-500 text-lg font-semibold mr-3">{symbol}</Text>
              <TextInput className="flex-1 text-white text-xl font-bold tracking-tight" keyboardType="numeric" value={newBudget} onChangeText={setNewBudget} />
            </View>
            <Text className="text-emerald-400 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Monthly Savings Goal</Text>
            <View className="bg-black rounded-2xl p-4 border border-emerald-900/30 mb-5 flex-row items-center">
              <Text className="text-stone-500 text-lg font-semibold mr-3">{symbol}</Text>
              <TextInput className="flex-1 text-emerald-400 text-xl font-bold tracking-tight" keyboardType="numeric" value={newGoal} onChangeText={setNewGoal} />
            </View>
            <View className="bg-black/40 p-4 rounded-2xl border border-stone-800 mb-5">
              <View className="flex-row justify-between">
                <View>
                  <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-1">Weekly Split</Text>
                  <Text className="text-white text-base font-bold tracking-tight">{format(Number(newBudget) / 4)}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-1">Daily Limit</Text>
                  <Text className="text-white text-base font-bold tracking-tight">{format(Number(newBudget) / 30)}</Text>
                </View>
              </View>
            </View>
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setShowBudgetModal(false)} className="flex-1 py-4 rounded-2xl bg-stone-800 items-center">
                <Text className="text-white text-sm font-semibold uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveSettings} className="flex-1 py-4 rounded-2xl bg-emerald-600 items-center">
                <Text className="text-white text-sm font-bold uppercase tracking-wider">Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Notifications Modal */}
      <Modal visible={showNotifModal} animationType="slide" transparent={true} onRequestClose={() => setShowNotifModal(false)}>
        <Pressable onPress={() => setShowNotifModal(false)} className="flex-1 justify-end bg-black/80">
          <Pressable onPress={() => {}} className="bg-stone-900 rounded-t-3xl border-t border-stone-800" style={{ maxHeight: '75%' }}>
            <View className="p-6 pb-4">
              <View className="w-12 h-1.5 bg-stone-700 self-center rounded-full mb-5" />
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xl font-bold text-white tracking-tight">Notifications</Text>
                {history.length > 0 && (
                  <TouchableOpacity onPress={clearHistory} className="px-3 py-1.5 rounded-full bg-stone-800 active:bg-stone-700">
                    <Text className="text-stone-300 text-[11px] font-semibold uppercase tracking-wider">Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text className="text-stone-400 text-sm">Recent activity from this session</Text>
            </View>
            <ScrollView className="px-6" contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
              {history.length === 0 ? (
                <View className="py-12 items-center">
                  <View className="w-14 h-14 bg-stone-800/50 rounded-2xl items-center justify-center mb-3">
                    <FontAwesome name="bell-o" size={20} color="#52525b" />
                  </View>
                  <Text className="text-stone-400 text-sm font-semibold text-center">No notifications</Text>
                </View>
              ) : (
                history.map(item => {
                  const dotColor = item.type === 'success' ? '#34d399' : item.type === 'error' ? '#f43f5e' : '#a8a29e';
                  const iconName = item.type === 'success' ? 'check' : item.type === 'error' ? 'exclamation' : 'info';
                  return (
                    <View key={item.id} className="flex-row items-start bg-black/40 border border-stone-800 rounded-2xl px-4 py-3 mb-2">
                      <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${dotColor}22` }}>
                        <FontAwesome name={iconName} size={11} color={dotColor} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-white text-sm font-semibold">{item.message}</Text>
                        <Text className="text-stone-500 text-[11px] mt-0.5">
                          {new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Template Editor Modal */}
      <Modal visible={!!templateDraft} animationType="slide" transparent={true} onRequestClose={() => setTemplateDraft(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' }}
        >
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" className="bg-stone-900 rounded-t-3xl border-t border-stone-800" contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            <View className="w-12 h-1.5 bg-stone-700 self-center rounded-full mb-6" />
            <Text className="text-xl font-bold text-white tracking-tight mb-1">{templateDraft?.id ? 'Edit Template' : 'New Template'}</Text>
            <Text className="text-stone-400 text-sm mb-5">Quick log buttons for frequent expenses</Text>

            <View className="flex-row mb-3">
              <View className="mr-3">
                <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Icon</Text>
                <View className="bg-black rounded-2xl border border-stone-800 w-16 h-14 items-center justify-center">
                  <TextInput
                    value={templateDraft?.icon || ''}
                    onChangeText={v => setTemplateDraft(d => d && { ...d, icon: v })}
                    maxLength={2}
                    className="text-2xl text-center"
                  />
                </View>
              </View>
              <View className="flex-1">
                <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Title</Text>
                <TextInput
                  placeholder="e.g. Coffee"
                  placeholderTextColor="#78716c"
                  value={templateDraft?.title || ''}
                  onChangeText={v => setTemplateDraft(d => d && { ...d, title: v })}
                  className="bg-black text-white text-sm px-4 py-3.5 rounded-2xl border border-stone-800"
                />
              </View>
            </View>

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Default Amount</Text>
            <View className="flex-row items-center bg-black rounded-2xl px-4 py-3 border border-stone-800 mb-3">
              <Text className="text-stone-500 text-lg font-semibold mr-3">{symbol}</Text>
              <TextInput
                placeholder="0"
                placeholderTextColor="#78716c"
                keyboardType="numeric"
                value={templateDraft?.amount || ''}
                onChangeText={v => setTemplateDraft(d => d && { ...d, amount: v })}
                className="flex-1 text-white text-lg font-bold"
              />
            </View>

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
              {categories.filter(c => c.name !== INCOME_CATEGORY).map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setTemplateDraft(d => d && { ...d, category: cat.name })}
                  className={`px-3.5 py-2 mr-2 rounded-full border ${templateDraft?.category === cat.name ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}
                >
                  <Text className={`text-xs font-semibold ${templateDraft?.category === cat.name ? 'text-white' : 'text-stone-400'}`}>{cat.icon} {cat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Group</Text>
            <View className="flex-row -mx-1 mb-5">
              {(['commute', 'food', 'other'] as const).map(g => (
                <TouchableOpacity
                  key={g}
                  onPress={() => setTemplateDraft(d => d && { ...d, group_name: g })}
                  className={`flex-1 mx-1 py-2.5 rounded-2xl border items-center ${templateDraft?.group_name === g ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}
                >
                  <Text className={`text-[11px] font-semibold uppercase tracking-wider ${templateDraft?.group_name === g ? 'text-white' : 'text-stone-400'}`}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="flex-row gap-3">
              {templateDraft?.id && (
                <TouchableOpacity onPress={handleDeleteTemplate} className="py-4 px-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 items-center">
                  <FontAwesome name="trash" size={14} color="#f43f5e" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setTemplateDraft(null)} className="flex-1 py-4 rounded-2xl bg-stone-800 items-center">
                <Text className="text-white text-sm font-semibold uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveTemplate} className="flex-1 py-4 rounded-2xl bg-emerald-600 items-center">
                <Text className="text-white text-sm font-bold uppercase tracking-wider">{templateDraft?.id ? 'Update' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}
