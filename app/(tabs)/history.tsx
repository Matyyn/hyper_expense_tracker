import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, useWindowDimensions, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotification } from '../../components/NotificationProvider';
import { useAuth } from '../../components/AuthProvider';
import { useExpenseSync } from '../../hooks/useExpenseSync';
import { useQueryClient } from '@tanstack/react-query';

const formatPKR = (amount: number) => `Rs. ${Math.round(amount).toLocaleString('en-PK')}`;

type SortMode = 'newest' | 'oldest' | 'highest' | 'lowest';
type FilterCat = 'All' | string;

export default function HistoryScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { expenses, deleteExpense, categoryMap, categories } = useExpenseSync(user?.id);
  const { height } = useWindowDimensions();
  const { showNotification } = useNotification();

  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [filterCat, setFilterCat] = useState<FilterCat>('All');
  
  // Custom Modal State
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const allCategories = ['All', ...categories.map(c => c.name)];

  const filtered = filterCat === 'All' ? expenses : expenses.filter(e => e.category === filterCat);

  const sorted = [...filtered].sort((a, b) => {
    switch (sortMode) {
      case 'newest': return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      case 'oldest': return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      case 'highest': return Number(b.amount) - Number(a.amount);
      case 'lowest': return Number(a.amount) - Number(b.amount);
      default: return 0;
    }
  });

  const grouped: Record<string, typeof sorted> = {};
  sorted.forEach(exp => {
    const date = exp.created_at ? new Date(exp.created_at).toLocaleDateString('en-PK', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Unknown';
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(exp);
  });

  const requestDelete = (id: string | undefined) => {
    if (!id || id.startsWith('optimistic-')) return;
    setItemToDelete(id);
    setDeleteModalVisible(true);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      deleteExpense(itemToDelete);
      showNotification('Expense deleted successfully', 'success');
      setDeleteModalVisible(false);
      setItemToDelete(null);
    }
  };

  const sortOptions: { key: SortMode; label: string }[] = [
    { key: 'newest', label: 'Newest' },
    { key: 'oldest', label: 'Oldest' },
    { key: 'highest', label: 'Highest' },
    { key: 'lowest', label: 'Lowest' },
  ];

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
          <Text className="text-4xl font-black text-white tracking-tighter">History</Text>
          <Text className="text-stone-400 font-bold mt-1 text-xs tracking-widest uppercase">{expenses.length} records this month</Text>
        </View>

        <View className="mb-4">
          <Text className="text-stone-500 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">Sort By</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {sortOptions.map(opt => (
              <TouchableOpacity key={opt.key} onPress={() => setSortMode(opt.key)}
                className={`px-4 py-2 mr-2 rounded-full border ${sortMode === opt.key ? 'bg-emerald-600 border-emerald-500' : 'bg-stone-900 border-stone-800'}`}>
                <Text className={`text-xs font-bold uppercase tracking-wider ${sortMode === opt.key ? 'text-white' : 'text-stone-400'}`}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View className="mb-6">
          <Text className="text-stone-500 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">Filter</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {allCategories.map(cat => (
              <TouchableOpacity key={cat} onPress={() => setFilterCat(cat)}
                className={`px-4 py-2 mr-2 rounded-full border ${filterCat === cat ? 'bg-rose-600 border-rose-500' : 'bg-stone-900 border-stone-800'}`}>
                <Text className={`text-xs font-bold uppercase tracking-wider ${filterCat === cat ? 'text-white' : 'text-stone-400'}`}>
                  {cat !== 'All' && categoryMap[cat] ? `${categoryMap[cat].icon} ` : ''}{cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {sorted.length === 0 ? (
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-8 items-center mt-8">
            <Text className="text-4xl mb-4">📭</Text>
            <Text className="text-stone-500 font-bold text-center">No records found.</Text>
            <Text className="text-stone-600 text-[10px] text-center mt-2 uppercase tracking-widest">Try changing your filters</Text>
          </View>
        ) : (
          Object.entries(grouped).map(([date, items]) => (
            <View key={date} className="mb-6">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-stone-500 font-bold text-xs uppercase tracking-widest">{date}</Text>
                <Text className="text-stone-600 text-[10px] font-bold">{formatPKR(items.reduce((s, e) => s + Number(e.amount), 0))}</Text>
              </View>
              {items.map((exp, index) => (
                <TouchableOpacity key={exp.id || index} onLongPress={() => requestDelete(exp.id)} delayLongPress={500}
                  className="flex-row justify-between items-center bg-stone-900/50 p-4 rounded-[20px] mb-2 border border-stone-800 active:bg-stone-800">
                  <View className="flex-row items-center flex-1">
                    <View className="w-10 h-10 rounded-full bg-stone-800 items-center justify-center mr-3 border border-stone-700">
                      <Text className="text-lg">{categoryMap[exp.category]?.icon || '💸'}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-white font-bold text-sm">{exp.description}</Text>
                      <Text className="text-stone-500 text-[10px] uppercase tracking-wider mt-0.5">{exp.category} {exp.is_weekend ? '• WKND' : ''}</Text>
                    </View>
                  </View>
                  <View className="items-end">
                    <Text className="text-emerald-400 font-black text-sm tracking-tighter">- {formatPKR(exp.amount)}</Text>
                    <Text className="text-stone-600 text-[8px] mt-1">Hold to delete</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Custom Delete Confirmation Modal */}
      <Modal visible={deleteModalVisible} transparent={true} animationType="fade">
        <View className="flex-1 justify-center items-center bg-black/80 px-6">
          <View className="bg-stone-900 rounded-[32px] p-6 w-full border border-stone-800 shadow-2xl">
            <View className="w-16 h-16 bg-rose-500/10 rounded-full items-center justify-center self-center mb-4 border border-rose-500/20">
              <Text className="text-2xl">🗑️</Text>
            </View>
            <Text className="text-2xl font-black text-white text-center mb-2 tracking-tight">Delete Expense?</Text>
            <Text className="text-stone-400 text-center mb-8 font-medium">This action cannot be undone. The amount will be restored to your budget.</Text>
            
            <View className="flex-row gap-3">
              <TouchableOpacity 
                className="flex-1 py-4 rounded-[20px] bg-stone-800 items-center active:bg-stone-700"
                onPress={() => { setDeleteModalVisible(false); setItemToDelete(null); }}
              >
                <Text className="text-white font-bold tracking-wider uppercase text-xs">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-1 py-4 rounded-[20px] bg-rose-600 items-center shadow-lg shadow-rose-600/30 active:bg-rose-500"
                onPress={confirmDelete}
              >
                <Text className="text-white font-black tracking-wider uppercase text-xs">Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
