import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, useWindowDimensions, ScrollView } from 'react-native';

export default function ModalScreen() {
  const { height } = useWindowDimensions();

  return (
    <ScrollView className="flex-1 bg-black" contentContainerStyle={{ padding: 24, minHeight: height }}>
      <View className="mb-8 mt-4">
        <Text className="text-4xl font-black text-white tracking-tighter">About</Text>
        <Text className="text-indigo-400 font-bold mt-1 text-xs tracking-widest uppercase">Hyper Expense App</Text>
      </View>

      <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-8 shadow-lg">
        <Text className="text-white text-lg font-black mb-4 tracking-tight">App Info</Text>
        <Text className="text-stone-400 leading-relaxed font-medium mb-4">
          Hyper Expense is a premium tracker built for high-speed logging and analytical insights.
          Powered by React Native, Expo, and Supabase for real-time synchronization.
        </Text>

        <View className="bg-black/50 rounded-2xl p-4 border border-stone-800">
           <Text className="text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-1">Version</Text>
           <Text className="text-white font-bold">1.0.0 (Premium Build)</Text>
        </View>
      </View>

      <View className="bg-indigo-950/30 border border-indigo-500/20 rounded-[32px] p-6 items-center">
         <Text className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-2">Developed By</Text>
         <Text className="text-2xl font-black text-white tracking-tighter">Matyyn</Text>
      </View>

      {/* Use a light status bar on iOS to account for the black space above the modal */}
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </ScrollView>
  );
}
