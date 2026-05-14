import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useExpenseSync } from '../../hooks/useExpenseSync';
import { SafeAreaView } from 'react-native-safe-area-context';

// Fixed User ID for testing without auth
const TEST_USER_ID = 'test-pk-user-777';

// Helper for currency
const formatPKR = (amount: number) => `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;

export default function Dashboard() {
  const { expenses, weeklyExpenses, metrics, addExpense, updateBudget, updateSavingsGoal, isAdding } = useExpenseSync(TEST_USER_ID);
  const { leftoverBudget, burnRate, totalSavings, weeklyBudget, monthlyBudget, savingsThisMonth, savingsGoal } = metrics;
  
  const [newBudget, setNewBudget] = useState(monthlyBudget.toString());
  const [newGoal, setNewGoal] = useState(savingsGoal.toString());
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  
  // State for editable amounts
  const [mealAmounts, setMealAmounts] = useState({ Breakfast: '250', Lunch: '450', Dinner: '750' });
  const [commuteAmounts, setCommuteAmounts] = useState({ 'To Office': '150', 'To Home': '150' });

  // Custom expense state
  const [customExpense, setCustomExpense] = useState({ description: '', amount: '', category: 'Misc' });

  useEffect(() => {
    setNewBudget(monthlyBudget.toString());
    setNewGoal(savingsGoal.toString());
  }, [monthlyBudget, savingsGoal]);

  const budgetPercentage = Math.max(0, Math.min(100, (leftoverBudget / (weeklyBudget + 1)) * 100));

  // Analytics for Weekend Spending
  const weekendExpenses = expenses.filter(e => e.is_weekend);
  const weekendTotal = weekendExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  // Group current week expenses by day for the chart
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekData = new Array(7).fill(0);
  weeklyExpenses.forEach(exp => {
    if (exp.created_at) {
      const day = new Date(exp.created_at).getDay();
      weekData[day] += Number(exp.amount);
    }
  });
  const maxExpense = Math.max(...weekData, 1);

  // Handlers
  const handleCommute = (direction: 'To Office' | 'To Home') => {
    const amount = Number(commuteAmounts[direction]) || 0;
    if (amount > 0) {
      addExpense({ amount, description: `Commute: ${direction}`, category: 'Commute' });
    }
  };

  const handleEating = (meal: 'Breakfast' | 'Lunch' | 'Dinner') => {
    const amount = Number(mealAmounts[meal]) || 0;
    if (amount > 0) {
      addExpense({ amount, description: meal, category: 'Food' });
    }
  };

  const handleCustomExpense = () => {
    if (customExpense.description && customExpense.amount) {
      addExpense({ 
        description: customExpense.description, 
        amount: Number(customExpense.amount), 
        category: customExpense.category 
      });
      setCustomExpense({ description: '', amount: '', category: 'Misc' });
    }
  };

  const handleSaveBudget = () => {
    updateBudget(Number(newBudget));
    updateSavingsGoal(Number(newGoal));
    setShowBudgetModal(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView className="px-6 py-4">
        
        {/* Header with Settings Toggle */}
        <View className="flex-row justify-between items-center mb-8 mt-2">
          <View>
            <Text className="text-4xl font-black text-white tracking-tighter">Hyper Wallet</Text>
            <Text className="text-indigo-400 font-bold mt-1 text-xs tracking-widest uppercase">Smart Tracking</Text>
          </View>
          <TouchableOpacity 
            onPress={() => {
              setNewBudget(monthlyBudget.toString());
              setNewGoal(savingsGoal.toString());
              setShowBudgetModal(true);
            }}
            className="bg-indigo-500/10 px-4 py-2 rounded-full border border-indigo-500/30"
          >
            <Text className="text-indigo-400 font-bold text-xs uppercase tracking-wider">Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Savings Snapshot */}
        <View className="bg-stone-900/80 rounded-[32px] p-6 mb-8 border border-emerald-500/20 shadow-xl backdrop-blur-lg">
           <View className="flex-row justify-between items-center mb-2">
             <Text className="text-emerald-500/70 text-[10px] font-bold uppercase tracking-widest">Savings This Month</Text>
             <View className="bg-emerald-500/10 px-2 py-1 rounded-full">
               <Text className="text-emerald-400 text-[10px] font-black uppercase">Goal: {formatPKR(savingsGoal)}</Text>
             </View>
           </View>
           <Text className="text-4xl font-black text-emerald-400 mb-2 tracking-tighter">{formatPKR(savingsThisMonth)}</Text>
           <View className="h-2 bg-black/40 rounded-full overflow-hidden mt-2 mb-1 border border-stone-800">
             <View className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, Math.max(0, (savingsThisMonth / savingsGoal) * 100))}%` }} />
           </View>
        </View>

        {/* Current Weekly Wallet Engine */}
        <View className="bg-gradient-to-br from-indigo-500 to-purple-700 bg-indigo-600 rounded-[32px] p-6 mb-8 shadow-2xl shadow-indigo-500/30">
          <View className="flex-row justify-between items-end mb-4">
            <View>
              <Text className="text-indigo-100/70 text-xs font-black uppercase tracking-widest mb-1">Weekly Leftover</Text>
              <Text className="text-5xl font-black text-white tracking-tighter">
                {formatPKR(leftoverBudget)}
              </Text>
            </View>
            <View className="items-end bg-black/20 px-4 py-2 rounded-full backdrop-blur-md">
              <Text className="text-white text-xs font-bold tracking-wider">{leftoverBudget > 0 ? 'ON TRACK' : 'DEFICIT'}</Text>
            </View>
          </View>
          
          <View className="h-3 bg-black/20 rounded-full mb-6 overflow-hidden">
            <View 
              className="h-full bg-white rounded-full" 
              style={{ width: `${budgetPercentage}%` }} 
            />
          </View>

          <View className="flex-row justify-between bg-black/10 rounded-2xl p-4 backdrop-blur-md">
            <View>
              <Text className="text-indigo-100/70 text-[10px] font-black uppercase tracking-wider">Safe Daily Burn</Text>
              <Text className="text-white text-xl font-black mt-1 tracking-tighter">{formatPKR(burnRate)}<Text className="text-xs font-normal text-indigo-200/70">/day</Text></Text>
            </View>
            <View className="items-end">
              <Text className="text-indigo-100/70 text-[10px] font-black uppercase tracking-wider">All-Time Savings</Text>
              <Text className="text-white text-xl font-black mt-1 tracking-tighter">{formatPKR(totalSavings)}</Text>
            </View>
          </View>
        </View>

        {/* Weekly Spending Chart */}
        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-8 shadow-lg">
           <Text className="text-white text-lg font-black mb-4 tracking-tight">Weekly Overview</Text>
           <View className="flex-row justify-between items-end h-32 mt-4">
             {weekData.map((amount, idx) => {
               const height = (amount / maxExpense) * 100;
               return (
                 <View key={idx} className="items-center flex-1">
                   {amount > 0 && <Text className="text-stone-500 text-[8px] font-bold mb-1" numberOfLines={1}>{formatPKR(amount).replace('Rs. ', '')}</Text>}
                   <View className="w-6 bg-stone-800 rounded-t-lg items-end justify-end overflow-hidden" style={{ height: '100%' }}>
                     <View className="w-full bg-indigo-500 rounded-t-lg" style={{ height: `${height}%` }} />
                   </View>
                   <Text className="text-stone-400 text-[10px] font-bold mt-2">{days[idx]}</Text>
                 </View>
               );
             })}
           </View>
        </View>

        {isAdding && (
          <View className="flex-row items-center justify-center mb-6 bg-indigo-500/10 py-3 rounded-full border border-indigo-500/20">
             <ActivityIndicator size="small" color="#818cf8" />
             <Text className="text-indigo-300 ml-3 font-bold text-xs uppercase tracking-widest">Syncing Records...</Text>
          </View>
        )}

        {/* Custom Expense */}
        <View className="mb-8 bg-stone-900 border border-stone-800 rounded-[32px] p-6 shadow-lg">
          <Text className="text-white text-xl font-black mb-4 tracking-tight">Custom Expense</Text>
          <View className="mb-4">
            <TextInput
              placeholder="What did you buy?"
              placeholderTextColor="#78716c"
              value={customExpense.description}
              onChangeText={text => setCustomExpense(prev => ({...prev, description: text}))}
              className="bg-black text-white px-4 py-4 rounded-2xl mb-4 border border-stone-800 font-bold"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
               {['Food', 'Commute', 'Shopping', 'Misc', 'Bills'].map(cat => (
                 <TouchableOpacity 
                   key={cat} 
                   onPress={() => setCustomExpense(prev => ({...prev, category: cat}))}
                   className={`px-4 py-2 mr-2 rounded-full border ${customExpense.category === cat ? 'bg-indigo-600 border-indigo-500' : 'bg-black border-stone-800'}`}
                 >
                   <Text className={`text-xs font-bold uppercase tracking-widest ${customExpense.category === cat ? 'text-white' : 'text-stone-400'}`}>{cat}</Text>
                 </TouchableOpacity>
               ))}
            </ScrollView>
            <View className="flex-row items-center bg-black rounded-2xl px-4 py-4 border border-stone-800">
               <Text className="text-stone-500 font-bold mr-2 text-lg">Rs.</Text>
               <TextInput
                 placeholder="0"
                 placeholderTextColor="#78716c"
                 keyboardType="numeric"
                 value={customExpense.amount}
                 onChangeText={text => setCustomExpense(prev => ({...prev, amount: text}))}
                 className="flex-1 text-white font-black text-xl"
               />
            </View>
          </View>
          <TouchableOpacity onPress={handleCustomExpense} className="bg-indigo-600 py-4 rounded-2xl items-center active:bg-indigo-500 shadow-xl shadow-indigo-600/30">
             <Text className="text-white font-black uppercase tracking-widest text-sm">+ Add Custom Expense</Text>
          </TouchableOpacity>
        </View>

        {/* The Commute Toggle */}
        <View className="mb-8">
          <Text className="text-white text-xl font-black mb-4 tracking-tight">Quick Commute</Text>
          <View className="flex-row">
            {[
              { id: 'To Office', icon: '🏡' },
              { id: 'To Home', icon: '🏢' },
            ].map(commute => (
              <View key={commute.id} className="flex-1 mx-1 bg-stone-900 border border-stone-800 rounded-[24px] py-4 px-4 items-center shadow-lg">
                <Text className="text-3xl mb-3">{commute.icon}</Text>
                <Text className="text-white font-black text-[10px] uppercase tracking-widest text-center mb-2">{commute.id}</Text>
                <View className="flex-row items-center bg-black rounded-lg px-2 py-1 mb-3 border border-stone-800 w-full">
                  <Text className="text-stone-500 text-[10px] mr-1">Rs.</Text>
                  <TextInput 
                    value={commuteAmounts[commute.id as keyof typeof commuteAmounts]}
                    onChangeText={(val) => setCommuteAmounts(prev => ({...prev, [commute.id]: val}))}
                    keyboardType="numeric"
                    className="text-white font-black text-xs flex-1 py-1 text-center"
                  />
                </View>
                <TouchableOpacity 
                  onPress={() => handleCommute(commute.id as keyof typeof commuteAmounts)} 
                  className="bg-indigo-600 w-full py-2 rounded-xl items-center active:bg-indigo-500"
                >
                  <Text className="text-white text-[10px] font-bold uppercase tracking-wider">+ LOG</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Daily Eating Log */}
        <View className="mb-8">
          <Text className="text-white text-xl font-black mb-4 tracking-tight">Food & Dining</Text>
          <View className="flex-row">
            {[
              { id: 'Breakfast', icon: '🍳' },
              { id: 'Lunch', icon: '🍛' },
              { id: 'Dinner', icon: '🍗' },
            ].map(meal => (
              <View key={meal.id} className="flex-1 mx-1 bg-stone-900 border border-stone-800 rounded-[24px] p-4 items-center shadow-lg">
                <Text className="text-3xl mb-2">{meal.icon}</Text>
                <Text className="text-white font-black text-[10px] uppercase tracking-wider mb-3">{meal.id}</Text>
                <View className="flex-row items-center bg-black rounded-lg px-2 py-1 mb-3 border border-stone-800 w-full">
                  <Text className="text-stone-500 text-[10px] mr-1">Rs.</Text>
                  <TextInput 
                    value={mealAmounts[meal.id as keyof typeof mealAmounts]}
                    onChangeText={(val) => setMealAmounts(prev => ({...prev, [meal.id]: val}))}
                    keyboardType="numeric"
                    className="text-white font-black text-xs flex-1 py-1 text-center"
                  />
                </View>
                <TouchableOpacity 
                  onPress={() => handleEating(meal.id as keyof typeof mealAmounts)} 
                  className="bg-indigo-600 w-full py-2 rounded-xl items-center active:bg-indigo-500"
                >
                  <Text className="text-white text-[10px] font-bold uppercase tracking-wider">+ LOG</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Recent Transactions List */}
        <View className="mb-12">
          <View className="flex-row justify-between items-end mb-4">
            <Text className="text-white text-xl font-black tracking-tight">Recent Activity</Text>
            <Text className="text-stone-500 text-xs font-bold uppercase">This Month</Text>
          </View>
          
          {expenses.length === 0 ? (
            <View className="bg-stone-900 border border-stone-800 rounded-3xl p-8 items-center">
              <Text className="text-stone-500 font-bold">No expenses yet. Start tracking!</Text>
            </View>
          ) : (
            expenses.slice(0, 10).map((exp, index) => (
              <View key={exp.id || index} className="flex-row justify-between items-center bg-stone-900/50 p-4 rounded-[20px] mb-3 border border-stone-800">
                 <View className="flex-row items-center flex-1">
                   <View className="w-10 h-10 rounded-full bg-stone-800 items-center justify-center mr-3 border border-stone-700">
                     <Text className="text-lg">
                       {exp.category === 'Food' ? '🍽️' : exp.category === 'Commute' ? '🚗' : exp.category === 'Shopping' ? '🛍️' : '💸'}
                     </Text>
                   </View>
                   <View>
                     <Text className="text-white font-bold text-sm">{exp.description}</Text>
                     <Text className="text-stone-500 text-[10px] uppercase tracking-wider mt-0.5">{exp.category} {exp.is_weekend ? '• WKND' : ''}</Text>
                   </View>
                 </View>
                 <Text className="text-indigo-400 font-black text-sm tracking-tighter">- {formatPKR(exp.amount)}</Text>
              </View>
            ))
          )}
        </View>

        {/* Settings Modal */}
        <Modal visible={showBudgetModal} animationType="slide" transparent={true}>
          <View className="flex-1 justify-end bg-black/80">
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View className="bg-stone-900 rounded-t-[40px] p-8 border-t border-stone-800 shadow-2xl">
              <View className="w-12 h-1.5 bg-stone-800 self-center rounded-full mb-8" />
              <Text className="text-3xl font-black text-white mb-2 tracking-tighter">Settings</Text>
              <Text className="text-stone-400 mb-8 font-bold">Configure your wallet constraints.</Text>
              
              <Text className="text-indigo-400 font-bold text-xs uppercase tracking-widest mb-2 ml-2">Monthly Budget</Text>
              <View className="bg-black/50 rounded-[24px] p-4 border border-stone-800 mb-6 flex-row items-center">
                 <Text className="text-stone-500 font-bold text-2xl ml-2 mr-3">Rs.</Text>
                 <TextInput
                   className="flex-1 text-white text-3xl font-black tracking-tighter"
                   keyboardType="numeric"
                   value={newBudget}
                   onChangeText={setNewBudget}
                 />
              </View>

              <Text className="text-emerald-400 font-bold text-xs uppercase tracking-widest mb-2 ml-2">Savings Goal</Text>
              <View className="bg-black/50 rounded-[24px] p-4 border border-emerald-900/30 mb-8 flex-row items-center">
                 <Text className="text-stone-500 font-bold text-2xl ml-2 mr-3">Rs.</Text>
                 <TextInput
                   className="flex-1 text-emerald-400 text-3xl font-black tracking-tighter"
                   keyboardType="numeric"
                   value={newGoal}
                   onChangeText={setNewGoal}
                 />
              </View>

              <TouchableOpacity onPress={handleSaveBudget} className="bg-indigo-600 py-4 rounded-[24px] items-center shadow-xl shadow-indigo-600/30 mb-4 active:bg-indigo-500">
                 <Text className="text-white font-black text-sm uppercase tracking-widest">Apply Changes</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowBudgetModal(false)} className="py-4 items-center mb-4">
                 <Text className="text-stone-500 font-bold uppercase tracking-widest text-xs">Cancel</Text>
              </TouchableOpacity>
            </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
        
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
