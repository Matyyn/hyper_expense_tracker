import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, ScrollView, TouchableOpacity, StatusBar as RNStatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

type TipRow = { icon: string; text: string };

function GuideCard({
  emoji,
  title,
  body,
  tips,
}: {
  emoji: string;
  title: string;
  body: string;
  tips?: TipRow[];
}) {
  return (
    <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-3">
      <View className="flex-row items-center mb-3">
        <View className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 items-center justify-center mr-3">
          <Text style={{ fontSize: 16 }}>{emoji}</Text>
        </View>
        <Text className="text-white text-base font-bold tracking-tight flex-1" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Text className="text-stone-400 text-sm leading-relaxed">{body}</Text>
      {tips && tips.length > 0 && (
        <View className="mt-3 pt-3 border-t border-stone-800">
          {tips.map((t, idx) => (
            <View
              key={idx}
              className="flex-row items-start"
              style={{ marginBottom: idx === tips.length - 1 ? 0 : 6 }}
            >
              <Text className="text-emerald-400 text-xs mr-2 mt-0.5">{t.icon}</Text>
              <Text className="text-stone-400 text-xs leading-relaxed flex-1">{t.text}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ModalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0);

  const proTips = [
    'Log expenses daily to keep your streak alive 🔥',
    'Use sources to know exactly which wallet to top up',
    'Edit Quick Log amounts inline before tapping — the new value sticks',
    'Borrow + repay in the same month cancels out automatically',
    'Check Daily Burn in the hero card to know your safe daily spend',
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#000' }}
        contentContainerStyle={{ paddingTop: topPad + 4, paddingHorizontal: 24, paddingBottom: 0 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center mb-5 mt-1">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-11 h-11 bg-stone-900 border border-stone-800 rounded-full items-center justify-center active:bg-stone-800 mr-3"
          >
            <FontAwesome name="chevron-left" size={14} color="#34d399" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-3xl font-bold text-white tracking-tight">App Guide</Text>
            <Text className="text-emerald-400 mt-1 text-[11px] font-semibold tracking-widest uppercase">
              How Hyper Expense Works
            </Text>
          </View>
        </View>

        <GuideCard
          emoji="💰"
          title="Wallet Dashboard"
          body="Your command center. The hero card shows your monthly leftover (budget + income − spend) and expiry countdown. Use the pencil icon to set Monthly Budget, Savings Goal, and Payment Sources."
          tips={[
            { icon: '›', text: 'Toggle Expense / Income to log either type' },
            { icon: '›', text: 'Pick a past date from the calendar pill to backfill missed entries' },
            { icon: '›', text: 'Tap a Quick Log template for one-tap recurring expenses' },
          ]}
        />

        <GuideCard
          emoji="🧾"
          title="Quick Log Templates"
          body="Save recurring expenses (rickshaw fare, lunch, etc.) under Commute, Food, or Other. Edit the amount inline before tapping a template — the new amount is remembered next time."
          tips={[
            { icon: '›', text: 'Long-press a template to edit its title, icon, category, or amount' },
            { icon: '›', text: 'Set a source per template so the right wallet bucket is charged' },
          ]}
        />

        <GuideCard
          emoji="🏦"
          title="Payment Sources"
          body="Split your monthly budget across sources like Cash, JazzCash, or a bank account. Cash auto-fills with whatever budget remains after allocations."
          tips={[
            { icon: '›', text: 'Each source has its own budget bar in the Wallet hero card' },
            { icon: '›', text: 'Income added to a source increases its available budget' },
          ]}
        />

        <GuideCard
          emoji="🤝"
          title="Loans (Lent & Borrowed)"
          body="Track money you've lent out or borrowed. Borrowed amounts add to your monthly budget; repayments deduct automatically. A loan auto-settles the moment the full amount is paid back — no need to tap Settle manually."
          tips={[
            { icon: '›', text: 'Add partial payments anytime — wallet & analytics update instantly' },
            { icon: '›', text: 'Deleting a payment reopens the loan if it was already settled' },
            { icon: '›', text: 'Lent repayments cancel the original lend; borrowed repayments log as outflow' },
          ]}
        />

        <GuideCard
          emoji="📜"
          title="History"
          body="Every expense and income grouped by date. Filter by category, sort by newest, oldest, highest, or lowest. Long-press any entry to delete it."
          tips={[
            { icon: '›', text: 'Loan-related rows are hidden here — they live in the Loans screen' },
          ]}
        />

        <GuideCard
          emoji="💎"
          title="Savings Vault"
          body="Track all-time accumulated savings and your monthly goal. When your budget period ends with money left over, the Wallet shows a Transfer banner that moves the leftover into your vault."
          tips={[
            { icon: '›', text: 'Set a monthly savings target to see your goal progress bar' },
          ]}
        />

        <GuideCard
          emoji="📊"
          title="Analytics"
          body="See exactly where your money goes. Category breakdown, weekly trend, source split, and budget utilization — all for the current month."
          tips={[
            { icon: '›', text: 'Tap Set Limits to set per-category alert thresholds (80% and 100%)' },
            { icon: '›', text: 'You’ll get a push notification when a category crosses its limit' },
          ]}
        />

        <GuideCard
          emoji="🔔"
          title="Notifications & Reminders"
          body="Push notifications alert you when a category hits 80% or 100% of its limit, and 3 / 1 day before your budget period expires."
          tips={[
            { icon: '›', text: 'Toggle daily reminders from Settings if you want a nudge to log' },
          ]}
        />

        <GuideCard
          emoji="⚙️"
          title="Settings"
          body="Change currency, manage your account, update password, or wipe all data. Currency changes apply across every screen instantly."
        />

        <View className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-5 mt-2 mb-6">
          <Text className="text-emerald-400 text-[11px] font-bold tracking-widest uppercase mb-3">
            Pro Tips
          </Text>
          {proTips.map((tip, idx) => (
            <View
              key={idx}
              className="flex-row items-start"
              style={{ marginBottom: idx === proTips.length - 1 ? 0 : 8 }}
            >
              <Text className="text-emerald-400 text-xs mr-2 mt-0.5">•</Text>
              <Text className="text-stone-300 text-xs leading-relaxed flex-1">{tip}</Text>
            </View>
          ))}
        </View>

        <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
      </ScrollView>
    </View>
  );
}
