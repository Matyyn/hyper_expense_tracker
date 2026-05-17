import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
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

const DEFAULT_SOURCES = ["Cash"];

interface EditDraft {
  id: string;
  description: string;
  amount: string;
  category: string;
  source: string;
}

interface LoanEditDraft {
  id: string;
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

  const { deleteExpense, categoryMap, categories, addExpense } = useExpenseSync(
    user?.id,
    (user?.user_metadata?.monthly_budget as number) || 0,
    (user?.user_metadata?.savings_goal as number) || 0,
  );
  const { showNotification } = useNotification();
  const { format, symbol } = useCurrency();

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
  const [filterSource, setFilterSource] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [openDropdown, setOpenDropdown] = useState<null | 'sort' | 'category' | 'source'>(null);

  const [extraSources, setExtraSources] = useState<string[]>([]);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Edit modal state
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [loanEditDraft, setLoanEditDraft] = useState<LoanEditDraft | null>(null);
  const [savingLoanEdit, setSavingLoanEdit] = useState(false);
  const [partialAmounts, setPartialAmounts] = useState<Record<string, string>>({});

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

  const allCategories = ["All", ...categories.map((c) => c.name), "Lent", "Borrowed"];

  const dataSources = Array.from(new Set(
    historyExpenses.map((e: any) => e.source).filter(Boolean)
  )) as string[];
  const configuredSources = ((user?.user_metadata?.custom_sources as Array<{name: string}>) || []).map((s: {name: string}) => s.name);
  const allSources = Array.from(new Set([...DEFAULT_SOURCES, ...configuredSources, ...dataSources, ...extraSources]));

  // Merge loans into history as synthetic entries
  const allLoans: any[] = ((user?.user_metadata?.loans as any[]) || []);
  const loanHistoryItems: any[] = allLoans.map(loan => ({
    id: `loan-${loan.id}`,
    _isLoan: true,
    _loanType: loan.type,
    description: `${loan.type === 'lent' ? 'Lent to' : 'Borrowed from'} ${loan.person}`,
    amount: loan.amount,
    category: loan.type === 'lent' ? 'Lent' : 'Borrowed',
    created_at: loan.date,
    source: null,
    is_weekend: false,
    _loan: loan,
  }));

  const mergedItems = useMemo(() => {
    const start = new Date(viewYear, viewMonth, 1, 0, 0, 0, 0);
    const end = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59, 999);
    const loansThisMonth = loanHistoryItems.filter(l => {
      const d = new Date(l.created_at);
      return d >= start && d <= end;
    });
    return [...historyExpenses, ...loansThisMonth];
  }, [historyExpenses, loanHistoryItems, viewYear, viewMonth]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mergedItems.filter((e) => {
      if (filterCat !== "All" && e.category !== filterCat) return false;
      if (filterSource !== "All" && (e.source || "") !== filterSource) return false;
      if (q && !(e.description || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [mergedItems, filterCat, filterSource, search]);

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
      source: exp.source || "",
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
          source: editDraft.source || null,
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

  const handlePartialPaymentFromHistory = async (loanId: string) => {
    const delta = Number(partialAmounts[loanId] || 0);
    if (!delta) return;
    const loan = allLoans.find((l: any) => l.id === loanId);
    if (!loan) return;
    const newPaid = Math.min(loan.amount, (loan.paid || 0) + delta);
    const settled = newPaid >= loan.amount;
    const actualDelta = newPaid - (loan.paid || 0);
    const updatedLoans = allLoans.map((l: any) =>
      l.id === loanId ? { ...l, paid: newPaid, status: settled ? 'settled' : 'active' } : l
    );
    try {
      const { error } = await supabase.auth.updateUser({ data: { loans: updatedLoans } });
      if (error) throw error;
      if (actualDelta > 0) {
        if (loan.type === 'lent') {
          addExpense({ amount: actualDelta, description: settled ? `${loan.person} fully repaid` : `${loan.person} partial repayment`, category: INCOME_CATEGORY, source: loan.source });
        } else {
          addExpense({ amount: actualDelta, description: settled ? `Fully repaid ${loan.person}` : `Partial repayment to ${loan.person}`, category: 'Lending', source: loan.source });
        }
      }
      setPartialAmounts(prev => ({ ...prev, [loanId]: '' }));
      showNotification(settled ? (loan.type === 'lent' ? `${loan.person} fully paid back` : `Settled with ${loan.person}`) : `${format(actualDelta)} paid`, settled ? 'success' : 'info');
    } catch (e: any) {
      showNotification(e.message || 'Failed', 'error');
    }
  };

  const handleSettleLoanFromHistory = async (loanId: string) => {
    const loan = allLoans.find((l: any) => l.id === loanId);
    if (!loan) return;
    const updatedLoans = allLoans.map((l: any) =>
      l.id === loanId ? { ...l, paid: l.amount, status: 'settled' } : l
    );
    try {
      const { error } = await supabase.auth.updateUser({ data: { loans: updatedLoans } });
      if (error) throw error;
      const unpaid = loan.amount - (loan.paid || 0);
      if (unpaid > 0) {
        if (loan.type === 'lent') {
          addExpense({ amount: unpaid, description: `${loan.person} fully repaid`, category: INCOME_CATEGORY, source: loan.source });
        } else {
          addExpense({ amount: unpaid, description: `Fully repaid ${loan.person}`, category: 'Lending', source: loan.source });
        }
      }
      showNotification(loan.type === 'lent' ? `${loan.person} fully paid back` : `Settled with ${loan.person}`, 'success');
    } catch (e: any) {
      showNotification(e.message || 'Failed', 'error');
    }
  };

  const openLoanEdit = (loan: any) => {
    setLoanEditDraft({
      id: loan.id,
      type: loan.type,
      person: loan.person,
      amount: String(loan.amount),
      paid: String(loan.paid || 0),
      description: loan.description || '',
      hasDueDate: !!loan.due_date,
      dlYear: loan.due_date ? new Date(loan.due_date).getFullYear() : new Date().getFullYear(),
      dlMonth: loan.due_date ? new Date(loan.due_date).getMonth() : new Date().getMonth(),
      dlDay: loan.due_date ? new Date(loan.due_date).getDate() : new Date().getDate(),
      source: loan.source || '',
    });
  };

  const handleSaveLoanEdit = async () => {
    if (!loanEditDraft || !user?.id) return;
    const person = loanEditDraft.person.trim();
    const amount = Number(loanEditDraft.amount);
    const paid = Number(loanEditDraft.paid) || 0;
    if (!person || isNaN(amount) || amount <= 0) {
      showNotification('Person name and amount required', 'error');
      return;
    }
    const due_date = loanEditDraft.hasDueDate
      ? new Date(loanEditDraft.dlYear, loanEditDraft.dlMonth, loanEditDraft.dlDay).toISOString()
      : undefined;
    const updatedLoans = allLoans.map((l: any) =>
      l.id === loanEditDraft.id
        ? { ...l, person, amount, paid, description: loanEditDraft.description || undefined, due_date, type: loanEditDraft.type, source: loanEditDraft.source || undefined }
        : l
    );
    setSavingLoanEdit(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { loans: updatedLoans } });
      if (error) throw error;
      showNotification('Loan updated', 'success');
      setLoanEditDraft(null);
    } catch (e: any) {
      showNotification(e.message || 'Update failed', 'error');
    } finally {
      setSavingLoanEdit(false);
    }
  };

  const handleDeleteLoanFromHistory = async () => {
    if (!loanEditDraft?.id || !user?.id) return;
    const updatedLoans = allLoans.filter((l: any) => l.id !== loanEditDraft.id);
    setSavingLoanEdit(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { loans: updatedLoans } });
      if (error) throw error;
      showNotification('Loan removed', 'info');
      setLoanEditDraft(null);
    } catch (e: any) {
      showNotification(e.message || 'Delete failed', 'error');
    } finally {
      setSavingLoanEdit(false);
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
        <View className="flex-row items-center justify-between mb-2 mt-1">
          <Text className="text-3xl font-bold text-white tracking-tight">History</Text>
          <TouchableOpacity
            onPress={() => showNotification("Tap expense to edit · Long-press to delete", "info")}
            className="w-9 h-9 rounded-full bg-stone-900 border border-stone-800 items-center justify-center active:bg-stone-800"
          >
            <FontAwesome name="info" size={13} color="#78716c" />
          </TouchableOpacity>
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

        {/* Search bar — record count in placeholder */}
        <View className="flex-row items-center bg-stone-900 border border-stone-800 rounded-2xl px-4 py-1 mb-2">
          <FontAwesome name="search" size={13} color="#52525b" />
          <TextInput
            placeholder={`Search ${mergedItems.length} record${mergedItems.length !== 1 ? "s" : ""}...`}
            placeholderTextColor="#78716c"
            value={search}
            onChangeText={setSearch}
            className="flex-1 text-white text-sm px-3 py-2.5"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} className="w-8 h-8 items-center justify-center">
              <FontAwesome name="close" size={12} color="#78716c" />
            </TouchableOpacity>
          )}
        </View>

        {/* Dropdowns row */}
        <View className="mb-2">
          <View className="flex-row gap-2 mb-2">
            {/* Sort */}
            <TouchableOpacity
              onPress={() => setOpenDropdown(openDropdown === 'sort' ? null : 'sort')}
              className={`flex-1 flex-row items-center justify-between px-3 py-2.5 rounded-2xl border ${openDropdown === 'sort' ? "bg-emerald-900/30 border-emerald-700" : "bg-stone-900 border-stone-800"}`}
            >
              <Text className={`text-[11px] font-semibold uppercase tracking-wide flex-1 ${openDropdown === 'sort' ? "text-emerald-400" : "text-stone-300"}`} numberOfLines={1}>
                {sortOptions.find(o => o.key === sortMode)?.label}
              </Text>
              <FontAwesome name={openDropdown === 'sort' ? "chevron-up" : "chevron-down"} size={9} color={openDropdown === 'sort' ? "#34d399" : "#57534e"} />
            </TouchableOpacity>

            {/* Category */}
            <TouchableOpacity
              onPress={() => setOpenDropdown(openDropdown === 'category' ? null : 'category')}
              className={`flex-1 flex-row items-center justify-between px-3 py-2.5 rounded-2xl border ${openDropdown === 'category' || filterCat !== "All" ? "bg-emerald-900/30 border-emerald-700" : "bg-stone-900 border-stone-800"}`}
            >
              <Text className={`text-[11px] font-semibold uppercase tracking-wide flex-1 ${openDropdown === 'category' || filterCat !== "All" ? "text-emerald-400" : "text-stone-300"}`} numberOfLines={1}>
                {filterCat === "All" ? "Category" : filterCat}
              </Text>
              <FontAwesome name={openDropdown === 'category' ? "chevron-up" : "chevron-down"} size={9} color={openDropdown === 'category' || filterCat !== "All" ? "#34d399" : "#57534e"} />
            </TouchableOpacity>

            {/* Source */}
            <TouchableOpacity
              onPress={() => setOpenDropdown(openDropdown === 'source' ? null : 'source')}
              className={`flex-1 flex-row items-center justify-between px-3 py-2.5 rounded-2xl border ${openDropdown === 'source' || filterSource !== "All" ? "bg-emerald-900/30 border-emerald-700" : "bg-stone-900 border-stone-800"}`}
            >
              <Text className={`text-[11px] font-semibold uppercase tracking-wide flex-1 ${openDropdown === 'source' || filterSource !== "All" ? "text-emerald-400" : "text-stone-300"}`} numberOfLines={1}>
                {filterSource === "All" ? "Source" : filterSource}
              </Text>
              <FontAwesome name={openDropdown === 'source' ? "chevron-up" : "chevron-down"} size={9} color={openDropdown === 'source' || filterSource !== "All" ? "#34d399" : "#57534e"} />
            </TouchableOpacity>
          </View>

          {/* Expanded options — in flow, no absolute positioning */}
          {openDropdown === 'sort' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              {sortOptions.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => { setSortMode(opt.key); setOpenDropdown(null); }}
                  className={`px-3.5 py-2 mr-2 rounded-full border ${sortMode === opt.key ? "bg-emerald-600 border-emerald-500" : "bg-stone-900 border-stone-800"}`}
                >
                  <Text className={`text-xs font-semibold uppercase tracking-wide ${sortMode === opt.key ? "text-white" : "text-stone-400"}`}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {openDropdown === 'category' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              {allCategories.map(cat => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => { setFilterCat(cat); setOpenDropdown(null); }}
                  className={`px-3.5 py-2 mr-2 rounded-full border flex-row items-center ${filterCat === cat ? "bg-emerald-600 border-emerald-500" : "bg-stone-900 border-stone-800"}`}
                >
                  {cat !== "All" && categoryMap[cat] && (
                    <Text className="mr-1.5 text-sm">{categoryMap[cat].icon}</Text>
                  )}
                  <Text className={`text-xs font-semibold uppercase tracking-wide ${filterCat === cat ? "text-white" : "text-stone-400"}`}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {openDropdown === 'source' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              {["All", ...allSources].map(src => (
                <TouchableOpacity
                  key={src}
                  onPress={() => { setFilterSource(src); setOpenDropdown(null); }}
                  className={`px-3.5 py-2 mr-2 rounded-full border ${filterSource === src ? "bg-emerald-600 border-emerald-500" : "bg-stone-900 border-stone-800"}`}
                >
                  <Text className={`text-xs font-semibold uppercase tracking-wide ${filterSource === src ? "text-white" : "text-stone-400"}`}>
                    {src}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
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
                if (exp._isLoan) {
                  const isLent = exp._loanType === 'lent';
                  const loan = exp._loan;
                  const remaining = loan.amount - (loan.paid || 0);
                  const pct = Math.min(100, ((loan.paid || 0) / Math.max(loan.amount, 1)) * 100);
                  const dueDate = loan.due_date ? new Date(loan.due_date) : null;
                  const todayDate = new Date(); todayDate.setHours(0,0,0,0);
                  const overdue = dueDate ? dueDate < todayDate : false;
                  const settled = loan.status === 'settled';
                  return (
                    <View
                      key={exp.id}
                      style={{ opacity: settled ? 0.65 : 1 }}
                      className={`rounded-2xl mb-3 border p-4 ${isLent ? "bg-emerald-950/30 border-emerald-800/30" : "bg-rose-950/20 border-rose-900/20"}`}
                    >
                      <View className="flex-row items-start justify-between mb-2">
                        <View className="flex-row items-center flex-1 mr-2">
                          <View className={`w-9 h-9 rounded-xl items-center justify-center mr-3 ${isLent ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-rose-500/10 border border-rose-500/20"}`}>
                            <FontAwesome name="handshake-o" size={13} color={isLent ? "#34d399" : "#f43f5e"} />
                          </View>
                          <View className="flex-1">
                            <View className="flex-row items-center flex-wrap mb-0.5" style={{ gap: 5 }}>
                              <Text className="text-white text-sm font-bold">{loan.person}</Text>
                              {overdue && !settled && (
                                <View className="bg-rose-500/20 border border-rose-500/30 rounded-full px-1.5 py-0.5">
                                  <Text className="text-rose-400 text-[9px] font-bold uppercase">Overdue</Text>
                                </View>
                              )}
                              {settled && (
                                <View className="bg-stone-800 border border-stone-700 rounded-full px-1.5 py-0.5">
                                  <Text className="text-stone-400 text-[9px] font-semibold uppercase">Settled</Text>
                                </View>
                              )}
                            </View>
                            <Text className={`text-[10px] uppercase tracking-wide ${isLent ? "text-emerald-700" : "text-rose-800"}`}>
                              {isLent ? "Lent to" : "Borrowed from"}{dueDate ? ` · Due ${dueDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}
                            </Text>
                          </View>
                        </View>
                        <View className="items-end">
                          <Text className={`text-sm font-bold ${isLent ? "text-emerald-400" : "text-rose-400"}`}>{format(remaining)}</Text>
                          <Text className="text-stone-600 text-[10px]">of {format(loan.amount)}</Text>
                        </View>
                      </View>
                      <View className="h-1.5 bg-stone-800/80 rounded-full overflow-hidden mb-3">
                        <View className={`h-full rounded-full ${isLent ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${pct}%` }} />
                      </View>
                      {!settled ? (
                        <View className="flex-row items-center gap-2">
                          <View className="flex-1 flex-row items-center bg-black/40 border border-stone-800 rounded-xl px-3 py-2">
                            <Text className="text-stone-500 text-xs mr-1">{symbol}</Text>
                            <TextInput
                              value={partialAmounts[loan.id] ?? ''}
                              onChangeText={v => setPartialAmounts(prev => ({ ...prev, [loan.id]: v.replace(/[^0-9]/g, '') }))}
                              keyboardType="numeric"
                              placeholder="Amount paid"
                              placeholderTextColor="#57534e"
                              className="flex-1 text-white text-xs"
                            />
                          </View>
                          <TouchableOpacity
                            onPress={() => handlePartialPaymentFromHistory(loan.id)}
                            className="px-3 py-2 bg-stone-800 border border-stone-700 rounded-xl active:bg-stone-700"
                          >
                            <Text className="text-stone-300 text-[11px] font-semibold">Pay</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleSettleLoanFromHistory(loan.id)}
                            className={`px-3 py-2 border rounded-xl active:opacity-70 ${isLent ? 'bg-emerald-900/30 border-emerald-700' : 'bg-rose-900/30 border-rose-700'}`}
                          >
                            <Text className={`text-[11px] font-semibold ${isLent ? 'text-emerald-400' : 'text-rose-400'}`}>Settle</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => openLoanEdit(loan)}
                            className="w-8 h-8 items-center justify-center bg-black/30 border border-stone-800 rounded-xl"
                          >
                            <FontAwesome name="pencil" size={11} color="#78716c" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={() => openLoanEdit(loan)} className="flex-row items-center justify-end">
                          <FontAwesome name="pencil" size={11} color="#57534e" />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                }
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
                      <View className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${isIncome ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-stone-800"}`}>
                        <Text className="text-base">
                          {categoryMap[exp.category]?.icon || (isIncome ? "💰" : "💸")}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-white text-sm font-semibold" numberOfLines={1}>{exp.description}</Text>
                        <View className="flex-row items-center flex-wrap mt-0.5" style={{ gap: 4 }}>
                          <Text className="text-stone-500 text-[11px] uppercase tracking-wider">
                            {exp.category}{exp.is_weekend ? " · Wknd" : ""}
                          </Text>
                          {exp.source ? (
                            <View className="bg-stone-800 border border-stone-700 rounded-full px-1.5 py-0.5">
                              <Text className="text-stone-400 text-[9px] font-semibold uppercase tracking-wider">{exp.source}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    <Text className={`text-sm font-bold tracking-tight ml-2 ${isIncome ? "text-emerald-400" : "text-rose-400"}`}>
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
        <Pressable onPress={() => setEditDraft(null)} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.8)" }}>
          <Pressable onPress={() => {}} style={{ maxHeight: "90%", backgroundColor: "#1c1917", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: "#292524" }}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
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
              className="mb-3"
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

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Source
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-2"
            >
              {allSources.map((src) => (
                <TouchableOpacity
                  key={src}
                  onPress={() =>
                    setEditDraft((d) => d && { ...d, source: d.source === src ? "" : src })
                  }
                  className={`px-3.5 py-2 mr-2 rounded-full border ${editDraft?.source === src ? "bg-stone-600 border-stone-500" : "bg-black border-stone-800"}`}
                >
                  <Text
                    className={`text-xs font-semibold ${editDraft?.source === src ? "text-white" : "text-stone-400"}`}
                  >
                    {src}
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
          </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      {/* Loan Edit Modal */}
      <Modal visible={!!loanEditDraft} transparent={false} animationType="slide" onRequestClose={() => setLoanEditDraft(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#292524' }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 }}>Edit Loan</Text>
            <TouchableOpacity
              onPress={() => setLoanEditDraft(null)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#1c1917', borderWidth: 1, borderColor: '#292524', alignItems: 'center', justifyContent: 'center' }}
            >
              <FontAwesome name="times" size={14} color="#a8a29e" />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
            <Text className="text-stone-400 text-sm mb-5">Update loan details</Text>

              <View className="flex-row bg-black rounded-full p-1 border border-stone-800 mb-4">
                <TouchableOpacity
                  onPress={() => setLoanEditDraft(d => d && { ...d, type: 'lent' })}
                  className={`flex-1 py-2.5 rounded-full items-center ${loanEditDraft?.type === 'lent' ? 'bg-emerald-600' : ''}`}
                >
                  <Text className={`text-xs font-bold uppercase tracking-wider ${loanEditDraft?.type === 'lent' ? 'text-white' : 'text-stone-500'}`}>I Lent Money</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setLoanEditDraft(d => d && { ...d, type: 'borrowed' })}
                  className={`flex-1 py-2.5 rounded-full items-center ${loanEditDraft?.type === 'borrowed' ? 'bg-rose-600' : ''}`}
                >
                  <Text className={`text-xs font-bold uppercase tracking-wider ${loanEditDraft?.type === 'borrowed' ? 'text-white' : 'text-stone-500'}`}>I Borrowed</Text>
                </TouchableOpacity>
              </View>

              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
                {loanEditDraft?.type === 'lent' ? 'Lent To' : 'Borrowed From'}
              </Text>
              <TextInput
                placeholder="Person's name"
                placeholderTextColor="#78716c"
                value={loanEditDraft?.person || ''}
                onChangeText={v => setLoanEditDraft(d => d && { ...d, person: v })}
                className="bg-black text-white text-sm px-4 py-3.5 rounded-2xl border border-stone-800 mb-3"
              />

              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Amount</Text>
              <View className="flex-row items-center bg-black rounded-2xl px-4 py-3 border border-stone-800 mb-3">
                <Text className="text-stone-500 text-sm font-semibold mr-3">{symbol}</Text>
                <TextInput
                  placeholder="0"
                  placeholderTextColor="#78716c"
                  keyboardType="numeric"
                  value={loanEditDraft?.amount || ''}
                  onChangeText={v => setLoanEditDraft(d => d && { ...d, amount: v })}
                  className="flex-1 text-white text-sm font-bold"
                />
              </View>

              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Amount Paid Back</Text>
              <View className="flex-row items-center bg-black rounded-2xl px-4 py-3 border border-stone-800 mb-3">
                <Text className="text-stone-500 text-sm font-semibold mr-3">{symbol}</Text>
                <TextInput
                  placeholder="0"
                  placeholderTextColor="#78716c"
                  keyboardType="numeric"
                  value={loanEditDraft?.paid || ''}
                  onChangeText={v => setLoanEditDraft(d => d && { ...d, paid: v })}
                  className="flex-1 text-white text-sm font-bold"
                />
              </View>

              <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Description (optional)</Text>
              <TextInput
                placeholder="e.g. Rent share, groceries..."
                placeholderTextColor="#78716c"
                value={loanEditDraft?.description || ''}
                onChangeText={v => setLoanEditDraft(d => d && { ...d, description: v })}
                className="bg-black text-white text-sm px-4 py-3.5 rounded-2xl border border-stone-800 mb-3"
              />

              {allSources.length > 0 && (
                <>
                  <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Source (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                    {allSources.map(src => (
                      <TouchableOpacity
                        key={src}
                        onPress={() => setLoanEditDraft(d => d && { ...d, source: d.source === src ? '' : src })}
                        className={`px-3.5 py-2 mr-2 rounded-full border ${loanEditDraft?.source === src ? 'bg-stone-600 border-stone-500' : 'bg-black border-stone-800'}`}
                      >
                        <Text className={`text-xs font-semibold uppercase tracking-wider ${loanEditDraft?.source === src ? 'text-white' : 'text-stone-500'}`}>{src}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest ml-1">Set Due Date</Text>
                <Switch
                  value={loanEditDraft?.hasDueDate || false}
                  onValueChange={v => setLoanEditDraft(d => d && { ...d, hasDueDate: v })}
                  trackColor={{ false: '#292524', true: '#059669' }}
                  thumbColor={loanEditDraft?.hasDueDate ? '#34d399' : '#78716c'}
                />
              </View>
              {loanEditDraft?.hasDueDate && (
                <>
                  <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Month</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                    {monthNames.map((m, idx) => (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setLoanEditDraft(d => d && { ...d, dlMonth: idx })}
                        className={`px-3.5 py-2 mr-2 rounded-full border ${loanEditDraft.dlMonth === idx ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}
                      >
                        <Text className={`text-xs font-semibold uppercase tracking-wider ${loanEditDraft.dlMonth === idx ? 'text-white' : 'text-stone-500'}`}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Day</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
                    {Array.from({ length: new Date(loanEditDraft.dlYear, loanEditDraft.dlMonth + 1, 0).getDate() }, (_, i) => i + 1).map(d => (
                      <TouchableOpacity
                        key={d}
                        onPress={() => setLoanEditDraft(ld => ld && { ...ld, dlDay: d })}
                        className={`w-10 h-10 mr-1.5 rounded-full items-center justify-center border ${loanEditDraft.dlDay === d ? 'bg-emerald-600 border-emerald-500' : 'bg-black border-stone-800'}`}
                      >
                        <Text className={`text-xs font-semibold ${loanEditDraft.dlDay === d ? 'text-white' : 'text-stone-500'}`}>{d}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <View className="flex-row gap-3">
                <TouchableOpacity onPress={handleDeleteLoanFromHistory} className="py-4 px-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 items-center">
                  <FontAwesome name="trash" size={14} color="#f43f5e" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setLoanEditDraft(null)} className="flex-1 py-4 rounded-2xl bg-stone-800 items-center">
                  <Text className="text-white text-sm font-semibold uppercase tracking-wider">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveLoanEdit} disabled={savingLoanEdit} className="flex-1 py-4 rounded-2xl bg-emerald-600 items-center active:bg-emerald-500">
                  {savingLoanEdit ? <ActivityIndicator color="white" /> : <Text className="text-white text-sm font-bold uppercase tracking-wider">Update</Text>}
                </TouchableOpacity>
              </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
