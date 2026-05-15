import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ModalScreen() {
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} className="flex-1 bg-black">
      <ScrollView
        className="flex-1 bg-black"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-5">
          <Text className="text-3xl font-bold text-white tracking-tight">App Guide</Text>
          <Text className="text-emerald-400 mt-1 text-[11px] font-semibold tracking-widest uppercase">Learn How to Use Hyper Expense</Text>
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-3">
          <Text className="text-white text-base font-bold mb-2 tracking-tight">💰 Wallet Dashboard</Text>
          <Text className="text-stone-400 text-sm leading-relaxed">
            Your command center. Tap the gear icon to set your Monthly Budget. Use the Quick Log section for commute and meals, or add any custom expense with a description, category, and amount. You can also pick a past date to log missed expenses.
          </Text>
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-3">
          <Text className="text-white text-base font-bold mb-2 tracking-tight">📜 History</Text>
          <Text className="text-stone-400 text-sm leading-relaxed">
            View all your expenses grouped by date. Use the sort controls (Newest, Oldest, Highest, Lowest) and category filters to find specific entries. Long-press any entry to delete it if it was logged by mistake.
          </Text>
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-3">
          <Text className="text-white text-base font-bold mb-2 tracking-tight">🏦 Savings Vault</Text>
          <Text className="text-stone-400 text-sm leading-relaxed">
            Track your all-time accumulated savings and set a custom monthly savings goal. The progress bar shows how close you are to hitting your target based on your projected end-of-month savings.
          </Text>
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-3">
          <Text className="text-white text-base font-bold mb-2 tracking-tight">📊 Analytics</Text>
          <Text className="text-stone-400 text-sm leading-relaxed">
            See exactly where your money goes. The category breakdown shows percentage splits across Food, Commute, Shopping, Bills, and more. Check the weekly trend chart to spot your heaviest spending days, and the budget utilization bar to stay on track.
          </Text>
        </View>

        <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5">
          <Text className="text-white text-base font-bold mb-2 tracking-tight">💡 Pro Tips</Text>
          <Text className="text-stone-400 text-sm leading-relaxed">
            • Use Quick Log buttons for one-tap daily logging{'\n'}
            • Edit the amount on any quick button before tapping Log{'\n'}
            • Use the date pill in "Add Expense" to backfill forgotten entries{'\n'}
            • Check your "Daily Burn" to know how much you can spend today{'\n'}
            • Long-press entries in History to remove mistakes
          </Text>
        </View>

        <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
      </ScrollView>
    </SafeAreaView>
  );
}
