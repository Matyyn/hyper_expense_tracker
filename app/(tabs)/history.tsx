import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, useWindowDimensions, RefreshControl, TextInput } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotification } from '../../components/NotificationProvider';
import { useAuth } from '../../components/AuthProvider';
import { useCurrency } from '../../components/CurrencyProvider';
import { useExpenseSync } from '../../hooks/useExpenseSync';
import { useQueryClient } from '@tanstack/react-query';

type SortMode = 'newest' | 'oldest' | 'highest' | 'lowest';
type FilterCat = 'All' | string;

export default function HistoryScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { allExpenses: expenses, deleteExpense, categoryMap, categories } = useExpenseSync(user?.id);
  const { height } = useWindowDimensions();
  const { showNotification } = useNotification();
  const { format } = useCurrency();

  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [filterCat, setFilterCat] = useState<FilterCat>('All');
  const [search, setSearch] = useState('');

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const allCategories = ['All', ...categories.map(c => c.name)];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter(e => {
      if (filterCat !== 'All' && e.category !== filterCat) return false;
      if (q && !(e.description || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [expenses, filterCat, search]);

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
    showNotification('Synced', 'success');
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView
        className="px-6"
        contentContainerStyle={{ minHeight: height * 0.8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />}
      >
        <View className="mb-5 mt-1">
          <Text className="text-3xl font-bold text-white tracking-tight">History</Text>
          <Text className="text-stone-400 mt-1 text-[11px] font-semibold tracking-widest uppercase">{expenses.length} records this month</Text>
        </View>

        {/* Search */}
        <View className="flex-row items-center bg-stone-900 border border-stone-800 rounded-2xl px-4 py-1 mb-4">
          <FontAwesome name="search" size={13} color="#52525b" />
          <TextInput
            placeholder="Search expenses..."
            placeholderTextColor="#78716c"
            value={search}
            onChangeText={setSearch}
            className="flex-1 text-white text-sm px-3 py-2.5"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} className="w-8 h-8 items-center justify-center">
              <FontAwesome name="close" size={12} color="#78716c" />
            </TouchableOpacity>
          )}
        </View>

        {/* Sort */}
        <View className="mb-4">
          <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Sort By</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {sortOptions.map(opt => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setSortMode(opt.key)}
                className={`px-3.5 py-2 mr-2 rounded-full border ${sortMode === opt.key ? 'bg-emerald-600 border-emerald-500' : 'bg-stone-900 border-stone-800'}`}
              >
                <Text className={`text-xs font-semibold uppercase tracking-wider ${sortMode === opt.key ? 'text-white' : 'text-stone-400'}`}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Filter */}
        <View className="mb-5">
          <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Filter</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {allCategories.map(cat => (
              <TouchableOpacity
                key={cat}
                onPress={() => setFilterCat(cat)}
                className={`px-3.5 py-2 mr-2 rounded-full border ${filterCat === cat ? 'bg-rose-600 border-rose-500' : 'bg-stone-900 border-stone-800'}`}
              >
                <Text className={`text-xs font-semibold uppercase tracking-wider ${filterCat === cat ? 'text-white' : 'text-stone-400'}`}>
                  {cat !== 'All' && categoryMap[cat] ? `${categoryMap[cat].icon} ` : ''}{cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {sorted.length === 0 ? (
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-8 items-center mt-6">
            <View className="w-14 h-14 bg-stone-800/50 rounded-2xl items-center justify-center mb-3">
              <FontAwesome name="inbox" size={20} color="#52525b" />
            </View>
            <Text className="text-stone-400 text-sm font-semibold text-center">No records found</Text>
            <Text className="text-stone-600 text-[11px] text-center mt-1.5 uppercase tracking-widest">Try changing your filters</Text>
          </View>
        ) : (
          Object.entries(grouped).map(([date, items]) => (
            <View key={date} className="mb-5">
              <View className="flex-row justify-between items-center mb-2.5">
                <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest">{date}</Text>
                <Text className="text-stone-600 text-xs font-semibold">{format(items.reduce((s, e) => s + Number(e.amount), 0))}</Text>
              </View>
              {items.map((exp, index) => {
                const isIncome = exp.category === 'Income';
                return (
                  <TouchableOpacity
                    key={exp.id || index}
                    onLongPress={() => requestDelete(exp.id)}
                    delayLongPress={500}
                    className={`flex-row justify-between items-center px-4 py-3 rounded-2xl mb-2 border active:bg-stone-800 ${isIncome ? 'bg-emerald-950/40 border-emerald-500/20' : 'bg-stone-900/60 border-stone-800'}`}
                  >
                    <View className="flex-row items-center flex-1">
                      <View className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${isIncome ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-stone-800'}`}>
                        <Text className="text-base">{categoryMap[exp.category]?.icon || (isIncome ? '💰' : '💸')}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-white text-sm font-semibold" numberOfLines={1}>{exp.description}</Text>
                        <Text className="text-stone-500 text-[11px] uppercase tracking-wider mt-0.5">{exp.category}{exp.is_weekend ? ' • Wknd' : ''}</Text>
                      </View>
                    </View>
                    <Text className={`text-sm font-bold tracking-tight ml-2 ${isIncome ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isIncome ? '+' : '−'} {format(exp.amount)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteModalVisible} transparent={true} animationType="fade">
        <View className="flex-1 justify-center items-center bg-black/80 px-6">
          <View className="bg-stone-900 rounded-3xl p-6 w-full border border-stone-800">
            <View className="w-14 h-14 bg-rose-500/10 rounded-2xl items-center justify-center self-center mb-4 border border-rose-500/20">
              <FontAwesome name="trash" size={20} color="#f43f5e" />
            </View>
            <Text className="text-xl font-bold text-white text-center mb-2 tracking-tight">Delete Expense?</Text>
            <Text className="text-stone-400 text-sm text-center mb-6">This action cannot be undone. The amount will be restored to your budget.</Text>

            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-4 rounded-2xl bg-stone-800 items-center active:bg-stone-700"
                onPress={() => { setDeleteModalVisible(false); setItemToDelete(null); }}
              >
                <Text className="text-white text-sm font-semibold uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-4 rounded-2xl bg-rose-600 items-center active:bg-rose-500"
                onPress={confirmDelete}
              >
                <Text className="text-white text-sm font-bold uppercase tracking-wider">Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
