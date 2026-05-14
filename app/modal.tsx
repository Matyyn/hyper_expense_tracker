import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, useWindowDimensions, ScrollView } from 'react-native';

export default function ModalScreen() {
  const { height } = useWindowDimensions();

  return (
    <ScrollView className="flex-1 bg-black" contentContainerStyle={{ padding: 24, minHeight: height }}>
      <View className="mb-8 mt-4">
        <Text className="text-4xl font-black text-white tracking-tighter">App Guide</Text>
        <Text className="text-emerald-400 font-bold mt-1 text-xs tracking-widest uppercase">Learn How to Use Hyper Expense</Text>
      </View>

      <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-5 shadow-lg">
        <Text className="text-white text-lg font-black mb-3 tracking-tight">💰 Wallet Dashboard</Text>
        <Text className="text-stone-400 leading-relaxed font-medium">
          Your command center. Tap "Settings" to set your Monthly Budget. Use the quick-log buttons for commute and meals, or add any custom expense with a description, category, and amount. You can also pick a past date to log missed expenses.
        </Text>
      </View>

      <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-5 shadow-lg">
        <Text className="text-white text-lg font-black mb-3 tracking-tight">📜 History</Text>
        <Text className="text-stone-400 leading-relaxed font-medium">
          View all your expenses grouped by date. Use the sort controls (Newest, Oldest, Highest, Lowest) and category filters to find specific entries. Long-press any entry to delete it if it was logged by mistake.
        </Text>
      </View>
      
      <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-5 shadow-lg">
        <Text className="text-white text-lg font-black mb-3 tracking-tight">🏦 Savings Vault</Text>
        <Text className="text-stone-400 leading-relaxed font-medium">
          Track your all-time accumulated savings and set a custom monthly savings goal. The progress bar shows how close you are to hitting your target based on your projected end-of-month savings.
        </Text>
      </View>

      <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-5 shadow-lg">
        <Text className="text-white text-lg font-black mb-3 tracking-tight">📊 Analytics</Text>
        <Text className="text-stone-400 leading-relaxed font-medium">
          See exactly where your money goes. The category breakdown shows percentage splits across Food, Commute, Shopping, Bills, and more. Check the weekly trend chart to spot your heaviest spending days, and the budget utilization bar to stay on track.
        </Text>
      </View>

      <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-8 shadow-lg">
        <Text className="text-white text-lg font-black mb-3 tracking-tight">💡 Pro Tips</Text>
        <Text className="text-stone-400 leading-relaxed font-medium">
          • Use Quick Commute and Food buttons for one-tap daily logging{'\n'}
          • Edit the Rs. amount on any quick button before tapping + LOG{'\n'}
          • Use the date picker in "Add Expense" to backfill forgotten entries{'\n'}
          • Check your "Safe Daily Burn" to know how much you can spend today{'\n'}
          • Long-press entries in History to remove mistakes
        </Text>
      </View>

      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </ScrollView>
  );
}
