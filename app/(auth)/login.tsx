import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotification } from '../../components/NotificationProvider';
import { supabase } from '../../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const { showNotification } = useNotification();

  const handleAuth = async () => {
    if (!email || !password || (!isLogin && !username)) {
      showNotification('Please fill in all fields', 'error');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showNotification('Welcome back!', 'success');
      } else {
        const { error, data } = await supabase.auth.signUp({ 
          email, 
          password,
          options: { data: { username } }
        });
        if (error) throw error;
        
        // Setup initial profile and default data
        if (data.user) {
          const userId = data.user.id;
          await supabase.from('profiles').insert([
            { id: userId, monthly_budget: 50000, savings_goal: 10000, total_savings: 0 }
          ]);
          
          await supabase.from('categories').insert([
            { user_id: userId, name: 'Food', icon: '🍽️', color: '#f43f5e', sort_order: 0 },
            { user_id: userId, name: 'Commute', icon: '🚗', color: '#f97316', sort_order: 1 },
            { user_id: userId, name: 'Shopping', icon: '🛍️', color: '#eab308', sort_order: 2 },
            { user_id: userId, name: 'Bills', icon: '📄', color: '#22c55e', sort_order: 3 },
            { user_id: userId, name: 'Health', icon: '💊', color: '#06b6d4', sort_order: 4 },
            { user_id: userId, name: 'Entertainment', icon: '🎬', color: '#8b5cf6', sort_order: 5 },
            { user_id: userId, name: 'Misc', icon: '💸', color: '#64748b', sort_order: 6 }
          ]);

          await supabase.from('quick_templates').insert([
            { user_id: userId, title: 'To Office', amount: 150, category: 'Commute', icon: '🏡', group_name: 'commute', sort_order: 0 },
            { user_id: userId, title: 'To Home', amount: 150, category: 'Commute', icon: '🏢', group_name: 'commute', sort_order: 1 },
            { user_id: userId, title: 'Breakfast', amount: 250, category: 'Food', icon: '🍳', group_name: 'food', sort_order: 0 },
            { user_id: userId, title: 'Lunch', amount: 450, category: 'Food', icon: '🍛', group_name: 'food', sort_order: 1 },
            { user_id: userId, title: 'Dinner', amount: 750, category: 'Food', icon: '🍗', group_name: 'food', sort_order: 2 }
          ]);
        }
        showNotification('Account created successfully!', 'success');
      }
    } catch (error: any) {
      showNotification(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
          <Animated.View entering={FadeInDown.duration(600)} className="mb-14 items-center">
            <View className="w-16 h-16 bg-emerald-500/10 rounded-2xl items-center justify-center mb-6 border border-emerald-500/20">
              <FontAwesome name="google-wallet" size={32} color="#34d399" />
            </View>
            <Text className="text-5xl font-black text-white tracking-tighter leading-tight text-center">
              {isLogin ? 'Welcome\nBack.' : 'Create\nAccount.'}
            </Text>
            <Text className="text-stone-400 font-medium mt-3 text-base text-center">
              {isLogin ? 'Log in to track your expenses' : 'Sign up to start managing wealth'}
            </Text>
          </Animated.View>

          <View className="space-y-4 mb-10">
            {!isLogin && (
              <TextInput
                placeholder="Username"
                placeholderTextColor="#78716c"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                className="bg-stone-900 text-white px-5 py-5 rounded-2xl border border-stone-800 font-bold mb-4 focus:border-emerald-500/50 text-base"
              />
            )}
            <TextInput
              placeholder="Email"
              placeholderTextColor="#78716c"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              className="bg-stone-900 text-white px-5 py-5 rounded-2xl border border-stone-800 font-bold mb-4 focus:border-emerald-500/50 text-base"
            />
            <TextInput
              placeholder="Password"
              placeholderTextColor="#78716c"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              className="bg-stone-900 text-white px-5 py-5 rounded-2xl border border-stone-800 font-bold mb-2 focus:border-emerald-500/50 text-base"
            />
          </View>

          <TouchableOpacity 
            onPress={handleAuth} 
            disabled={loading}
            className={`py-5 rounded-2xl items-center shadow-lg mb-8 ${loading ? 'bg-emerald-800' : 'bg-emerald-600 shadow-emerald-600/30 active:bg-emerald-500'}`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-black tracking-widest uppercase text-sm">
                {isLogin ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsLogin(!isLogin)} className="items-center py-2 active:opacity-70 mb-10">
            <Text className="text-stone-400 font-bold text-sm">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <Text className="text-emerald-400">{isLogin ? 'Sign Up' : 'Sign In'}</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
