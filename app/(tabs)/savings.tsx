import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, RefreshControl, KeyboardAvoidingView, Platform, Modal, ActivityIndicator, Switch, Keyboard, Pressable } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotification } from '../../components/NotificationProvider';
import { useExpenseSync, INCOME_CATEGORY } from '../../hooks/useExpenseSync';
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
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Loan {
  id: string;
  type: 'lent' | 'borrowed';
  person: string;
  amount: number;
  paid: number;
  description?: string;
  date: string;
  due_date?: string;
  status: 'active' | 'settled';
  source?: string;
}

interface LoanDraft {
  id?: string;
  type: 'lent' | 'borrowed';
  person: string;
  amount: string;
  paid: string;
  description: string;
  hasDueDate: boolean;
  dlYear: number;
  dlMonth: number;
  dlDay: number;
  source: string;
}

const EMPTY_LOAN_DRAFT: LoanDraft = {
  type: 'lent', person: '', amount: '', paid: '0', description: '',
  hasDueDate: false, dlYear: new Date().getFullYear(), dlMonth: new Date().getMonth(), dlDay: new Date().getDate(),
  source: '',
};

function SectionTitle({ icon, label, color = '#34d399', right }: { icon: React.ComponentProps<typeof FontAwesome>['name']; label: string; color?: string; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between mb-4">
      <View className="flex-row items-center">
        <View className="w-7 h-7 rounded-lg bg-black border border-stone-800 items-center justify-center mr-3">
          <FontAwesome name={icon} size={12} color={color} />
        </View>
        <Text className="text-white text-sm font-bold tracking-tight">{label}</Text>
      </View>
      {right}
    </View>
  );
}

export default function SavingsScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { metrics, updateProfile, profile, addExpense } = useExpenseSync(
    user?.id,
    (user?.user_metadata?.monthly_budget as number) || 0,
    (user?.user_metadata?.savings_goal as number) || 0,
  );
  const { showNotification } = useNotification();
  const { format, symbol } = useCurrency();
  const { savingsThisMonth, savingsGoal, totalSavings, monthlyBudget } = metrics;
  const savedSources = ((user?.user_metadata?.custom_sources as Array<{name: string}>) || [{ name: 'Cash' }]).map((s: {name: string}) => s.name);

  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [goalInput, setGoalInput] = useState(savingsGoal.toString());
  const initialGoals: SavingsGoal[] = (user?.user_metadata?.savings_goals as SavingsGoal[]) || [];
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);
  const [contributeAmounts, setContributeAmounts] = useState<Record<string, string>>({});
  const didAutoProcess = useRef(false);
  const didProcessMonthly = useRef(false);

  const [dlYear, setDlYear] = useState(new Date().getFullYear());
  const [dlMonth, setDlMonth] = useState(new Date().getMonth());
  const [dlDay, setDlDay] = useState(new Date().getDate());
  const [hasDeadline, setHasDeadline] = useState(false);

  const initialLoans: Loan[] = (user?.user_metadata?.loans as Loan[]) || [];
  const [loanDraft, setLoanDraft] = useState<LoanDraft | null>(null);
  const [savingLoan, setSavingLoan] = useState(false);
  const [partialAmounts, setPartialAmounts] = useState<Record<string, string>>({});
  const [showLoansList, setShowLoansList] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => { setGoalInput(savingsGoal.toString()); }, [savingsGoal]);

  useEffect(() => {
    if (!goalDraft) return;
    if (goalDraft.deadline) {
      const d = new Date(goalDraft.deadline);
      if (!isNaN(d.getTime())) {
        setDlYear(d.getFullYear());
        setDlMonth(d.getMonth());
        setDlDay(d.getDate());
        setHasDeadline(true);
        return;
      }
    }
    const now = new Date();
    setDlYear(now.getFullYear());
    setDlMonth(now.getMonth());
    setDlDay(now.getDate());
    setHasDeadline(false);
  }, [goalDraft?.id, goalDraft?.deadline]);

  const handleSaveMonthlyGoal = async () => {
    const amount = Number(goalInput);
    if (isNaN(amount) || amount < 0) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ savings_goal: amount })
        .eq('id', user!.id);
      if (error) throw error;
      await supabase.auth.updateUser({ data: { savings_goal: amount } });
      await queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      showNotification(`Monthly goal updated to ${format(amount)}`, 'success');
    } catch (e: any) {
      showNotification(e.message || 'Could not update goal', 'error');
    }
  };

  const onRefresh = async () => {
    didAutoProcess.current = false;
    didProcessMonthly.current = false;
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
    const deadlineValue = hasDeadline ? new Date(dlYear, dlMonth, dlDay).toISOString() : undefined;
    let next: SavingsGoal[];
    if (goalDraft.id) {
      next = initialGoals.map(g => g.id === goalDraft.id ? { ...g, name, target, current, deadline: deadlineValue } : g);
    } else {
      next = [...initialGoals, { id: `${Date.now()}`, name, target, current, deadline: deadlineValue }];
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

  const handleExpiredGoals = async (expired: SavingsGoal[]) => {
    const amountToAdd = expired.reduce((sum, g) => sum + g.current, 0);
    const remaining = initialGoals.filter(g => !expired.some(e => e.id === g.id));
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ total_savings: totalSavings + amountToAdd })
      .eq('id', user!.id);
    if (profileErr) return;
    const { error: metaErr } = await supabase.auth.updateUser({ data: { savings_goals: remaining } });
    if (!metaErr) {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      showNotification(
        amountToAdd > 0
          ? `${expired.length} goal${expired.length > 1 ? 's' : ''} expired — ${format(amountToAdd)} added to savings`
          : `${expired.length} expired goal${expired.length > 1 ? 's' : ''} cleared`,
        'success'
      );
    }
  };

  const processMonthlyLeftover = async () => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    const lastProcessed = user?.user_metadata?.last_savings_month as string | undefined;
    if (lastProcessed === prevMonthKey) return;
    const startOfPrev = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
    const endOfPrev = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0, 23, 59, 59, 999);
    const { data: lastMonthExpenses } = await supabase
      .from('expenses')
      .select('amount, category')
      .eq('user_id', user!.id)
      .gte('created_at', startOfPrev.toISOString())
      .lte('created_at', endOfPrev.toISOString());
    await supabase.auth.updateUser({ data: { last_savings_month: prevMonthKey } });
    if (!lastMonthExpenses) return;
    const spent = lastMonthExpenses
      .filter(e => e.category !== INCOME_CATEGORY)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const leftover = monthlyBudget - spent;
    if (leftover <= 0) return;
    const { error } = await supabase
      .from('profiles')
      .update({ total_savings: totalSavings + leftover })
      .eq('id', user!.id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      showNotification(`Last month's leftover ${format(leftover)} moved to savings`, 'success');
    }
  };

  useEffect(() => {
    if (didProcessMonthly.current || !user?.id || !profile) return;
    didProcessMonthly.current = true;
    processMonthlyLeftover();
  }, [user?.id, !!profile]);

  const goalsKey = initialGoals.map(g => `${g.id}:${g.deadline ?? ''}`).join(',');
  useEffect(() => {
    if (didAutoProcess.current || !initialGoals.length || !user?.id) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expired = initialGoals.filter(g => {
      if (!g.deadline) return false;
      const dl = new Date(g.deadline);
      dl.setHours(0, 0, 0, 0);
      return dl < today;
    });
    didAutoProcess.current = true;
    if (!expired.length) return;
    handleExpiredGoals(expired);
  }, [goalsKey, user?.id]);

  const persistLoans = async (loans: Loan[]) => {
    setSavingLoan(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { loans } });
      if (error) throw error;
      return true;
    } catch (e: any) {
      showNotification(e.message || 'Could not save loan', 'error');
      return false;
    } finally {
      setSavingLoan(false);
    }
  };

  const handleSaveLoanDraft = async () => {
    if (!loanDraft) return;
    const person = loanDraft.person.trim();
    const amount = Number(loanDraft.amount);
    const paid = Number(loanDraft.paid) || 0;
    if (!person || isNaN(amount) || amount <= 0) {
      showNotification('Person name and amount required', 'error');
      return;
    }
    const due_date = loanDraft.hasDueDate
      ? new Date(loanDraft.dlYear, loanDraft.dlMonth, loanDraft.dlDay).toISOString()
      : undefined;
    const source = loanDraft.source || undefined;
    let next: Loan[];
    if (loanDraft.id) {
      next = initialLoans.map(l => l.id === loanDraft.id
        ? { ...l, person, amount, paid, description: loanDraft.description || undefined, due_date, type: loanDraft.type, source }
        : l);
    } else {
      next = [...initialLoans, {
        id: `${Date.now()}`, type: loanDraft.type, person, amount, paid,
        description: loanDraft.description || undefined,
        date: new Date().toISOString(), due_date, status: 'active', source,
      }];
      // Auto-record in expenses: lent = expense out, borrowed = income in
      if (loanDraft.type === 'lent') {
        addExpense({ amount, description: `Lent to ${person}`, category: 'Lending', source });
      } else {
        addExpense({ amount, description: `Borrowed from ${person}`, category: INCOME_CATEGORY, source });
      }
    }
    const ok = await persistLoans(next);
    if (ok) {
      const action = loanDraft.id ? 'updated' : (loanDraft.type === 'lent' ? 'Lent' : 'Borrowed');
      const msg = loanDraft.id
        ? `Loan with ${person} updated`
        : `${action} ${format(amount)} ${loanDraft.type === 'lent' ? 'to' : 'from'} ${person}`;
      showNotification(msg, 'success', true);
      setLoanDraft(null);
    }
  };

  const handleDeleteLoan = async () => {
    if (!loanDraft?.id) return;
    const next = initialLoans.filter(l => l.id !== loanDraft.id);
    const ok = await persistLoans(next);
    if (ok) { showNotification(`Loan with ${loanDraft.person} removed`, 'info', true); setLoanDraft(null); }
  };

  const handleSettleLoan = async (id: string) => {
    const loan = initialLoans.find(l => l.id === id);
    if (!loan) return;
    const next = initialLoans.map(l => l.id === id ? { ...l, paid: l.amount, status: 'settled' as const } : l);
    await persistLoans(next);
    const unpaid = loan.amount - loan.paid;
    if (unpaid > 0) {
      if (loan.type === 'lent') {
        addExpense({ amount: unpaid, description: `${loan.person} repaid loan`, category: INCOME_CATEGORY, source: loan.source });
      } else {
        addExpense({ amount: unpaid, description: `Repaid loan to ${loan.person}`, category: 'Lending', source: loan.source });
      }
    }
    showNotification(`${loan.type === 'lent' ? `${loan.person} fully paid back` : `You settled debt with ${loan.person}`} — ${format(loan.amount)}`, 'success', true);
  };

  const handlePartialPayment = async (id: string) => {
    const delta = Number(partialAmounts[id] || 0);
    if (!delta) return;
    const loan = initialLoans.find(l => l.id === id);
    if (!loan) return;
    const newPaid = Math.min(loan.amount, loan.paid + delta);
    const settled = newPaid >= loan.amount;
    const next = initialLoans.map(l => l.id === id
      ? { ...l, paid: newPaid, status: settled ? 'settled' as const : 'active' as const }
      : l);
    await persistLoans(next);
    const actualDelta = newPaid - loan.paid;
    if (actualDelta > 0) {
      if (loan.type === 'lent') {
        addExpense({ amount: actualDelta, description: settled ? `${loan.person} fully repaid` : `${loan.person} partial repayment`, category: INCOME_CATEGORY, source: loan.source });
      } else {
        addExpense({ amount: actualDelta, description: settled ? `Fully repaid ${loan.person}` : `Partial repayment to ${loan.person}`, category: 'Lending', source: loan.source });
      }
    }
    setPartialAmounts(prev => ({ ...prev, [id]: '' }));
    const msg = settled
      ? `${loan.type === 'lent' ? `${loan.person} fully paid back` : `Debt with ${loan.person} settled`} — ${format(loan.amount)}`
      : `${format(delta)} paid ${loan.type === 'lent' ? `by ${loan.person}` : `toward ${loan.person}`} · ${format(loan.amount - newPaid)} remaining`;
    showNotification(msg, settled ? 'success' : 'info', true);
  };

  const progressPct = Math.max(0, Math.min(100, (savingsThisMonth / (savingsGoal || 1)) * 100));

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          className="px-6"
          contentContainerStyle={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 24 : 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />}
        >
          <View className="mb-6 mt-1">
            <Text className="text-3xl font-bold text-white tracking-tight">Savings Vault</Text>
            <Text className="text-emerald-400 mt-1 text-[11px] font-semibold tracking-widest uppercase">Wealth Builder</Text>
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
              <Text className="text-stone-500 text-sm font-semibold mr-3">{symbol}</Text>
              <TextInput
                className="flex-1 text-emerald-400 text-sm font-bold tracking-tight"
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

          {/* Saving Goals */}
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
                      <View className="flex-row items-center flex-1 mr-2">
                        <Text className="text-white text-sm font-semibold" numberOfLines={1}>{g.name}</Text>
                        {done && <Text className="text-emerald-400 text-xs ml-2">✓</Text>}
                      </View>
                      <Text className="text-stone-300 text-sm font-bold">{format(g.current)} / {format(g.target)}</Text>
                    </View>
                    <View className="h-2 bg-black rounded-full overflow-hidden mb-3">
                      <View className={`h-full rounded-full ${done ? 'bg-emerald-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                    </View>
                    <View className="flex-row justify-between items-center">
                      <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest flex-1 mr-3">
                        {Math.round(pct)}%{deadline ? ` · By ${deadline.toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}
                      </Text>
                      <View className="flex-row items-center bg-stone-900 border border-stone-800 rounded-xl px-2 py-1.5">
                        <TouchableOpacity
                          onPress={() => handleContribute(g.id, -Number(contributeAmounts[g.id] || 100))}
                          className="w-6 h-6 rounded-lg bg-stone-800 items-center justify-center"
                        >
                          <FontAwesome name="minus" size={8} color="#a8a29e" />
                        </TouchableOpacity>
                        <TextInput
                          value={contributeAmounts[g.id] ?? '100'}
                          onChangeText={v => setContributeAmounts(prev => ({ ...prev, [g.id]: v.replace(/[^0-9]/g, '') }))}
                          keyboardType="numeric"
                          style={{ width: 44 }}
                          className="text-white text-xs text-center mx-1.5 py-0"
                        />
                        <TouchableOpacity
                          onPress={() => handleContribute(g.id, Number(contributeAmounts[g.id] || 100))}
                          className="w-6 h-6 rounded-lg bg-emerald-500/20 items-center justify-center"
                        >
                          <FontAwesome name="plus" size={8} color="#34d399" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            {initialGoals.length > 0 && (
              <Text className="text-stone-600 text-[10px] text-center mt-2 uppercase tracking-widest">Tap goal to edit · Enter amount then +/−</Text>
            )}
          </View>

          {/* Lending */}
          {(() => {
            const activeLoans = initialLoans.filter(l => l.status === 'active');
            const totalLent = activeLoans.filter(l => l.type === 'lent').reduce((s, l) => s + (l.amount - l.paid), 0);
            const totalBorrowed = activeLoans.filter(l => l.type === 'borrowed').reduce((s, l) => s + (l.amount - l.paid), 0);
            return (
              <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-5">
                <SectionTitle
                  icon="exchange"
                  label="Lending"
                  color="#818cf8"
                  right={(
                    <TouchableOpacity onPress={() => setLoanDraft(EMPTY_LOAN_DRAFT)} className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                      <Text className="text-emerald-400 text-[11px] font-semibold uppercase tracking-wider">+ Add</Text>
                    </TouchableOpacity>
                  )}
                />

                {initialLoans.length === 0 ? (
                  <View className="py-6 items-center">
                    <View className="w-14 h-14 bg-stone-800/50 rounded-2xl items-center justify-center mb-3">
                      <FontAwesome name="handshake-o" size={20} color="#52525b" />
                    </View>
                    <Text className="text-stone-400 text-sm font-semibold text-center">No loans tracked</Text>
                    <Text className="text-stone-600 text-[11px] text-center mt-1.5 uppercase tracking-widest">Track money lent or borrowed</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setShowLoansList(true)} activeOpacity={0.7}>
                    <View className="flex-row gap-3 mb-3">
                      {totalLent > 0 ? (
                        <View className="flex-1 bg-emerald-900/20 border border-emerald-900/40 rounded-2xl p-3">
                          <Text className="text-emerald-500/70 text-[10px] font-semibold uppercase tracking-widest mb-1">You're Owed</Text>
                          <Text className="text-emerald-400 text-base font-bold">{format(totalLent)}</Text>
                        </View>
                      ) : null}
                      {totalBorrowed > 0 ? (
                        <View className="flex-1 bg-rose-900/20 border border-rose-900/40 rounded-2xl p-3">
                          <Text className="text-rose-500/70 text-[10px] font-semibold uppercase tracking-widest mb-1">You Owe</Text>
                          <Text className="text-rose-400 text-base font-bold">{format(totalBorrowed)}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View className="flex-row items-center justify-center py-1.5 bg-black/30 rounded-xl border border-stone-800">
                      <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mr-2">
                        {activeLoans.length} active · {initialLoans.length - activeLoans.length} settled
                      </Text>
                      <FontAwesome name="chevron-right" size={9} color="#57534e" />
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Goal Editor Modal */}
      <Modal visible={!!goalDraft} animationType="slide" transparent={true} onRequestClose={() => setGoalDraft(null)}>
        <Pressable onPress={() => setGoalDraft(null)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <Pressable onPress={() => {}} className="bg-stone-900 rounded-t-3xl border-t border-stone-800" style={{ maxHeight: '75%' }}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 24, paddingBottom: 36 }}
                showsVerticalScrollIndicator={false}
              >
            <TouchableOpacity onPress={() => setGoalDraft(null)} activeOpacity={0.6} className="self-center mb-6 py-2 px-8">
              <View className="w-12 h-1.5 bg-stone-700 rounded-full" />
            </TouchableOpacity>
            <Text className="text-base font-bold text-white tracking-tight mb-1">{goalDraft?.id ? 'Edit Goal' : 'New Goal'}</Text>
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
              <Text className="text-stone-500 text-sm font-semibold mr-3">{symbol}</Text>
              <TextInput
                placeholder="0"
                placeholderTextColor="#78716c"
                keyboardType="numeric"
                value={goalDraft?.target || ''}
                onChangeText={v => setGoalDraft(d => d && { ...d, target: v })}
                className="flex-1 text-white text-sm font-bold"
              />
            </View>

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Current Saved</Text>
            <View className="flex-row items-center bg-black rounded-2xl px-4 py-3 border border-stone-800 mb-3">
              <Text className="text-stone-500 text-sm font-semibold mr-3">{symbol}</Text>
              <TextInput
                placeholder="0"
                placeholderTextColor="#78716c"
                keyboardType="numeric"
                value={goalDraft?.current || ''}
                onChangeText={v => setGoalDraft(d => d && { ...d, current: v })}
                className="flex-1 text-white text-sm font-bold"
              />
            </View>

            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest ml-1">Set Deadline</Text>
              <Switch
                value={hasDeadline}
                onValueChange={setHasDeadline}
                trackColor={{ false: '#292524', true: '#059669' }}
                thumbColor={hasDeadline ? '#34d399' : '#78716c'}
              />
            </View>

            {hasDeadline && (
              <>
                <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Month</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                  {monthNames.map((m, idx) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => {
                        setDlMonth(idx);
                        const maxDay = new Date(dlYear, idx + 1, 0).getDate();
                        if (dlDay > maxDay) setDlDay(maxDay);
                      }}
                      className={`px-3.5 py-2 mr-2 rounded-full border ${dlMonth === idx ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}
                    >
                      <Text className={`text-xs font-semibold uppercase tracking-wider ${dlMonth === idx ? 'text-white' : 'text-stone-500'}`}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Day</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
                  {Array.from({ length: new Date(dlYear, dlMonth + 1, 0).getDate() }, (_, i) => i + 1).map(d => (
                    <TouchableOpacity
                      key={d}
                      onPress={() => setDlDay(d)}
                      className={`w-10 h-10 mr-1.5 rounded-full items-center justify-center border ${dlDay === d ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}
                    >
                      <Text className={`text-xs font-semibold ${dlDay === d ? 'text-white' : 'text-stone-500'}`}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {!hasDeadline && <View className="mb-5" />}

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
          </Pressable>
        </Pressable>
      </Modal>

      {/* Loans List Modal */}
      <Modal visible={showLoansList} animationType="slide" transparent={false} onRequestClose={() => setShowLoansList(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#292524' }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 }}>Loans</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => setLoanDraft(EMPTY_LOAN_DRAFT)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'rgba(52,211,153,0.1)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)', borderRadius: 20 }}
              >
                <Text style={{ color: '#34d399', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>+ Add</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowLoansList(false)}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#1c1917', borderWidth: 1, borderColor: '#292524', alignItems: 'center', justifyContent: 'center' }}
              >
                <FontAwesome name="times" size={14} color="#a8a29e" />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
            {initialLoans.length === 0 ? (
              <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                <FontAwesome name="handshake-o" size={28} color="#52525b" />
                <Text style={{ color: '#78716c', fontSize: 14, fontWeight: '600', marginTop: 12 }}>No loans yet</Text>
              </View>
            ) : (
              initialLoans.map(loan => {
                const today2 = new Date(); today2.setHours(0,0,0,0);
                const remaining = loan.amount - loan.paid;
                const pct = Math.min(100, (loan.paid / Math.max(loan.amount, 1)) * 100);
                const isLent = loan.type === 'lent';
                const dueDate = loan.due_date ? new Date(loan.due_date) : null;
                const overdue = dueDate ? dueDate < today2 : false;
                const settled = loan.status === 'settled';
                return (
                  <View key={loan.id} style={{ backgroundColor: settled ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: settled ? '#292524' : '#292524', borderRadius: 20, padding: 16, marginBottom: 12, opacity: settled ? 0.55 : 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isLent ? '#34d399' : '#f43f5e' }} />
                          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{loan.person}</Text>
                          {overdue && !settled && (
                            <View style={{ backgroundColor: 'rgba(244,63,94,0.2)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.3)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ color: '#f43f5e', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>Overdue</Text>
                            </View>
                          )}
                          {settled && (
                            <View style={{ backgroundColor: '#292524', borderWidth: 1, borderColor: '#44403c', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ color: '#78716c', fontSize: 9, fontWeight: '600', textTransform: 'uppercase' }}>Settled</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ color: '#78716c', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {isLent ? 'Lent to' : 'Borrowed from'} · {dueDate ? `Due ${dueDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No due date'}
                        </Text>
                        {loan.description ? <Text style={{ color: '#57534e', fontSize: 10, marginTop: 2 }} numberOfLines={1}>{loan.description}</Text> : null}
                        {loan.source ? <Text style={{ color: '#44403c', fontSize: 10, marginTop: 1 }}>{loan.source}</Text> : null}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: isLent ? '#34d399' : '#f87171', fontSize: 14, fontWeight: '700' }}>{format(remaining)}</Text>
                        <Text style={{ color: '#57534e', fontSize: 10 }}>of {format(loan.amount)}</Text>
                      </View>
                    </View>
                    <View style={{ height: 4, backgroundColor: '#1c1917', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
                      <View style={{ height: '100%', borderRadius: 2, backgroundColor: isLent ? '#10b981' : '#f43f5e', width: `${pct}%` }} />
                    </View>
                    {!settled && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c1917', borderWidth: 1, borderColor: '#292524', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                          <Text style={{ color: '#57534e', fontSize: 12, marginRight: 4 }}>{symbol}</Text>
                          <TextInput
                            value={partialAmounts[loan.id] ?? ''}
                            onChangeText={v => setPartialAmounts(prev => ({ ...prev, [loan.id]: v.replace(/[^0-9]/g, '') }))}
                            keyboardType="numeric"
                            placeholder="Amount paid"
                            placeholderTextColor="#57534e"
                            style={{ flex: 1, color: '#fff', fontSize: 12 }}
                          />
                        </View>
                        <TouchableOpacity
                          onPress={() => handlePartialPayment(loan.id)}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#292524', borderWidth: 1, borderColor: '#44403c', borderRadius: 12 }}
                        >
                          <Text style={{ color: '#d6d3d1', fontSize: 11, fontWeight: '600' }}>Pay</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSettleLoan(loan.id)}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: isLent ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)', borderWidth: 1, borderColor: isLent ? 'rgba(16,185,129,0.4)' : 'rgba(244,63,94,0.4)', borderRadius: 12 }}
                        >
                          <Text style={{ color: isLent ? '#34d399' : '#f87171', fontSize: 11, fontWeight: '600' }}>Settle</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setLoanDraft({ id: loan.id, type: loan.type, person: loan.person, amount: String(loan.amount), paid: String(loan.paid), description: loan.description || '', hasDueDate: !!loan.due_date, dlYear: loan.due_date ? new Date(loan.due_date).getFullYear() : new Date().getFullYear(), dlMonth: loan.due_date ? new Date(loan.due_date).getMonth() : new Date().getMonth(), dlDay: loan.due_date ? new Date(loan.due_date).getDate() : new Date().getDate(), source: loan.source || '' })}
                          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1917', borderWidth: 1, borderColor: '#292524', borderRadius: 10 }}
                        >
                          <FontAwesome name="pencil" size={12} color="#78716c" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Loan Editor Modal */}
      <Modal visible={!!loanDraft} animationType="slide" transparent={false} onRequestClose={() => setLoanDraft(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#292524' }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 }}>
              {loanDraft?.id ? 'Edit Loan' : 'New Loan'}
            </Text>
            <TouchableOpacity
              onPress={() => setLoanDraft(null)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#1c1917', borderWidth: 1, borderColor: '#292524', alignItems: 'center', justifyContent: 'center' }}
            >
              <FontAwesome name="times" size={14} color="#a8a29e" />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 56 }} showsVerticalScrollIndicator={false}>
            <Text style={{ color: '#78716c', fontSize: 13, marginBottom: 20 }}>Track money lent or borrowed</Text>

              {/* Type toggle */}
              <View className="flex-row bg-black rounded-full p-1 border border-stone-800 mb-4">
                <TouchableOpacity
                  onPress={() => setLoanDraft(d => d && { ...d, type: 'lent' })}
                  className={`flex-1 py-2.5 rounded-full items-center ${loanDraft?.type === 'lent' ? 'bg-emerald-600' : ''}`}
                >
                  <Text className={`text-xs font-bold uppercase tracking-wider ${loanDraft?.type === 'lent' ? 'text-white' : 'text-stone-500'}`}>
                    I Lent Money
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setLoanDraft(d => d && { ...d, type: 'borrowed' })}
                  className={`flex-1 py-2.5 rounded-full items-center ${loanDraft?.type === 'borrowed' ? 'bg-rose-600' : ''}`}
                >
                  <Text className={`text-xs font-bold uppercase tracking-wider ${loanDraft?.type === 'borrowed' ? 'text-white' : 'text-stone-500'}`}>
                    I Borrowed
                  </Text>
                </TouchableOpacity>
              </View>

              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
                {loanDraft?.type === 'lent' ? 'Lent To' : 'Borrowed From'}
              </Text>
              <TextInput
                placeholder="Person's name"
                placeholderTextColor="#78716c"
                value={loanDraft?.person || ''}
                onChangeText={v => setLoanDraft(d => d && { ...d, person: v })}
                className="bg-black text-white text-sm px-4 py-3.5 rounded-2xl border border-stone-800 mb-3"
              />

              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Amount</Text>
              <View className="flex-row items-center bg-black rounded-2xl px-4 py-3 border border-stone-800 mb-3">
                <Text className="text-stone-500 text-sm font-semibold mr-3">{symbol}</Text>
                <TextInput
                  placeholder="0"
                  placeholderTextColor="#78716c"
                  keyboardType="numeric"
                  value={loanDraft?.amount || ''}
                  onChangeText={v => setLoanDraft(d => d && { ...d, amount: v })}
                  className="flex-1 text-white text-sm font-bold"
                />
              </View>

              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Already Paid Back</Text>
              <View className="flex-row items-center bg-black rounded-2xl px-4 py-3 border border-stone-800 mb-3">
                <Text className="text-stone-500 text-sm font-semibold mr-3">{symbol}</Text>
                <TextInput
                  placeholder="0"
                  placeholderTextColor="#78716c"
                  keyboardType="numeric"
                  value={loanDraft?.paid || ''}
                  onChangeText={v => setLoanDraft(d => d && { ...d, paid: v })}
                  className="flex-1 text-white text-sm font-bold"
                />
              </View>

              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Description (optional)</Text>
              <TextInput
                placeholder="e.g. Rent share, groceries..."
                placeholderTextColor="#78716c"
                value={loanDraft?.description || ''}
                onChangeText={v => setLoanDraft(d => d && { ...d, description: v })}
                className="bg-black text-white text-sm px-4 py-3.5 rounded-2xl border border-stone-800 mb-3"
              />

              {savedSources.length > 0 && (
                <>
                  <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Source (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                    {savedSources.map(src => (
                      <TouchableOpacity
                        key={src}
                        onPress={() => setLoanDraft(d => d && { ...d, source: d.source === src ? '' : src })}
                        className={`px-3.5 py-2 mr-2 rounded-full border ${loanDraft?.source === src ? 'bg-stone-600 border-stone-500' : 'bg-black border-stone-800'}`}
                      >
                        <Text className={`text-xs font-semibold uppercase tracking-wider ${loanDraft?.source === src ? 'text-white' : 'text-stone-500'}`}>{src}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest ml-1">Set Due Date</Text>
                <Switch
                  value={loanDraft?.hasDueDate || false}
                  onValueChange={v => setLoanDraft(d => d && { ...d, hasDueDate: v })}
                  trackColor={{ false: '#292524', true: '#059669' }}
                  thumbColor={loanDraft?.hasDueDate ? '#34d399' : '#78716c'}
                />
              </View>
              {loanDraft?.hasDueDate && (
                <>
                  <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Month</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                    {monthNames.map((m, idx) => (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setLoanDraft(d => d && { ...d, dlMonth: idx })}
                        className={`px-3.5 py-2 mr-2 rounded-full border ${loanDraft.dlMonth === idx ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}
                      >
                        <Text className={`text-xs font-semibold uppercase tracking-wider ${loanDraft.dlMonth === idx ? 'text-white' : 'text-stone-500'}`}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Day</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
                    {Array.from({ length: new Date(loanDraft.dlYear, loanDraft.dlMonth + 1, 0).getDate() }, (_, i) => i + 1).map(d => (
                      <TouchableOpacity
                        key={d}
                        onPress={() => setLoanDraft(ld => ld && { ...ld, dlDay: d })}
                        className={`w-10 h-10 mr-1.5 rounded-full items-center justify-center border ${loanDraft.dlDay === d ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}
                      >
                        <Text className={`text-xs font-semibold ${loanDraft.dlDay === d ? 'text-white' : 'text-stone-500'}`}>{d}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <View className="flex-row gap-3">
                {loanDraft?.id && (
                  <TouchableOpacity onPress={handleDeleteLoan} className="py-4 px-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 items-center">
                    <FontAwesome name="trash" size={14} color="#f43f5e" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setLoanDraft(null)} className="flex-1 py-4 rounded-2xl bg-stone-800 items-center">
                  <Text className="text-white text-sm font-semibold uppercase tracking-wider">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveLoanDraft} disabled={savingLoan} className="flex-1 py-4 rounded-2xl bg-emerald-600 items-center active:bg-emerald-500">
                  {savingLoan ? <ActivityIndicator color="white" /> : <Text className="text-white text-sm font-bold uppercase tracking-wider">{loanDraft?.id ? 'Update' : 'Add'}</Text>}
                </TouchableOpacity>
              </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
