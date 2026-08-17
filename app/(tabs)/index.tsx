import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/AuthProvider";
import { useCurrency } from "../../components/CurrencyProvider";
import { useNotification } from "../../components/NotificationProvider";
import { useTheme } from "../../components/ThemeProvider";
import {
  INCOME_CATEGORY,
  LOAN_RETURN_CATEGORY,
  QuickTemplate,
  useExpenseSync,
} from "../../hooks/useExpenseSync";
import { supabase } from "../../lib/supabase";
import { isOnline } from "../../lib/online";
import {
  SPEND_FOR_COLOR,
  SPEND_FOR_ICON,
  SPEND_FOR_LABEL,
  SPEND_FOR_VALUES,
  SpendFor,
} from "../../lib/spendFor";
import {
  SPLITWISE_COLOR,
  SplitwiseEntry,
  readSplitwiseEntries,
} from "../../lib/splitwise";
import { SegmentOption, Segmented, SpendForPicker } from "../../components/SpendForPicker";
import { SplitwiseTracker } from "../../components/SplitwiseTracker";
import { useUserMetadata, useUpdateMetadata } from "../../hooks/useUserMetadata";
import { SyncStatusIcon } from "../../components/SyncStatusIcon";
import {
  MonthlySavingsEntry,
  leftoverOf,
  mergeMonthlySavings,
  monthKey,
  monthLabel,
  nextPeriodEnd,
  periodEndAfter,
} from "../../lib/monthlySavings";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function SkeletonBlock({
  width,
  height,
  className,
}: {
  width?: number | string;
  height: number;
  className?: string;
}) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.25, 0.55]),
  }));
  return (
    <Animated.View
      style={[
        animStyle,
        {
          width: width as any,
          height,
          borderRadius: 12,
          backgroundColor: "#292524",
        },
      ]}
      className={className}
    />
  );
}

function DashboardSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-app">
      <ScrollView
        className="px-6"
        contentContainerStyle={{ paddingBottom: 60 }}
        scrollEnabled={false}
      >
        <View className="flex-row justify-between items-center mb-6 mt-2">
          <View>
            <SkeletonBlock
              width={180}
              height={32}
              className="mb-2 rounded-xl"
            />
            <SkeletonBlock width={100} height={10} className="rounded-full" />
          </View>
          <SkeletonBlock width={90} height={32} className="rounded-full" />
        </View>
        <View className="bg-surface rounded-3xl p-6 mb-5">
          <SkeletonBlock
            width={120}
            height={10}
            className="mb-3 rounded-full"
          />
          <SkeletonBlock width={220} height={42} className="mb-5 rounded-xl" />
          <SkeletonBlock
            width="100%"
            height={8}
            className="mb-5 rounded-full"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BounceCard({
  onPress,
  onLongPress,
  children,
  className,
  style,
}: {
  onPress: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
  className?: string;
  style?: any;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 15, stiffness: 220 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 10, stiffness: 200 });
      }}
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

function SectionTitle({
  icon,
  label,
  color = "#34d399",
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  color?: string;
}) {
  return (
    <View className="flex-row items-center mb-4">
      <View className="w-7 h-7 rounded-lg bg-surface border border-line items-center justify-center mr-3">
        <FontAwesome name={icon} size={12} color={color} />
      </View>
      <Text className="text-ink text-base font-bold tracking-tight">
        {label}
      </Text>
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

const EMPTY_DRAFT: TemplateDraft = {
  title: "",
  icon: "⚡",
  amount: "",
  category: "Misc",
  group_name: "commute",
};

type LogMode = "expense" | "income" | "splitwise";

// Three segments have to share the card width, so no icons and a short "Split"
// label — the panel below the toggle explains itself. Split gets violet so it
// never reads as emerald (money in) or rose (money out).
const LOG_MODE_OPTIONS: SegmentOption<LogMode>[] = [
  { key: "expense", label: "Expense", color: "#f43f5e" },
  { key: "income", label: "Income", color: "#059669" },
  { key: "splitwise", label: "Split", color: SPLITWISE_COLOR.owes_you },
];

export default function Dashboard() {
  const { user } = useAuth();
  const metadata = useUserMetadata();
  const { updateMetadata } = useUpdateMetadata();
  const queryClient = useQueryClient();
  const { format, symbol } = useCurrency();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const {
    expenses,
    incomeEntries,
    allExpenses,
    displayExpenses,
    weeklyExpenses,
    metrics,
    profile,
    categories,
    categoryMap,
    commuteTemplates,
    foodTemplates,
    otherTemplates,
    categorySpend,
    loanRelatedExpenseIds,
    addExpense,
    updateProfile,
    updateTemplate,
    addTemplate,
    deleteTemplate,
    deleteTemplateAsync,
    isAdding,
    isLoading,
  } = useExpenseSync(
    user?.id,
    (metadata?.monthly_budget as number) || 0,
    (metadata?.savings_goal as number) || 0,
  );

  const {
    showNotification,
    recordNotification,
    history,
    unreadCount,
    markAllRead,
    clearHistory,
  } = useNotification();
  const {
    leftoverBudget,
    burnRate,
    weeklyBudget,
    monthlyBudget,
    totalSavings,
    totalSpentMonthly,
    displayTotalMonthly,
    totalIncomeMonthly,
    savingsGoal,
    streak,
  } = metrics;

  const [newBudget, setNewBudget] = useState(monthlyBudget.toString());
  const [newGoal, setNewGoal] = useState(savingsGoal.toString());
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [templateAmounts, setTemplateAmounts] = useState<Record<string, string>>({});
  const [templateSources, setTemplateSources] = useState<Record<string, string>>({});
  const [quickLogTab, setQuickLogTab] = useState<"commute" | "food" | "other">(
    "commute",
  );
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [logMode, setLogMode] = useState<LogMode>("expense");
  const [chartView, setChartView] = useState<"weekly" | "monthly">("weekly");
  const [expiryMonth, setExpiryMonth] = useState(() => new Date().getMonth());
  const [expiryDay, setExpiryDay] = useState(() =>
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(),
  );

  // Template editor
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(
    null,
  );

  // Month-end rollover (#4) — fully automatic, no prompt
  const rolloverRanRef = useRef(false);
  const periodStartRanRef = useRef(false);

  const savedSources: Array<{name: string; budget: number}> =
    (metadata?.custom_sources as any[]) || [{ name: "Cash", budget: 0 }];

  // Splitwise ledger. Read fresh from the metadata cache every render, so the
  // tracker's read-modify-write always builds on the newest array rather than a
  // snapshot captured earlier. Nothing here feeds the budget.
  const splitwiseEntries = readSplitwiseEntries(metadata);
  const persistSplitwise = (next: SplitwiseEntry[]) =>
    updateMetadata({ splitwise_entries: next });

  const [obBudget, setObBudget] = useState("");
  const [obGoal, setObGoal] = useState("");
  const [obSources, setObSources] = useState<Array<{name: string; budget: string}>>([{ name: "Cash", budget: "" }]);
  const [obSourceName, setObSourceName] = useState("");
  const [obSourceBudget, setObSourceBudget] = useState("");
  const [obSaving, setObSaving] = useState(false);
  const [obError, setObError] = useState("");

  const [activeSource, setActiveSource] = useState(savedSources[0]?.name || "Cash");
  const [sourceInput, setSourceInput] = useState("");
  const [sourceDrafts, setSourceDrafts] = useState<Array<{name: string; budget: string}>>([]);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceBudget, setNewSourceBudget] = useState("");

  const [customExpense, setCustomExpense] = useState({
    description: "",
    amount: "",
    category: categories[0]?.name || "Misc",
    source: "",
  });

  // Who the manual entry is for. Quick Log has no picker — those taps stay
  // one-tap and fall back to the default scope in buildExpenseVars.
  const [spendFor, setSpendFor] = useState<SpendFor>("self");

  // Self/Family split of the monthly budget (Wallet Settings), plus the modal's
  // first error banner.
  const [selfAllocInput, setSelfAllocInput] = useState("");
  const [familyAllocInput, setFamilyAllocInput] = useState("");
  const [settingsError, setSettingsError] = useState("");

  const today = new Date();
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear] = useState(today.getFullYear());

  useEffect(() => {
    setNewBudget(monthlyBudget.toString());
    setNewGoal(savingsGoal.toString());
  }, [monthlyBudget, savingsGoal]);

  useEffect(() => {
    const stored = metadata?.budget_expiry as string | undefined;
    if (stored) {
      const d = new Date(stored);
      setExpiryMonth(d.getMonth());
      setExpiryDay(d.getDate());
    }
  }, [metadata?.budget_expiry]);

  useEffect(() => {
    const all = [...commuteTemplates, ...foodTemplates, ...otherTemplates];
    if (all.length === 0) return;
    setTemplateAmounts((prev) => {
      const map: Record<string, string> = { ...prev };
      all.forEach((t) => {
        if (map[t.id] === undefined) map[t.id] = t.amount.toString();
      });
      return map;
    });
  }, [commuteTemplates, foodTemplates, otherTemplates]);

  // Ensure Income category exists for existing users (one-time idempotent insert)
  useEffect(() => {
    if (!user?.id || categories.length === 0) return;
    if (categories.find((c) => c.name === INCOME_CATEGORY)) return;
    if (!isOnline()) return; // one-time backfill; runs next launch when online
    (async () => {
      await supabase.from("categories").insert([
        {
          user_id: user.id,
          name: INCOME_CATEGORY,
          icon: "💰",
          color: "#10b981",
          sort_order: 99,
        },
      ]);
      queryClient.invalidateQueries({ queryKey: ["categories", user.id] });
    })();
  }, [user?.id, categories]);

  const monthlyLeftover =
    monthlyBudget + totalIncomeMonthly - totalSpentMonthly;
  const displayLeftover = monthlyLeftover;
  const monthlyBudgetTotal = Math.max(monthlyBudget + totalIncomeMonthly, 1);
  const budgetUsedPercent = Math.min(
    100,
    (totalSpentMonthly / monthlyBudgetTotal) * 100,
  );
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const storedExpiry = metadata?.budget_expiry as string | undefined;
  const budgetExpiryDate = storedExpiry ? new Date(storedExpiry) : endOfMonth;
  const isBudgetExpired = budgetExpiryDate < today;
  const daysUntilExpiry = Math.max(
    0,
    Math.ceil(
      (budgetExpiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  const dailyBurn =
    daysUntilExpiry > 0 ? monthlyLeftover / daysUntilExpiry : monthlyLeftover;
  const daysLeftInMonth = endOfMonth.getDate() - today.getDate();


  // --- Month-end rollover (#4) ---------------------------------------------
  // When a budget period ends the leftover is swept straight into total savings
  // and the next period starts on its own — same budget, same day-of-month end
  // date. There is no prompt: the user only ever sees the new period already
  // running, plus an entry in the Savings tab's Monthly Savings list.
  //
  // Every period that closed since the last launch is swept individually, so
  // going a few months without opening the app produces one entry per month
  // rather than a single merged lump.
  const runRollover = async () => {
    // Rollover reconciles against the server's period expenses; defer it until
    // online (it re-triggers on the next launch with a connection).
    if (!isOnline()) {
      rolloverRanRef.current = false;
      return;
    }
    try {
      const base =
        (profile?.monthly_budget as number | undefined) ??
        ((metadata?.monthly_budget as number) || 0);
      const anchorDay = budgetExpiryDate.getDate();

      let periodStart = metadata?.budget_period_start
        ? new Date(metadata.budget_period_start as string)
        : new Date(budgetExpiryDate.getFullYear(), budgetExpiryDate.getMonth(), 1);
      let periodEnd = budgetExpiryDate;

      // One query covering every closed period, sliced per-period in memory.
      const { data: periodExpenses, error } = await supabase
        .from("expenses")
        .select("amount, category, created_at")
        .eq("user_id", user!.id)
        .gte("created_at", periodStart.toISOString());
      if (error) throw error;
      const rows = (periodExpenses || []).map((e) => ({
        amount: Number(e.amount) || 0,
        category: e.category as string,
        at: new Date(e.created_at as string).getTime(),
      }));

      const existing =
        (metadata?.monthly_savings_history as MonthlySavingsEntry[]) || [];
      const swept: MonthlySavingsEntry[] = [];
      // Only a real prior sweep blocks re-sweeping a month. Backfilled estimates
      // are display-only and never moved money, so this period still owes the
      // vault its leftover — the estimate gets replaced on merge.
      const seen = new Set(
        existing.filter((h) => h.origin !== "backfill").map((h) => h.key),
      );
      let sweptTotal = 0;
      const now = Date.now();

      // Guard bounds the walk in case of a corrupt/ancient expiry date.
      for (let guard = 0; periodEnd.getTime() < now && guard < 240; guard++) {
        const from = periodStart.getTime();
        const to = periodEnd.getTime();
        const { amount } = leftoverOf(
          rows.filter((e) => e.at >= from && e.at <= to),
          base,
        );
        const key = monthKey(periodEnd);
        if (!seen.has(key)) {
          seen.add(key);
          swept.push({
            key,
            label: monthLabel(periodEnd),
            amount,
            date: periodEnd.toISOString(),
            origin: "rollover",
          });
          sweptTotal += amount;
        }
        periodStart = new Date(to + 1);
        periodEnd = nextPeriodEnd(periodEnd, anchorDay);
      }

      // periodStart/periodEnd now describe the period that contains today.
      if (sweptTotal > 0) {
        updateProfile({ total_savings: totalSavings + sweptTotal });
      }
      updateMetadata({
        budget_expiry: periodEnd.toISOString(),
        budget_period_start: periodStart.toISOString(),
        awaiting_new_budget: false,
        last_rollover_key: storedExpiry,
        monthly_savings_history: mergeMonthlySavings(existing, swept),
      });

      if (sweptTotal > 0) {
        // Recorded to the bell only — no toast for a transfer the user didn't ask for.
        recordNotification(
          `${format(sweptTotal)} moved to savings — new budget period started`,
          "success",
        );
      }
    } catch {
      rolloverRanRef.current = false;
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    if (metadata?.is_new_user === true) return;
    if (!storedExpiry || !isBudgetExpired) return;
    if (metadata?.last_rollover_key === storedExpiry) return;
    if (rolloverRanRef.current) return;
    rolloverRanRef.current = true;
    runRollover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, storedExpiry, isBudgetExpired]);

  // Legacy recovery: users left in the old "awaiting new budget" state (their
  // leftover was already swept, but the period was never restarted because the
  // prompt is gone) get a period started for them on the same day-of-month.
  useEffect(() => {
    if (!user?.id) return;
    if (metadata?.awaiting_new_budget !== true) return;
    if (periodStartRanRef.current) return;
    periodStartRanRef.current = true;
    const anchorDay = storedExpiry
      ? new Date(storedExpiry).getDate()
      : endOfMonth.getDate();
    const expiry = periodEndAfter(new Date(), anchorDay);
    updateMetadata({
      budget_expiry: expiry.toISOString(),
      budget_period_start: new Date().toISOString(),
      awaiting_new_budget: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, metadata?.awaiting_new_budget]);

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // weeklyExpenses already excludes loan categories (via displayExpenses in hook)
  const weekData = new Array(7).fill(0);
  weeklyExpenses.forEach((exp) => {
    if (exp.created_at) {
      weekData[new Date(exp.created_at).getDay()] += Number(exp.amount);
    }
  });
  const maxExpense = Math.max(...weekData, 1);

  // displayExpenses excludes Lending and Loan Return — pure user spend
  const todayDate = today.getDate();
  const monthData = new Array(todayDate).fill(0);
  displayExpenses.forEach((exp) => {
    if (exp.created_at) {
      const d = new Date(exp.created_at);
      if (
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      ) {
        const idx = d.getDate() - 1;
        if (idx >= 0 && idx < monthData.length)
          monthData[idx] += Number(exp.amount);
      }
    }
  });
  const maxMonthExpense = Math.max(...monthData, 1);

  const getSelectedDateISO = () =>
    new Date(selectedYear, selectedMonth, selectedDay, 12, 0, 0).toISOString();
  const isToday =
    selectedDay === today.getDate() && selectedMonth === today.getMonth();
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
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

  // Category budget alerts (read from user_metadata)
  const categoryBudgets: Record<string, number> =
    (metadata?.category_budgets as Record<string, number>) || {};
  const checkCategoryAlert = (category: string, addedAmount: number) => {
    const limit = categoryBudgets[category];
    if (!limit) return;
    const before = categorySpend[category] || 0;
    const after = before + addedAmount;
    const pctBefore = (before / limit) * 100;
    const pctAfter = (after / limit) * 100;
    if (pctBefore < 100 && pctAfter >= 100) {
      showNotification(`${category} budget exceeded`, "error");
    } else if (pctBefore < 80 && pctAfter >= 80) {
      showNotification(`${category} at ${Math.round(pctAfter)}% of budget`, "info");
    }
  };

  const handleTemplateLog = (
    templateId: string,
    title: string,
    category: string,
  ) => {
    const amount = Number(templateAmounts[templateId]) || 0;
    if (amount > 0) {
      const original = [
        ...commuteTemplates,
        ...foodTemplates,
        ...otherTemplates,
      ].find((t) => t.id === templateId);
      if (original && original.amount !== amount) {
        updateTemplate({ id: templateId, amount });
      }
      addExpense({
        amount,
        description: title,
        category,
        source: templateSources[templateId] || savedSources[0]?.name || 'Cash',
        // No spend_for: Quick Log has no scope picker, so buildExpenseVars
        // stamps DEFAULT_SPEND_FOR and the default stays in one place.
      });
      showNotification(
        `Logged ${format(amount)} for ${title}`,
        "success",
        true,
      );
      checkCategoryAlert(category, amount);
    }
  };

  const handleCustomEntry = () => {
    // Splitwise submits through SplitwiseTracker, which replaces this form
    // entirely — guarded here too so an IOU can never reach the expenses table.
    if (logMode === "splitwise") return;
    if (!customExpense.description || !customExpense.amount) return;
    const amount = Number(customExpense.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const category =
      logMode === "income" ? INCOME_CATEGORY : customExpense.category;
    addExpense({
      description: customExpense.description,
      amount,
      category,
      date: isToday ? undefined : getSelectedDateISO(),
      source: activeSource || undefined,
      // Income isn't "spent for" anyone — always books against self so the
      // Self/Family split stays a pure breakdown of outgoing money.
      spend_for: logMode === "income" ? "self" : spendFor,
    });
    showNotification(
      logMode === "income"
        ? `Income ${format(amount)} logged`
        : `Logged ${format(amount)} for ${customExpense.description}${spendFor === "family" ? " (Family)" : ""}`,
      "success",
      true,
    );
    if (logMode === "expense") checkCategoryAlert(category, amount);
    setCustomExpense({
      description: "",
      amount: "",
      category: categories[0]?.name || "Misc",
      source: "",
    });
  };

  // Seed the Self/Family inputs. An absent spend_for_budgets key (every user
  // before this feature) prefills as all-self so the form opens already valid.
  const prefillAllocations = (budgetStr: string) => {
    const stored = metadata?.spend_for_budgets as
      | { self?: number; family?: number }
      | undefined;
    const budget = Number(budgetStr) || 0;
    setSelfAllocInput(String(stored?.self ?? budget));
    setFamilyAllocInput(String(stored?.family ?? 0));
    setSettingsError("");
  };

  const closeBudgetModal = () => {
    setShowBudgetModal(false);
    setSettingsError("");
  };

  const handleSaveSettings = async () => {
    const budget = Number(newBudget) || 0;
    const goal = Number(newGoal) || 0;
    const selfAlloc = Number(selfAllocInput) || 0;
    const familyAlloc = Number(familyAllocInput) || 0;

    // Validate before anything is written, so a rejected save leaves the modal
    // open and the cache untouched. `budget` is the raw entered value — never
    // metrics.monthlyBudget, which is inflated by borrowedThisMonth and would
    // make the sum unreachable in any month with an outstanding borrow.
    if (selfAlloc < 0 || familyAlloc < 0) {
      setSettingsError("Allocations can't be negative");
      return;
    }
    // Compared in integer cents to dodge float drift (0.1 + 0.2 !== 0.3).
    if (Math.round((selfAlloc + familyAlloc) * 100) !== Math.round(budget * 100)) {
      setSettingsError(
        `Self + Family must equal ${format(budget)} — currently ${format(selfAlloc + familyAlloc)}`,
      );
      return;
    }
    setSettingsError("");

    const expiry = new Date(today.getFullYear(), expiryMonth, expiryDay, 23, 59, 59);
    const nonCash = sourceDrafts.filter(s => s.name.trim() && s.name !== "Cash");
    const allocated = nonCash.reduce((sum, s) => sum + (Number(s.budget) || 0), 0);
    const cleanedSources = [
      { name: "Cash", budget: Math.max(0, budget - allocated) },
      ...nonCash.map(s => ({ name: s.name.trim(), budget: Number(s.budget) || 0 })),
    ];

    // Optimistic: update cache immediately so UI reflects change now
    queryClient.setQueryData(['profile', user?.id], (old: any) => ({
      ...old, monthly_budget: budget, savings_goal: goal,
    }));
    closeBudgetModal();

    // Queued (offline-safe): profile budget/goal + metadata expiry/sources.
    updateProfile({ monthly_budget: budget, savings_goal: goal });
    updateMetadata({
      budget_expiry: expiry.toISOString(),
      custom_sources: cleanedSources,
      monthly_budget: budget,
      savings_goal: goal,
      spend_for_budgets: { self: selfAlloc, family: familyAlloc },
    });
    showNotification("Budget settings saved", "success");
  };

  const openNewTemplate = (group: "commute" | "food" | "other") => {
    setTemplateDraft({
      ...EMPTY_DRAFT,
      group_name: group,
      category:
        categories.filter((c) => c.name !== INCOME_CATEGORY)[0]?.name || "Misc",
    });
  };

  const openEditTemplate = (t: QuickTemplate) => {
    setTemplateDraft({
      id: t.id,
      title: t.title,
      icon: t.icon,
      amount: t.amount.toString(),
      category: t.category,
      group_name: t.group_name,
    });
  };

  const handleSaveTemplate = () => {
    if (!templateDraft) return;
    const { id, title, icon, amount, category, group_name } = templateDraft;
    const amt = Number(amount);
    if (!title.trim() || !icon.trim() || isNaN(amt) || amt <= 0) {
      showNotification("Fill in all fields", "error");
      return;
    }
    if (id) {
      updateTemplate({
        id,
        title: title.trim(),
        icon: icon.trim(),
        amount: amt,
        category,
        group_name,
      });
      showNotification("Template updated", "success");
    } else {
      addTemplate({
        title: title.trim(),
        icon: icon.trim(),
        amount: amt,
        category,
        group_name,
      });
      showNotification("Template added", "success");
    }
    setTemplateDraft(null);
  };

  const handleDeleteTemplate = async () => {
    if (!templateDraft?.id) return;
    const id = templateDraft.id;
    setTemplateDraft(null);
    try {
      await deleteTemplateAsync(id);
      showNotification("Template deleted", "info");
    } catch (e: any) {
      showNotification(e.message || "Could not delete template", "error");
    }
  };

  if (isLoading) return <DashboardSkeleton />;

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["expenses", user?.id] });
    await queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    await queryClient.invalidateQueries({
      queryKey: ["quick_templates", user?.id],
    });
    setRefreshing(false);
    showNotification("Synced", "success");
  };

  const activeTemplates =
    quickLogTab === "commute"
      ? commuteTemplates
      : quickLogTab === "food"
        ? foodTemplates
        : otherTemplates;

  const showOnboardingGate = metadata?.is_new_user === true;

  // Skip loan-linked expenses (borrowed Income & repayment Lending) so per-source
  // totals only reflect real user spend/income, matching the global metrics.
  const perSourceSpendOnly = allExpenses.reduce((acc, exp) => {
    const src = (exp as any).source as string | undefined;
    if (!src) return acc;
    if (loanRelatedExpenseIds.has(exp.id || '')) return acc;
    const amount = Number(exp.amount);
    if (exp.category !== INCOME_CATEGORY && exp.category !== LOAN_RETURN_CATEGORY) {
      acc[src] = (acc[src] || 0) + amount;
    }
    return acc;
  }, {} as Record<string, number>);

  const perSourceIncome = allExpenses.reduce((acc, exp) => {
    const src = (exp as any).source as string | undefined;
    if (!src) return acc;
    if (loanRelatedExpenseIds.has(exp.id || '')) return acc;
    const amount = Number(exp.amount);
    if (exp.category === INCOME_CATEGORY) {
      acc[src] = (acc[src] || 0) + amount;
    }
    return acc;
  }, {} as Record<string, number>);

  const handleOnboardingSetup = async () => {
    const budget = Number(obBudget);
    if (!obBudget || budget < 1000) { setObError("Monthly budget must be at least " + format(1000)); return; }
    setObError("");
    setObSaving(true);
    try {
      const total = budget;
      const nonCash = obSources.filter(s => s.name !== "Cash" && s.name.trim());
      const allocated = nonCash.reduce((sum, s) => sum + (Number(s.budget) || 0), 0);
      const cleanedSources = [
        { name: "Cash", budget: Math.max(0, total - allocated) },
        ...nonCash.map(s => ({ name: s.name.trim(), budget: Number(s.budget) || 0 })),
      ];
      // Queued (offline-safe): profile + metadata. Flipping is_new_user in the
      // metadata cache optimistically dismisses the onboarding gate immediately.
      updateProfile({ monthly_budget: budget, savings_goal: Number(obGoal) || 0 });
      updateMetadata({
        is_new_user: false,
        onboarding_complete: true,
        custom_sources: cleanedSources,
        monthly_budget: budget,
        savings_goal: Number(obGoal) || 0,
        budget_period_start: new Date().toISOString(),
      });
    } catch (e: any) {
      setObError(e.message || "Could not save settings");
    } finally {
      setObSaving(false);
    }
  };

  const handleOnboardingSubmit = () => {
    if (!customExpense.description || !customExpense.amount) return;
    const amount = Number(customExpense.amount);
    if (isNaN(amount) || amount <= 0) return;
    addExpense({
      description: customExpense.description,
      amount,
      category: customExpense.category,
      source: customExpense.source || undefined,
    });
    updateMetadata({ is_new_user: false, onboarding_complete: true });
    showNotification(`Logged ${format(amount)} for ${customExpense.description}`, "success", true);
    setCustomExpense({ description: "", amount: "", category: categories[0]?.name || "Misc", source: "" });
  };

  const reminderEnabled = metadata?.reminder_enabled !== false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const loggedToday = expenses.some(
    (e) => e.created_at && new Date(e.created_at) >= startOfToday,
  );
  const showReminderBanner =
    reminderEnabled && !loggedToday && !reminderDismissed && !isAdding;

  return (
    <SafeAreaView className="flex-1 bg-app">
      <Modal visible={showOnboardingGate} animationType="fade" statusBarTranslucent>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 48, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={{ marginBottom: 40 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#34d399", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
                Step 1 of 1
              </Text>
              <Text style={{ fontSize: 38, fontWeight: "800", color: "#fff", letterSpacing: -1, lineHeight: 44, marginBottom: 10 }}>
                Set up your{"\n"}Wallet.
              </Text>
              <Text style={{ fontSize: 13, color: "#78716c", fontWeight: "500", lineHeight: 20 }}>
                Configure your monthly budget before you start tracking. You can change this anytime.
              </Text>
            </View>

            {/* Monthly Budget */}
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#a8a29e", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, marginLeft: 4 }}>
              Monthly Budget <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#111", borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16, borderWidth: 1, borderColor: obError && !obBudget ? "#ef4444" : "#292524", marginBottom: 6 }}>
              <Text style={{ color: "#57534e", fontSize: 20, fontWeight: "700", marginRight: 10 }}>{symbol}</Text>
              <TextInput
                placeholder="e.g. 30000"
                placeholderTextColor="#44403c"
                keyboardType="numeric"
                value={obBudget}
                onChangeText={v => { setObBudget(v); setObError(""); }}
                style={{ flex: 1, color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 }}
              />
            </View>
            <Text style={{ fontSize: 11, color: "#57534e", marginBottom: 20, marginLeft: 4 }}>Minimum {symbol}1,000</Text>

            {/* Savings Goal */}
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#a8a29e", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, marginLeft: 4 }}>
              Monthly Savings Goal <Text style={{ color: "#57534e" }}>(optional)</Text>
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#111", borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16, borderWidth: 1, borderColor: "#292524", marginBottom: 28 }}>
              <Text style={{ color: "#57534e", fontSize: 20, fontWeight: "700", marginRight: 10 }}>{symbol}</Text>
              <TextInput
                placeholder="e.g. 5000"
                placeholderTextColor="#44403c"
                keyboardType="numeric"
                value={obGoal}
                onChangeText={setObGoal}
                style={{ flex: 1, color: "#34d399", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 }}
              />
            </View>

            {/* Sources */}
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#a8a29e", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, marginLeft: 4 }}>
              Payment Sources <Text style={{ color: "#57534e" }}>(optional)</Text>
            </Text>
            <Text style={{ fontSize: 12, color: "#57534e", marginBottom: 12, marginLeft: 4 }}>
              Add sources like JazzCash or HBL. Cash gets the remaining budget.
            </Text>

            {/* Cash row — auto */}
            {(() => {
              const total = Number(obBudget) || 0;
              const allocated = obSources.filter(s => s.name !== "Cash").reduce((sum, s) => sum + (Number(s.budget) || 0), 0);
              const cashAmt = Math.max(0, total - allocated);
              return (
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#111", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: "#292524", marginBottom: 8 }}>
                  <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600", flex: 1 }}>Cash</Text>
                  <Text style={{ color: "#34d399", fontSize: 14, fontWeight: "700" }}>{total > 0 ? format(cashAmt) : "—"}</Text>
                  <Text style={{ color: "#57534e", fontSize: 11, marginLeft: 4 }}>auto</Text>
                </View>
              );
            })()}

            {obSources.filter(s => s.name !== "Cash").map((src, idx) => (
              <View key={idx} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#111", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#292524", marginBottom: 8, gap: 8 }}>
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", flex: 1 }} numberOfLines={1}>{src.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#000", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "#292524", width: 110 }}>
                  <Text style={{ color: "#57534e", fontSize: 12, marginRight: 4 }}>{symbol}</Text>
                  <TextInput
                    value={src.budget}
                    onChangeText={v => setObSources(prev => prev.map((s, i) => s.name === src.name ? { ...s, budget: v } : s))}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#44403c"
                    style={{ flex: 1, color: "#fff", fontSize: 12, fontWeight: "600" }}
                  />
                </View>
                <TouchableOpacity onPress={() => setObSources(prev => prev.filter(s => s.name !== src.name))} style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
                  <FontAwesome name="times-circle" size={16} color="#57534e" />
                </TouchableOpacity>
              </View>
            ))}

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 36 }}>
              <View style={{ flex: 1, backgroundColor: "#111", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: "#292524" }}>
                <TextInput
                  value={obSourceName}
                  onChangeText={setObSourceName}
                  placeholder="Source name"
                  placeholderTextColor="#44403c"
                  style={{ color: "#fff", fontSize: 13 }}
                />
              </View>
              <View style={{ backgroundColor: "#111", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: "#292524", width: 100 }}>
                <TextInput
                  value={obSourceBudget}
                  onChangeText={setObSourceBudget}
                  placeholder="Budget"
                  placeholderTextColor="#44403c"
                  keyboardType="numeric"
                  style={{ color: "#fff", fontSize: 13 }}
                />
              </View>
              <TouchableOpacity
                onPress={() => {
                  const name = obSourceName.trim();
                  if (!name || obSources.some(s => s.name.toLowerCase() === name.toLowerCase())) return;
                  setObSources(prev => [...prev, { name, budget: obSourceBudget }]);
                  setObSourceName(""); setObSourceBudget("");
                }}
                style={{ backgroundColor: "#1a2e23", borderRadius: 14, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#166534" }}
              >
                <FontAwesome name="plus" size={14} color="#34d399" />
              </TouchableOpacity>
            </View>

            {obError ? (
              <View style={{ backgroundColor: "#1a0a0a", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#7f1d1d" }}>
                <Text style={{ color: "#f87171", fontSize: 13, fontWeight: "600" }}>{obError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={handleOnboardingSetup}
              disabled={obSaving}
              style={{ backgroundColor: obSaving ? "#1a2e23" : "#059669", borderRadius: 18, paddingVertical: 18, alignItems: "center" }}
              activeOpacity={0.85}
            >
              {obSaving ? (
                <ActivityIndicator color="#34d399" />
              ) : (
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" }}>
                  Save & Open App
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
        style={{ flex: 1 }}
      >
        <ScrollView
          className="px-6"
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#34d399"
            />
          }
        >
          {/* Header */}
          <View className="flex-row justify-between items-center mb-5 mt-1">
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="text-3xl font-bold text-ink tracking-tight">
                  Hyper Wallet
                </Text>
                {streak >= 2 && (
                  <View className="ml-2 flex-row items-center bg-amber-500/15 border border-amber-500/30 px-2 py-1 rounded-full">
                    <Text className="text-amber-400 text-xs">🔥</Text>
                    <Text className="text-amber-300 text-xs font-bold ml-1">
                      {streak}
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-emerald-400 mt-1 text-[11px] font-semibold tracking-widest uppercase">
                Smart Tracking
              </Text>
            </View>
            <View className="flex-row items-center">
              <View className="mr-2">
                <SyncStatusIcon />
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowNotifModal(true);
                  markAllRead();
                }}
                className="w-11 h-11 bg-surface border border-line rounded-full items-center justify-center active:bg-elevated mr-2"
              >
                <FontAwesome name="bell" size={15} color="#34d399" />
                {unreadCount > 0 && (
                  <View className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-rose-500 rounded-full items-center justify-center border-2 border-black">
                    <Text className="text-ink text-[9px] font-bold">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Reminder Banner */}
          {showReminderBanner && (
            <Animated.View
              entering={FadeIn.duration(300)}
              className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 mb-5 flex-row items-center"
            >
              <View className="w-9 h-9 rounded-xl bg-amber-500/15 items-center justify-center mr-3">
                <FontAwesome name="bell-o" size={14} color="#fbbf24" />
              </View>
              <View className="flex-1">
                <Text className="text-amber-300 text-sm font-semibold">
                  Don't forget to log
                </Text>
                <Text className="text-amber-200/70 text-xs mt-0.5">
                  You haven't tracked any expense today.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReminderDismissed(true)}
                className="w-8 h-8 items-center justify-center"
              >
                <FontAwesome name="close" size={14} color="#fbbf24" />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* No-budget Banner — periods now restart automatically, so this only
              shows when there is genuinely no budget amount to carry forward. */}
          {!isLoading && monthlyBudget <= 0 && (
            <Animated.View
              entering={FadeIn.duration(300)}
              className="bg-violet-500/10 border border-violet-500/30 rounded-2xl px-4 py-3 mb-5 flex-row items-center"
            >
              <View className="w-9 h-9 rounded-xl bg-violet-500/15 items-center justify-center mr-3">
                <FontAwesome name="clock-o" size={14} color="#a78bfa" />
              </View>
              <View className="flex-1">
                <Text className="text-violet-300 text-sm font-semibold">
                  No budget set
                </Text>
                <Text className="text-violet-200/70 text-xs mt-0.5">
                  Set one to start tracking this period
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  prefillAllocations(newBudget);
                  setShowBudgetModal(true);
                }}
                className="px-3 py-2 rounded-xl bg-violet-500/20 border border-violet-500/30 active:bg-violet-500/30 ml-2"
              >
                <Text className="text-violet-300 text-xs font-bold">
                  Set Budget
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Hero Card */}
          <Animated.View
            entering={FadeIn.duration(400)}
            className={`rounded-3xl p-6 mb-5 ${displayLeftover < 0 ? "bg-rose-700" : "bg-emerald-600"}`}
          >
            <View className="flex-row justify-between items-start mb-1">
              <View className="flex-1">
                <Text className="text-emerald-100/80 text-[11px] font-semibold uppercase tracking-widest mb-2">
                  Monthly Leftover
                </Text>
                <Text className="text-4xl font-bold text-white tracking-tight">
                  {displayLeftover < 0 ? "-" : ""}
                  {format(Math.abs(displayLeftover))}
                </Text>
              </View>
              <View className="items-end gap-2">
                <View
                  className={`px-3 py-1.5 rounded-full ${displayLeftover >= 0 ? "bg-black/20" : "bg-black/30"}`}
                >
                  <Text className="text-white text-[11px] font-semibold uppercase tracking-wider">
                    {displayLeftover >= 0 ? "On Track" : "Deficit"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={async () => {
                    // Prefer fresh server values when online; fall back to cached
                    // profile/metadata when offline so the editor still opens.
                    let p: { monthly_budget?: number; savings_goal?: number } | null =
                      profile ? { monthly_budget: profile.monthly_budget, savings_goal: profile.savings_goal } : null;
                    let sources = (metadata?.custom_sources as any[]) || [{ name: "Cash", budget: 0 }];
                    if (isOnline()) {
                      try {
                        const [profileRes, userRes] = await Promise.all([
                          supabase.from('profiles').select('monthly_budget,savings_goal').eq('id', user!.id).single(),
                          supabase.auth.getUser(),
                        ]);
                        if (profileRes.data) p = profileRes.data;
                        const freshSources = userRes.data.user?.user_metadata?.custom_sources as any[] | undefined;
                        if (freshSources) sources = freshSources;
                      } catch {}
                    }
                    const budgetStr = p?.monthly_budget ? String(p.monthly_budget) : monthlyBudget ? String(monthlyBudget) : "";
                    setNewBudget(budgetStr);
                    setNewGoal(p?.savings_goal ? String(p.savings_goal) : savingsGoal ? String(savingsGoal) : "");
                    setSourceDrafts(sources.map((s: {name: string; budget: number}) => ({ name: s.name, budget: s.budget ? String(s.budget) : "" })));
                    // Explicit call rather than an effect on showBudgetModal:
                    // this handler is async and sets newBudget mid-await, so
                    // effect ordering here is easy to get subtly wrong.
                    prefillAllocations(budgetStr);
                    setShowBudgetModal(true);
                  }}
                  className="w-8 h-8 rounded-full bg-black/20 items-center justify-center active:bg-black/40"
                >
                  <FontAwesome name="pencil" size={12} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
              </View>
            </View>
            <Text className="text-emerald-100/60 text-[10px] font-semibold mb-4">
              {isBudgetExpired
                ? `Expired · ${monthNames[budgetExpiryDate.getMonth()]} ${budgetExpiryDate.getDate()}`
                : `Valid for ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? "s" : ""} · Expires ${monthNames[budgetExpiryDate.getMonth()]} ${budgetExpiryDate.getDate()}`}
            </Text>
            <View className="h-2 bg-black/20 rounded-full mb-5 overflow-hidden">
              <View
                className="h-full bg-white rounded-full"
                style={{ width: `${budgetUsedPercent}%` }}
              />
            </View>
            <View className="flex-row bg-black/10 rounded-2xl p-3">
              <View className="flex-1 px-2">
                <Text className="text-emerald-100/70 text-[10px] font-semibold uppercase tracking-wider mb-1">
                  Daily Avg
                </Text>
                <Text className="text-white text-base font-bold tracking-tight">
                  {format((() => { const first = displayExpenses.filter(e => e.created_at).map(e => new Date(e.created_at!).setHours(0,0,0,0)).reduce((m, d) => d < m ? d : m, Infinity); const days = first < Infinity ? Math.floor((new Date().setHours(0,0,0,0) - first) / 86400000) + 1 : 0; return days > 0 ? displayTotalMonthly / days : 0; })())}
                </Text>
              </View>
              <View className="w-px bg-black/20" />
              <View className="flex-1 px-2 items-center">
                <Text className="text-emerald-100/70 text-[10px] font-semibold uppercase tracking-wider mb-1">
                  Total Spent
                </Text>
                <Text className="text-white text-base font-bold tracking-tight">
                  {format(displayTotalMonthly)}
                </Text>
              </View>
              <View className="w-px bg-black/20" />
              <View className="flex-1 px-2 items-end">
                <Text className="text-emerald-100/70 text-[10px] font-semibold uppercase tracking-wider mb-1">
                  Income
                </Text>
                <Text className="text-white text-base font-bold tracking-tight">
                  {format(totalIncomeMonthly)}
                </Text>
              </View>
            </View>

            {savedSources.length > 0 && (Object.keys(perSourceSpendOnly).length > 0 || Object.keys(perSourceIncome).length > 0) && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                {savedSources.map(src => {
                  const income = perSourceIncome[src.name] || 0;
                  const budget = src.budget + income;
                  const spent = Math.max(0, perSourceSpendOnly[src.name] || 0);
                  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : null;
                  const over = budget > 0 && spent > budget;
                  return (
                    <View key={src.name} style={{ marginRight: 8, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 14, padding: 10, minWidth: 80 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>{src.name}</Text>
                      <Text style={{ color: over ? '#fca5a5' : '#fff', fontSize: 14, fontWeight: '800', letterSpacing: -0.3 }}>{format(spent)}</Text>
                      {budget > 0 && (
                        <>
                          <View style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 99, marginTop: 5, overflow: 'hidden' }}>
                            <View style={{ height: '100%', width: `${pct ?? 0}%`, backgroundColor: over ? '#f87171' : 'rgba(255,255,255,0.5)', borderRadius: 99 }} />
                          </View>
                          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, marginTop: 3 }}>of {format(budget)}</Text>
                        </>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </Animated.View>

          {/* Chart: Weekly / Monthly toggle */}
          <View className="bg-surface border border-line rounded-3xl p-5 mb-5">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center flex-1 mr-3">
                <View className="w-7 h-7 rounded-lg bg-surface border border-line items-center justify-center mr-3">
                  <FontAwesome name="bar-chart" size={12} color="#34d399" />
                </View>
                <Text className="text-ink text-base font-bold tracking-tight">
                  {chartView === "weekly"
                    ? "Weekly Overview"
                    : "Monthly Overview"}
                </Text>
                {chartView === "monthly" && (
                  <View className="ml-2 px-2 py-0.5 bg-rose-500/15 rounded-full border border-rose-500/20">
                    <Text className="text-rose-400 text-[10px] font-bold">
                      {format(displayTotalMonthly)}
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-row bg-app rounded-full p-1 border border-line">
                {(["weekly", "monthly"] as const).map((v) => (
                  <TouchableOpacity
                    key={v}
                    onPress={() => setChartView(v)}
                    className={`px-3 py-1.5 rounded-full ${chartView === v ? "bg-emerald-600" : ""}`}
                  >
                    <Text
                      className={`text-[11px] font-semibold uppercase tracking-wider ${chartView === v ? "text-white" : "text-muted"}`}
                    >
                      {v === "weekly" ? "Week" : "Month"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {chartView === "weekly" ? (
              <View style={{ height: 180 }} className="mt-2 mb-2">
                <View
                  className="flex-row justify-between items-end"
                  style={{ height: 140 }}
                >
                  {weekData.map((amount, idx) => {
                    const barH = (amount / maxExpense) * 100;
                    const isCurrent = idx === new Date().getDay();
                    return (
                      <View
                        key={idx}
                        className="items-center flex-1"
                        style={{ height: "100%" }}
                      >
                        <Text
                          className="text-muted text-[10px] font-semibold mb-1.5"
                          numberOfLines={1}
                          style={{ minHeight: 14 }}
                        >
                          {amount > 0
                            ? amount >= 100
                              ? `${(amount / 1000).toFixed(1)}k`
                              : Math.round(amount)
                            : ""}
                        </Text>
                        <View className="flex-1 w-6 bg-stone-800/60 rounded-t-lg overflow-hidden justify-end">
                          <View
                            className={`w-full rounded-t-lg ${isCurrent ? "bg-emerald-400" : "bg-emerald-600/70"}`}
                            style={{ height: `${barH}%` }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
                <View className="flex-row justify-between mt-2.5">
                  {days.map((d, idx) => {
                    const isCurrent = idx === new Date().getDay();
                    return (
                      <Text
                        key={idx}
                        className={`text-[11px] font-semibold flex-1 text-center ${isCurrent ? "text-emerald-400" : "text-muted"}`}
                      >
                        {d}
                      </Text>
                    );
                  })}
                </View>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mt-2"
              >
                <View style={{ height: 180 }}>
                  <View className="flex-row items-end" style={{ height: 148 }}>
                    {monthData.map((amount, idx) => {
                      const barH = Math.max(
                        (amount / maxMonthExpense) * 100,
                        amount > 0 ? 3 : 0,
                      );
                      const isCurrent = idx + 1 === todayDate;
                      return (
                        <View
                          key={idx}
                          className="items-center"
                          style={{ width: 26, marginHorizontal: 1 }}
                        >
                          <Text
                            className="text-faint text-[9px] font-semibold mb-1"
                            style={{ minHeight: 12 }}
                            numberOfLines={1}
                          >
                            {amount > 0
                              ? Math.round(amount / 1000) >= 1
                                ? `${(amount / 1000).toFixed(0)}k`
                                : Math.round(amount)
                              : ""}
                          </Text>
                          <View
                            style={{
                              width: 16,
                              flex: 1,
                              justifyContent: "flex-end",
                            }}
                            className="bg-stone-800/60 rounded-t-sm overflow-hidden"
                          >
                            <View
                              className={`w-full rounded-t-sm ${isCurrent ? "bg-emerald-400" : "bg-emerald-600/70"}`}
                              style={{ height: `${barH}%` }}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  <View className="flex-row mt-2">
                    {monthData.map((_, idx) => {
                      const isCurrent = idx + 1 === todayDate;
                      return (
                        <Text
                          key={idx}
                          className={`text-[9px] font-semibold text-center ${isCurrent ? "text-emerald-400" : "text-faint"}`}
                          style={{ width: 28 }}
                        >
                          {idx + 1}
                        </Text>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
            )}
          </View>

          {isAdding && (
            <View className="flex-row items-center justify-center mb-4 bg-emerald-500/10 py-2.5 rounded-full border border-emerald-500/20">
              <ActivityIndicator size="small" color="#34d399" />
              <Text className="text-emerald-300 ml-3 text-xs font-semibold uppercase tracking-widest">
                Syncing...
              </Text>
            </View>
          )}

          {/* Add Entry */}
          <View className="bg-surface border border-line rounded-3xl p-5 mb-3">
            {/* Three segments need the full row, so the date pill moved to its
                own line below. It's meaningless for a Splitwise IOU. */}
            <View className="mb-3">
              <Segmented
                options={LOG_MODE_OPTIONS}
                value={logMode}
                onChange={setLogMode}
                fullWidth
              />
            </View>
            {logMode !== "splitwise" && (
              <View className="flex-row justify-end mb-3">
                <TouchableOpacity
                  onPress={() => setShowDateModal(true)}
                  className={`flex-row items-center px-3 py-1.5 rounded-full border ${isToday ? "bg-stone-800/50 border-line" : "bg-amber-500/10 border-amber-500/30"}`}
                >
                  <FontAwesome name="calendar" size={10} color={isToday ? "#a8a29e" : "#fbbf24"} />
                  <Text className={`text-[11px] font-semibold ml-2 ${isToday ? "text-muted" : "text-amber-400"}`}>
                    {isToday ? "Today" : `${monthNames[selectedMonth]} ${selectedDay}`}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {logMode === "splitwise" ? (
              <SplitwiseTracker
                entries={splitwiseEntries}
                onPersist={persistSplitwise}
              />
            ) : (
              <>
                <TextInput
                  placeholder={logMode === "income" ? "Source of income" : "What did you spend on?"}
                  placeholderTextColor="#78716c"
                  value={customExpense.description}
                  onChangeText={text => setCustomExpense(prev => ({ ...prev, description: text }))}
                  className="bg-app text-ink text-sm px-4 py-3.5 rounded-2xl mb-3 border border-line"
                />
                {logMode === "expense" && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                    {categories.filter(c => c.name !== INCOME_CATEGORY).map(cat => (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() => setCustomExpense(prev => ({ ...prev, category: cat.name }))}
                        className={`px-3.5 py-2 mr-2 rounded-full border ${customExpense.category === cat.name ? "bg-emerald-600 border-emerald-500" : "bg-app border-line"}`}
                      >
                        <Text className={`text-xs font-semibold ${customExpense.category === cat.name ? "text-white" : "text-muted"}`}>
                          {cat.icon} {cat.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                {logMode === "expense" && (
                  <SpendForPicker value={spendFor} onChange={setSpendFor} label="Spent for" />
                )}
                {savedSources.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                    {savedSources.map(src => (
                      <TouchableOpacity
                        key={src.name}
                        onPress={() => setActiveSource(src.name)}
                        className={`px-3 py-1.5 mr-2 rounded-full border ${activeSource === src.name ? "bg-faint border-stone-500" : "bg-app border-line"}`}
                      >
                        <Text className={`text-xs font-semibold ${activeSource === src.name ? "text-white" : "text-muted"}`}>
                          {src.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <View className="flex-row items-center bg-app rounded-2xl px-4 py-3 border border-line mb-3">
                  <Text className="text-muted text-base font-semibold mr-2">{symbol}</Text>
                  <TextInput
                    placeholder="0"
                    placeholderTextColor="#78716c"
                    keyboardType="numeric"
                    value={customExpense.amount}
                    onChangeText={text => setCustomExpense(prev => ({ ...prev, amount: text }))}
                    className="flex-1 text-ink font-bold text-lg"
                  />
                </View>
                <BounceCard
                  onPress={handleCustomEntry}
                  className={`py-3.5 rounded-2xl items-center ${logMode === "income" ? "bg-emerald-600 active:bg-emerald-500" : "bg-rose-500 active:bg-rose-400"}`}
                >
                  <Text className="text-white text-sm font-bold uppercase tracking-wider">
                    {logMode === "income" ? "Add Income" : "Add Expense"}
                  </Text>
                </BounceCard>
              </>
            )}
          </View>

          {/* Quick Log */}
          <View className="bg-surface border border-line rounded-3xl p-5 mb-5">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <View className="w-7 h-7 rounded-lg bg-app border border-line items-center justify-center mr-3">
                  <FontAwesome name="bolt" size={12} color="#34d399" />
                </View>
                <Text className="text-ink text-base font-bold tracking-tight">
                  Quick Log
                </Text>
              </View>
              <View className="flex-row bg-app rounded-full p-1 border border-line">
                {(["commute", "food", "other"] as const).map((g) => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setQuickLogTab(g)}
                    className={`px-3 py-1.5 rounded-full ${quickLogTab === g ? "bg-emerald-600" : ""}`}
                  >
                    <Text
                      className={`text-[11px] font-semibold uppercase tracking-wider ${quickLogTab === g ? "text-white" : "text-muted"}`}
                    >
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View className="flex-row flex-wrap -mx-1">
              {activeTemplates.map((t) => (
                <View
                  key={t.id}
                  style={{ width: "33.33%" }}
                  className="px-1 mb-2"
                >
                  <BounceCard
                    onPress={() => handleTemplateLog(t.id, t.title, t.category)}
                    onLongPress={() => openEditTemplate(t)}
                    className="bg-black/40 border border-line rounded-2xl py-3 px-2 items-center"
                  >
                    {/* Visible edit affordance (works for predefined & custom templates) */}
                    <TouchableOpacity
                      onPress={() => openEditTemplate(t)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, zIndex: 10 }}
                    >
                      <FontAwesome name="pencil" size={10} color={colors.muted} />
                    </TouchableOpacity>
                    <Text className="text-2xl mb-2">{t.icon}</Text>
                    <Text
                      className="text-ink text-[11px] font-semibold uppercase tracking-wider text-center mb-2.5"
                      numberOfLines={1}
                    >
                      {t.title}
                    </Text>
                    <View className="flex-row items-center bg-surface rounded-lg px-2 py-1 mb-2 border border-line w-full">
                      <Text className="text-muted text-[10px] mr-1">{symbol}</Text>
                      <TextInput
                        value={templateAmounts[t.id] ?? t.amount.toString()}
                        onChangeText={(val) => setTemplateAmounts(prev => ({ ...prev, [t.id]: val }))}
                        keyboardType="numeric"
                        className="text-ink font-semibold text-xs flex-1 py-0.5 text-center"
                      />
                    </View>
                    {savedSources.length > 1 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%', marginBottom: 8 }}>
                        {savedSources.map(src => {
                          const selected = (templateSources[t.id] ?? savedSources[0]?.name) === src.name;
                          return (
                            <TouchableOpacity
                              key={src.name}
                              onPress={e => { e.stopPropagation?.(); setTemplateSources(prev => ({ ...prev, [t.id]: src.name })); }}
                              style={{
                                paddingHorizontal: 8, paddingVertical: 3, marginRight: 4, borderRadius: 99,
                                backgroundColor: selected ? '#059669' : colors.elevated,
                                borderWidth: 1, borderColor: selected ? '#10b981' : colors.line,
                              }}
                            >
                              <Text style={{ fontSize: 9, fontWeight: '700', color: selected ? '#fff' : colors.faint }}>
                                {src.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                    <View className="bg-emerald-600 w-full py-2 rounded-xl items-center">
                      <Text className="text-white text-[11px] font-bold uppercase tracking-wider">
                        Log
                      </Text>
                    </View>
                  </BounceCard>
                </View>
              ))}
              <View style={{ width: "33.33%" }} className="px-1 mb-2">
                <TouchableOpacity
                  onPress={() => openNewTemplate(quickLogTab)}
                  className="bg-black/20 border border-dashed border-line rounded-2xl py-3 px-2 items-center justify-center"
                  style={{ minHeight: 120 }}
                >
                  <View className="w-10 h-10 rounded-full bg-elevated items-center justify-center mb-2">
                    <FontAwesome name="plus" size={14} color="#78716c" />
                  </View>
                  <Text className="text-muted text-[11px] font-semibold uppercase tracking-wider text-center">
                    Add Template
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {activeTemplates.length > 0 && (
              <Text className="text-faint text-[10px] text-center mt-2 uppercase tracking-widest">
                Tap ✎ to edit or delete a template
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date Picker Modal */}
      <Modal
        visible={showDateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDateModal(false)}
      >
        <Pressable
          onPress={() => setShowDateModal(false)}
          className="flex-1 justify-end bg-black/80"
        >
          <Pressable
            onPress={() => {}}
            className="bg-surface rounded-t-3xl p-6 border-t border-line"
          >
            <TouchableOpacity onPress={() => setShowDateModal(false)} activeOpacity={0.6} className="self-center mb-6 py-2 px-8">
              <View className="w-12 h-1.5 bg-faint rounded-full" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-ink tracking-tight mb-1">
              Select Date
            </Text>
            <Text className="text-muted text-sm mb-5">
              Choose when this entry was made
            </Text>
            <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Month
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-4"
            >
              {monthNames.map((m, idx) => {
                if (idx > today.getMonth()) return null;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => {
                      setSelectedMonth(idx);
                      if (
                        selectedDay >
                        new Date(selectedYear, idx + 1, 0).getDate()
                      )
                        setSelectedDay(1);
                    }}
                    className={`px-3.5 py-2 mr-2 rounded-full border ${selectedMonth === idx ? "bg-emerald-600 border-emerald-500" : "bg-app border-line"}`}
                  >
                    <Text
                      className={`text-xs font-semibold uppercase tracking-wider ${selectedMonth === idx ? "text-white" : "text-muted"}`}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Day
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-6"
            >
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                if (selectedMonth === today.getMonth() && d > today.getDate())
                  return null;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setSelectedDay(d)}
                    className={`w-10 h-10 mr-1.5 rounded-full items-center justify-center border ${selectedDay === d ? "bg-emerald-600 border-emerald-500" : "bg-app border-line"}`}
                  >
                    <Text
                      className={`text-xs font-semibold ${selectedDay === d ? "text-white" : "text-muted"}`}
                    >
                      {d}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setShowDateModal(false)}
              className="py-4 rounded-2xl bg-emerald-600 items-center"
            >
              <Text className="text-white text-sm font-bold uppercase tracking-wider">
                Done
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={showBudgetModal}
        animationType="slide"
        transparent={false}
        onRequestClose={closeBudgetModal}
      >
        <View style={{ flex: 1, backgroundColor: colors.app }}>
          <View style={{ flex: 1, backgroundColor: colors.app }}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
                showsVerticalScrollIndicator={false}
              >
            <View className="flex-row items-center justify-between mb-6 mt-2">
              <Text className="text-2xl font-bold text-ink tracking-tight">Wallet Settings</Text>
              <TouchableOpacity
                onPress={closeBudgetModal}
                className="w-10 h-10 rounded-full bg-elevated items-center justify-center active:bg-faint"
              >
                <FontAwesome name="times" size={16} color="#a8a29e" />
              </TouchableOpacity>
            </View>
            <Text className="text-muted text-sm mb-5">Configure your monthly budget, goals & sources</Text>
            <Text className="text-emerald-400 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Monthly Budget
            </Text>
            <View className="bg-app rounded-2xl p-4 border border-line mb-4 flex-row items-center">
              <Text className="text-muted text-lg font-semibold mr-3">
                {symbol}
              </Text>
              <TextInput
                className="flex-1 text-ink text-xl font-bold tracking-tight"
                keyboardType="numeric"
                value={newBudget}
                onChangeText={text => {
                  setNewBudget(text);
                  if (settingsError) setSettingsError("");
                }}
              />
            </View>

            <Text className="text-emerald-400 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Budget Split
            </Text>
            <Text className="text-muted text-xs mb-3 ml-1">
              Self + Family must add up to your monthly budget.
            </Text>
            <View className="flex-row gap-3 mb-2">
              {SPEND_FOR_VALUES.map(scope => {
                const isSelf = scope === "self";
                const value = isSelf ? selfAllocInput : familyAllocInput;
                const setValue = isSelf ? setSelfAllocInput : setFamilyAllocInput;
                return (
                  <View
                    key={scope}
                    className="flex-1 bg-app rounded-2xl px-4 py-3 border border-line"
                  >
                    <Text
                      className="text-[11px] font-semibold uppercase tracking-widest mb-1"
                      style={{ color: SPEND_FOR_COLOR[scope] }}
                    >
                      {SPEND_FOR_ICON[scope]} {SPEND_FOR_LABEL[scope]}
                    </Text>
                    <View className="flex-row items-center">
                      <Text className="text-muted text-sm font-semibold mr-2">
                        {symbol}
                      </Text>
                      <TextInput
                        className="flex-1 text-ink text-base font-bold tracking-tight"
                        keyboardType="numeric"
                        value={value}
                        onChangeText={text => {
                          setValue(text);
                          if (settingsError) setSettingsError("");
                        }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
            {(() => {
              const remainder =
                (Number(newBudget) || 0) -
                (Number(selfAllocInput) || 0) -
                (Number(familyAllocInput) || 0);
              const balanced = Math.round(remainder * 100) === 0;
              return (
                <Text
                  className={`text-[11px] font-semibold uppercase tracking-widest mb-5 ml-1 ${balanced ? "text-muted" : "text-rose-400"}`}
                >
                  {balanced
                    ? "Fully allocated"
                    : remainder > 0
                      ? `Unallocated ${format(remainder)}`
                      : `Over by ${format(-remainder)}`}
                </Text>
              );
            })()}

            <Text className="text-emerald-400 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Monthly Savings Goal
            </Text>
            <View className="bg-app rounded-2xl p-4 border border-emerald-900/30 mb-5 flex-row items-center">
              <Text className="text-muted text-lg font-semibold mr-3">
                {symbol}
              </Text>
              <TextInput
                className="flex-1 text-emerald-400 text-xl font-bold tracking-tight"
                keyboardType="numeric"
                value={newGoal}
                onChangeText={setNewGoal}
              />
            </View>
            {(() => {
              const total = Number(newBudget) || 0;
              const nonCash = sourceDrafts.filter(s => s.name !== "Cash");
              const allocated = nonCash.reduce((sum, s) => sum + (Number(s.budget) || 0), 0);
              const cashRemainder = Math.max(0, total - allocated);
              return (
                <>
                  <Text className="text-emerald-400 text-[11px] font-semibold uppercase tracking-widest mb-1 ml-1">
                    Sources
                  </Text>
                  <Text className="text-muted text-xs mb-3 ml-1">
                    Divide your budget across payment sources. Cash holds the remainder.
                  </Text>

                  {/* Cash — auto remainder */}
                  <View className="flex-row items-center bg-app rounded-2xl px-4 py-3 border border-line mb-2">
                    <Text className="text-ink text-sm font-semibold flex-1">Cash</Text>
                    <Text className="text-emerald-400 text-sm font-bold">{format(cashRemainder)}</Text>
                    <Text className="text-faint text-xs ml-1">remaining</Text>
                  </View>

                  {/* Non-cash sources */}
                  {nonCash.map((src, _idx) => {
                    const globalIdx = sourceDrafts.findIndex(s => s.name === src.name);
                    const amt = Number(src.budget) || 0;
                    return (
                      <View key={src.name} className="flex-row items-center bg-app rounded-2xl px-3 py-2.5 border border-line mb-2 gap-2">
                        <Text className="text-ink text-sm font-semibold flex-1" numberOfLines={1}>{src.name}</Text>
                        <View className="flex-row items-center bg-surface rounded-xl px-2 py-1.5 border border-line w-24">
                          <Text className="text-muted text-xs mr-1">{symbol}</Text>
                          <TextInput
                            value={src.budget}
                            onChangeText={v => setSourceDrafts(prev => prev.map((s, i) => i === globalIdx ? { ...s, budget: v } : s))}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#57534e"
                            className="flex-1 text-ink text-xs font-semibold"
                          />
                        </View>
                        {total > 0 && (
                          <Text className="text-muted text-[10px] w-20">
                            {`/ ${format(total)}`}
                          </Text>
                        )}
                        <TouchableOpacity
                          onPress={() => setSourceDrafts(prev => prev.filter((_, i) => i !== globalIdx))}
                          className="w-7 h-7 items-center justify-center"
                        >
                          <FontAwesome name="times-circle" size={16} color="#78716c" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                  {/* Add new source */}
                  <View className="flex-row gap-2 mb-5">
                    <View className="flex-1 bg-app rounded-2xl px-3 py-2.5 border border-line">
                      <TextInput
                        value={newSourceName}
                        onChangeText={setNewSourceName}
                        placeholder="New source (e.g. JazzCash)"
                        placeholderTextColor="#57534e"
                        className="text-ink text-sm"
                      />
                    </View>
                    <View className="bg-app rounded-2xl px-3 py-2.5 border border-line w-24">
                      <TextInput
                        value={newSourceBudget}
                        onChangeText={setNewSourceBudget}
                        placeholder="Amount"
                        placeholderTextColor="#57534e"
                        keyboardType="numeric"
                        className="text-ink text-sm"
                      />
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        const name = newSourceName.trim();
                        if (!name || sourceDrafts.some(s => s.name.toLowerCase() === name.toLowerCase())) return;
                        setSourceDrafts(prev => [...prev, { name, budget: newSourceBudget }]);
                        setNewSourceName("");
                        setNewSourceBudget("");
                      }}
                      className="bg-emerald-600 rounded-2xl px-4 items-center justify-center active:bg-emerald-500"
                    >
                      <FontAwesome name="plus" size={14} color="white" />
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}

            <Text className="text-emerald-400 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Budget Expiry Date
            </Text>
            <Text className="text-muted text-xs mb-3 ml-1">
              Leftover moves to savings after this date
            </Text>
            <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Month
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-3"
            >
              {monthNames.map((m, idx) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => {
                    setExpiryMonth(idx);
                    const maxDay = new Date(
                      today.getFullYear(),
                      idx + 1,
                      0,
                    ).getDate();
                    if (expiryDay > maxDay) setExpiryDay(maxDay);
                  }}
                  className={`px-3.5 py-2 mr-2 rounded-full border ${expiryMonth === idx ? "bg-emerald-600 border-emerald-500" : "bg-app border-line"}`}
                >
                  <Text
                    className={`text-xs font-semibold uppercase tracking-wider ${expiryMonth === idx ? "text-white" : "text-muted"}`}
                  >
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Day
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-5"
            >
              {Array.from(
                {
                  length: new Date(
                    today.getFullYear(),
                    expiryMonth + 1,
                    0,
                  ).getDate(),
                },
                (_, i) => i + 1,
              ).map((d) => (
                <TouchableOpacity
                  key={d}
                  onPress={() => setExpiryDay(d)}
                  className={`w-10 h-10 mr-1.5 rounded-full items-center justify-center border ${expiryDay === d ? "bg-emerald-600 border-emerald-500" : "bg-app border-line"}`}
                >
                  <Text
                    className={`text-xs font-semibold ${expiryDay === d ? "text-white" : "text-muted"}`}
                  >
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View className="bg-black/40 p-4 rounded-2xl border border-line mb-5">
              <View className="flex-row justify-between">
                <View>
                  <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest mb-1">
                    Weekly Split
                  </Text>
                  <Text className="text-ink text-base font-bold tracking-tight">
                    {format(Number(newBudget) / 4)}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest mb-1">
                    Daily Limit
                  </Text>
                  <Text className="text-ink text-base font-bold tracking-tight">
                    {format(Number(newBudget) / 30)}
                  </Text>
                </View>
              </View>
            </View>
            {settingsError ? (
              <View style={{ backgroundColor: "#1a0a0a", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#7f1d1d" }}>
                <Text style={{ color: "#f87171", fontSize: 13, fontWeight: "600" }}>{settingsError}</Text>
              </View>
            ) : null}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={closeBudgetModal}
                className="flex-1 py-4 rounded-2xl bg-elevated items-center"
              >
                <Text className="text-ink text-sm font-semibold uppercase tracking-wider">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveSettings}
                className="flex-1 py-4 rounded-2xl bg-emerald-600 items-center"
              >
                <Text className="text-white text-sm font-bold uppercase tracking-wider">
                  Save
                </Text>
              </TouchableOpacity>
            </View>
              </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Notifications Modal */}

      <Modal
        visible={showNotifModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNotifModal(false)}
      >
        <Pressable
          onPress={() => setShowNotifModal(false)}
          className="flex-1 justify-end bg-black/80"
        >
          <Pressable
            onPress={() => {}}
            className="bg-surface rounded-t-3xl border-t border-line"
            style={{ maxHeight: "75%" }}
          >
            <View className="p-6 pb-4">
              <TouchableOpacity onPress={() => setShowNotifModal(false)} activeOpacity={0.6} className="self-center mb-5 py-2 px-8">
                <View className="w-12 h-1.5 bg-faint rounded-full" />
              </TouchableOpacity>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xl font-bold text-ink tracking-tight">
                  Notifications
                </Text>
                {history.length > 0 && (
                  <TouchableOpacity
                    onPress={clearHistory}
                    className="px-3 py-1.5 rounded-full bg-elevated active:bg-faint"
                  >
                    <Text className="text-ink text-[11px] font-semibold uppercase tracking-wider">
                      Clear
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text className="text-muted text-sm">
                Recent activity from this session
              </Text>
            </View>
            <ScrollView
              className="px-6"
              contentContainerStyle={{ paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              {history.length === 0 ? (
                <View className="py-12 items-center">
                  <View className="w-14 h-14 bg-stone-800/50 rounded-2xl items-center justify-center mb-3">
                    <FontAwesome name="bell-o" size={20} color="#52525b" />
                  </View>
                  <Text className="text-muted text-sm font-semibold text-center">
                    No notifications
                  </Text>
                </View>
              ) : (
                history.map((item) => {
                  const dotColor =
                    item.type === "success"
                      ? "#34d399"
                      : item.type === "error"
                        ? "#f43f5e"
                        : "#a8a29e";
                  const iconName =
                    item.type === "success"
                      ? "check"
                      : item.type === "error"
                        ? "exclamation"
                        : "info";
                  return (
                    <View
                      key={item.id}
                      className="flex-row items-start bg-black/40 border border-line rounded-2xl px-4 py-3 mb-2"
                    >
                      <View
                        className="w-8 h-8 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: `${dotColor}22` }}
                      >
                        <FontAwesome
                          name={iconName}
                          size={11}
                          color={dotColor}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-ink text-sm font-semibold">
                          {item.message}
                        </Text>
                        <Text className="text-muted text-[11px] mt-0.5">
                          {new Date(item.at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
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

      {/* Template Editor Modal — full screen */}
      <Modal
        visible={!!templateDraft}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setTemplateDraft(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.app }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 }}>
              {templateDraft?.id ? "Edit Template" : "New Template"}
            </Text>
            <TouchableOpacity
              onPress={() => setTemplateDraft(null)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
            >
              <FontAwesome name="times" size={14} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 24, paddingBottom: 56 }}
                showsVerticalScrollIndicator={false}
              >
            <Text className="text-muted text-sm mb-5">
              Quick log buttons for frequent expenses
            </Text>

            <View className="flex-row mb-3">
              <View className="mr-3">
                <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
                  Icon
                </Text>
                <View className="bg-app rounded-2xl border border-line w-16 h-14 items-center justify-center">
                  <TextInput
                    value={templateDraft?.icon || ""}
                    onChangeText={(v) =>
                      setTemplateDraft((d) => d && { ...d, icon: v })
                    }
                    maxLength={2}
                    className="text-2xl text-center"
                  />
                </View>
              </View>
              <View className="flex-1">
                <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
                  Title
                </Text>
                <TextInput
                  placeholder="e.g. Coffee"
                  placeholderTextColor="#78716c"
                  value={templateDraft?.title || ""}
                  onChangeText={(v) =>
                    setTemplateDraft((d) => d && { ...d, title: v })
                  }
                  className="bg-app text-ink text-sm px-4 py-3.5 rounded-2xl border border-line"
                />
              </View>
            </View>

            <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Default Amount
            </Text>
            <View className="flex-row items-center bg-app rounded-2xl px-4 py-3 border border-line mb-3">
              <Text className="text-muted text-lg font-semibold mr-3">
                {symbol}
              </Text>
              <TextInput
                placeholder="0"
                placeholderTextColor="#78716c"
                keyboardType="numeric"
                value={templateDraft?.amount || ""}
                onChangeText={(v) =>
                  setTemplateDraft((d) => d && { ...d, amount: v })
                }
                className="flex-1 text-ink text-lg font-bold"
              />
            </View>

            <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Category
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-3"
            >
              {categories
                .filter((c) => c.name !== INCOME_CATEGORY)
                .map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() =>
                      setTemplateDraft((d) => d && { ...d, category: cat.name })
                    }
                    className={`px-3.5 py-2 mr-2 rounded-full border ${templateDraft?.category === cat.name ? "bg-emerald-600 border-emerald-500" : "bg-app border-line"}`}
                  >
                    <Text
                      className={`text-xs font-semibold ${templateDraft?.category === cat.name ? "text-white" : "text-muted"}`}
                    >
                      {cat.icon} {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>

            <Text className="text-muted text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">
              Group
            </Text>
            <View className="flex-row -mx-1 mb-5">
              {(["commute", "food", "other"] as const).map((g) => (
                <TouchableOpacity
                  key={g}
                  onPress={() =>
                    setTemplateDraft((d) => d && { ...d, group_name: g })
                  }
                  className={`flex-1 mx-1 py-2.5 rounded-2xl border items-center ${templateDraft?.group_name === g ? "bg-emerald-600 border-emerald-500" : "bg-app border-line"}`}
                >
                  <Text
                    className={`text-[11px] font-semibold uppercase tracking-wider ${templateDraft?.group_name === g ? "text-white" : "text-muted"}`}
                  >
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="flex-row gap-3">
              {templateDraft?.id && (
                <TouchableOpacity
                  onPress={handleDeleteTemplate}
                  className="py-4 px-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 items-center"
                >
                  <FontAwesome name="trash" size={14} color="#f43f5e" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setTemplateDraft(null)}
                className="flex-1 py-4 rounded-2xl bg-elevated items-center"
              >
                <Text className="text-ink text-sm font-semibold uppercase tracking-wider">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveTemplate}
                className="flex-1 py-4 rounded-2xl bg-emerald-600 items-center"
              >
                <Text className="text-white text-sm font-bold uppercase tracking-wider">
                  {templateDraft?.id ? "Update" : "Add"}
                </Text>
              </TouchableOpacity>
            </View>
              </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}
