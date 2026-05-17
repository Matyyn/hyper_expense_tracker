import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/AuthProvider";
import { useCurrency } from "../../components/CurrencyProvider";
import { useNotification } from "../../components/NotificationProvider";
import { INCOME_CATEGORY, useExpenseSync } from "../../hooks/useExpenseSync";
import { supabase } from "../../lib/supabase";

type SortMode = "newest" | "oldest" | "highest" | "lowest";
type FilterCat = "All" | string;

interface EditDraft {
  id: string;
  description: string;
  amount: string;
  category: string;
}

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default function HistoryScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { deleteExpense, categoryMap, categories } = useExpenseSync(user?.id);
  const { showNotification } = useNotification();
  const { format } = useCurrency();

  // Month navigation state
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const isCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const navigateMonth = (direction: -1 | 1) => {
    let newMonth = viewMonth + direction;
    let newYear = viewYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    }
    if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    // Prevent going past current month
    if (
      newYear > today.getFullYear() ||
      (newYear === today.getFullYear() && newMonth > today.getMonth())
    )
      return;
    // Prevent going back more than 12 months
    const diffMonths =
      (today.getFullYear() - newYear) * 12 + (today.getMonth() - newMonth);
    if (diffMonths > 12) return;
    setViewYear(newYear);
    setViewMonth(newMonth);
  };

  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [filterCat, setFilterCat] = useState<FilterCat>("All");
  const [search, setSearch] = useState("");

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Edit modal state
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

  // Per-month query (separate from useExpenseSync's current-month query)
  const { data: historyExpenses = [], isLoading } = useQuery({
    queryKey: ["expenses-history", user?.id, viewYear, viewMonth],
    queryFn: async () => {
      if (!user?.id) return [];
      const start = new Date(viewYear, viewMonth, 1, 0, 0, 0, 0);
      const end = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59, 999);
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("user_id", user.id)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user?.id,
  });

  const allCategories = ["All", ...categories.map((c) => c.name)];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return historyExpenses.filter((e) => {
      if (filterCat !== "All" && e.category !== filterCat) return false;
      if (q && !(e.description || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [historyExpenses, filterCat, search]);

  const sorted = [...filtered].sort((a, b) => {
    switch (sortMode) {
      case "newest":
        return (
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
        );
      case "oldest":
        return (
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime()
        );
      case "highest":
        return Number(b.amount) - Number(a.amount);
      case "lowest":
        return Number(a.amount) - Number(b.amount);
      default:
        return 0;
    }
  });

  const grouped: Record<string, typeof sorted> = {};
  sorted.forEach((exp) => {
    const date = exp.created_at
      ? new Date(exp.created_at).toLocaleDateString("en-PK", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      : "Unknown";
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(exp);
  });

  const requestDelete = (id: string | undefined) => {
    if (!id || id.startsWith("optimistic-")) return;
    setItemToDelete(id);
    setDeleteModalVisible(true);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      deleteExpense(itemToDelete);
      showNotification("Expense deleted successfully", "success");
      setDeleteModalVisible(false);
      setItemToDelete(null);
      queryClient.invalidateQueries({
        queryKey: ["expenses-history", user?.id, viewYear, viewMonth],
      });
    }
  };

  const openEdit = (exp: any) => {
    setEditDraft({
      id: exp.id,
      description: exp.description || "",
      amount: String(exp.amount),
      category: exp.category || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editDraft || !user?.id) return;
    const amount = Number(editDraft.amount);
    if (isNaN(amount) || amount <= 0) {
      showNotification("Invalid amount", "error");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("expenses")
        .update({
          description: editDraft.description.trim(),
          amount,
          category: editDraft.category,
        })
        .eq("id", editDraft.id);
      if (error) throw error;
      queryClient.invalidateQueries({
        queryKey: ["expenses-history", user.id, viewYear, viewMonth],
      });
      queryClient.invalidateQueries({ queryKey: ["expenses", user.id] });
      showNotification("Expense updated", "success");
      setEditDraft(null);
    } catch (e: any) {
      showNotification(e.message || "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const sortOptions: { key: SortMode; label: string }[] = [
    { key: "newest", label: "Newest" },
    { key: "oldest", label: "Oldest" },
    { key: "highest", label: "Highest" },
    { key: "lowest", label: "Lowest" },
  ];

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({
      queryKey: ["expenses-history", user?.id, viewYear, viewMonth],
    });
    await queryClient.invalidateQueries({ queryKey: ["expenses", user?.id] });
    setRefreshing(false);
    showNotification("Synced", "success");
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView
        className="px-6"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#34d399"
          />
        }
      >
        {/* Title */}
        <View className="mb-2 mt-1">
          <Text className="text-3xl font-bold text-white tracking-tight">
            History
          </Text>
        </View>

        {/* Month Navigation */}
        <View className="flex-row items-center justify-between mb-4 bg-stone-900 border border-stone-800 rounded-2xl px-3 py-2 self-center" style={{ minWidth: 200 }}>
          <TouchableOpacity
            onPress={() => navigateMonth(-1)}
            className="w-9 h-9 items-center justify-center rounded-xl bg-black/40 border border-stone-800 active:bg-stone-800"
          >
            <FontAwesome name="chevron-left" size={12} color="#a8a29e" />
          </TouchableOpacity>
          <Text className="text-white text-sm font-bold tracking-tight flex-1 text-center">
            {monthNames[viewMonth]} {viewYear}
          </Text>
          <TouchableOpacity
            onPress={() => navigateMonth(1)}
            disabled={isCurrentMonth}
            className={`w-9 h-9 items-center justify-center rounded-xl border ${isCurrentMonth ? "bg-black/20 border-stone-800/40" : "bg-black/40 border-stone-800 active:bg-stone-800"}`}
          >
            <FontAwesome
              name="chevron-right"
              size={12}
              color={isCurrentMonth ? "#44403c" : "#a8a29e"}
            />
          </TouchableOpacity>
        </View>

        <Text className="text-stone-400 mb-4 text-[11px] font-semibold tracking-widest uppercase text-center">
          {historyExpenses.length} records
        </Text>

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
            <TouchableOpacity
              onPress={() => setSearch("")}
              className="w-8 h-8 items-center justify-center"
            >
              <FontAwesome name="close" size={12} color="#78716c" />
            </TouchableOpacity>
          )}
        </View>

        {/* Sort */}
        <View className="mb-4">
          <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
            Sort By
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {sortOptions.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setSortMode(opt.key)}
                className={`px-3.5 py-2 mr-2 rounded-full border ${sortMode === opt.key ? "bg-emerald-600 border-emerald-500" : "bg-stone-900 border-stone-800"}`}
              >
                <Text
                  className={`text-xs font-semibold uppercase tracking-wider ${sortMode === opt.key ? "text-white" : "text-stone-400"}`}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Filter */}
        <View className="mb-5">
          <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
            Filter
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {allCategories.map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setFilterCat(cat)}
                className={`px-3.5 py-2 mr-2 rounded-full border ${filterCat === cat ? "bg-rose-600 border-rose-500" : "bg-stone-900 border-stone-800"}`}
              >
                <Text
                  className={`text-xs font-semibold uppercase tracking-wider ${filterCat === cat ? "text-white" : "text-stone-400"}`}
                >
                  {cat !== "All" && categoryMap[cat]
                    ? `${categoryMap[cat].icon} `
                    : ""}
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* List */}
        {isLoading ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#34d399" />
          </View>
        ) : sorted.length === 0 ? (
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-8 items-center mt-6">
            <View className="w-14 h-14 bg-stone-800/50 rounded-2xl items-center justify-center mb-3">
              <FontAwesome name="inbox" size={20} color="#52525b" />
            </View>
            <Text className="text-stone-400 text-sm font-semibold text-center">
              No records found
            </Text>
            <Text className="text-stone-600 text-[11px] text-center mt-1.5 uppercase tracking-widest">
              Try changing your filters
            </Text>
          </View>
        ) : (
          Object.entries(grouped).map(([date, items]) => (
            <View key={date} className="mb-5">
              <View className="flex-row justify-between items-center mb-2.5">
                <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest">
                  {date}
                </Text>
                <Text className="text-stone-600 text-xs font-semibold">
                  {format(items.reduce((s, e) => s + Number(e.amount), 0))}
                </Text>
              </View>
              {items.map((exp, index) => {
                const isIncome = exp.category === INCOME_CATEGORY;
                return (
                  <TouchableOpacity
                    key={exp.id || index}
                    onPress={() => openEdit(exp)}
                    onLongPress={() => requestDelete(exp.id)}
                    delayLongPress={500}
                    className={`flex-row justify-between items-center px-4 py-3 rounded-2xl mb-2 border active:bg-stone-800 ${isIncome ? "bg-emerald-950/40 border-emerald-500/20" : "bg-stone-900/60 border-stone-800"}`}
                  >
                    <View className="flex-row items-center flex-1">
                      <View
                        className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${isIncome ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-stone-800"}`}
                      >
                        <Text className="text-base">
                          {categoryMap[exp.category]?.icon ||
                            (isIncome ? "💰" : "💸")}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text
                          className="text-white text-sm font-semibold"
                          numberOfLines={1}
                        >
                          {exp.description}
                        </Text>
                        <Text className="text-stone-500 text-[11px] uppercase tracking-wider mt-0.5">
                          {exp.category}
                          {exp.is_weekend ? " · Wknd" : ""}
                        </Text>
                      </View>
                    </View>
                    <Text
                      className={`text-sm font-bold tracking-tight ml-2 ${isIncome ? "text-emerald-400" : "text-rose-400"}`}
                    >
                      {isIncome ? "+" : "−"} {format(exp.amount)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}

        {sorted.length > 0 && (
          <Text className="text-stone-600 text-[10px] text-center mt-2 uppercase tracking-widest">
            Tap to edit · Long-press to delete
          </Text>
        )}
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View className="flex-1 justify-center items-center bg-black/80 px-6">
          <View className="bg-stone-900 rounded-3xl p-6 w-full border border-stone-800">
            <View className="w-14 h-14 bg-rose-500/10 rounded-2xl items-center justify-center self-center mb-4 border border-rose-500/20">
              <FontAwesome name="trash" size={20} color="#f43f5e" />
            </View>
            <Text className="text-xl font-bold text-white text-center mb-2 tracking-tight">
              Delete Expense?
            </Text>
            <Text className="text-stone-400 text-sm text-center mb-6">
              This action cannot be undone. The amount will be restored to your
              budget.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-4 rounded-2xl bg-stone-800 items-center active:bg-stone-700"
                onPress={() => {
                  setDeleteModalVisible(false);
                  setItemToDelete(null);
                }}
              >
                <Text className="text-white text-sm font-semibold uppercase tracking-wider">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-4 rounded-2xl bg-rose-600 items-center active:bg-rose-500"
                onPress={confirmDelete}
              >
                <Text className="text-white text-sm font-bold uppercase tracking-wider">
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        visible={!!editDraft}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEditDraft(null)}
      >
        <Pressable onPress={() => setEditDraft(null)} className="flex-1 justify-end bg-black/80">
          <Pressable onPress={() => {}}>
          <View className="bg-stone-900 rounded-t-3xl border-t border-stone-800 p-6">
            <TouchableOpacity onPress={() => setEditDraft(null)} activeOpacity={0.6} className="self-center mb-6 py-2 px-8">
              <View className="w-12 h-1.5 bg-stone-700 rounded-full" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-white tracking-tight mb-1">
              Edit Expense
            </Text>
            <Text className="text-stone-400 text-sm mb-5">
              Update the details below
            </Text>

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Description
            </Text>
            <TextInput
              placeholder="What was this for?"
              placeholderTextColor="#78716c"
              value={editDraft?.description || ""}
              onChangeText={(v) =>
                setEditDraft((d) => d && { ...d, description: v })
              }
              className="bg-black text-white text-sm px-4 py-3.5 rounded-2xl border border-stone-800 mb-3"
            />

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Amount
            </Text>
            <View className="flex-row items-center bg-black rounded-2xl px-4 py-3 border border-stone-800 mb-3">
              <TextInput
                placeholder="0"
                placeholderTextColor="#78716c"
                keyboardType="numeric"
                value={editDraft?.amount || ""}
                onChangeText={(v) =>
                  setEditDraft((d) => d && { ...d, amount: v })
                }
                className="flex-1 text-white text-lg font-bold"
              />
            </View>

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Category
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-5"
            >
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() =>
                    setEditDraft((d) => d && { ...d, category: cat.name })
                  }
                  className={`px-3.5 py-2 mr-2 rounded-full border ${editDraft?.category === cat.name ? "bg-emerald-600 border-emerald-500" : "bg-black border-stone-800"}`}
                >
                  <Text
                    className={`text-xs font-semibold ${editDraft?.category === cat.name ? "text-white" : "text-stone-400"}`}
                  >
                    {cat.icon} {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setEditDraft(null)}
                className="flex-1 py-4 rounded-2xl bg-stone-800 items-center active:bg-stone-700"
              >
                <Text className="text-white text-sm font-semibold uppercase tracking-wider">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveEdit}
                disabled={saving}
                className="flex-1 py-4 rounded-2xl bg-emerald-600 items-center active:bg-emerald-500"
              >
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white text-sm font-bold uppercase tracking-wider">
                    Save
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
