import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, Keyboard, Pressable, Modal } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Linking from 'expo-linking';
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
  const [passwordHidden, setPasswordHidden] = useState(true);
  const { showNotification } = useNotification();

  // Forgot password state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);

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
          options: { data: { username } },
        });
        if (error) throw error;

        if (data.user) {
          const userId = data.user.id;
          await supabase.from('profiles').insert([
            { id: userId, monthly_budget: 50000, savings_goal: 10000, total_savings: 0 },
          ]);

          await supabase.from('categories').insert([
            { user_id: userId, name: 'Food', icon: '🍽️', color: '#f43f5e', sort_order: 0 },
            { user_id: userId, name: 'Commute', icon: '🚗', color: '#f97316', sort_order: 1 },
            { user_id: userId, name: 'Shopping', icon: '🛍️', color: '#eab308', sort_order: 2 },
            { user_id: userId, name: 'Bills', icon: '📄', color: '#22c55e', sort_order: 3 },
            { user_id: userId, name: 'Health', icon: '💊', color: '#06b6d4', sort_order: 4 },
            { user_id: userId, name: 'Entertainment', icon: '🎬', color: '#8b5cf6', sort_order: 5 },
            { user_id: userId, name: 'Misc', icon: '💸', color: '#64748b', sort_order: 6 },
            { user_id: userId, name: 'Income', icon: '💰', color: '#10b981', sort_order: 7 },
          ]);

          await supabase.from('quick_templates').insert([
            { user_id: userId, title: 'To Office', amount: 150, category: 'Commute', icon: '🏡', group_name: 'commute', sort_order: 0 },
            { user_id: userId, title: 'To Home', amount: 150, category: 'Commute', icon: '🏢', group_name: 'commute', sort_order: 1 },
            { user_id: userId, title: 'Breakfast', amount: 250, category: 'Food', icon: '🍳', group_name: 'food', sort_order: 0 },
            { user_id: userId, title: 'Lunch', amount: 450, category: 'Food', icon: '🍛', group_name: 'food', sort_order: 1 },
            { user_id: userId, title: 'Dinner', amount: 750, category: 'Food', icon: '🍗', group_name: 'food', sort_order: 2 },
          ]);
        }

        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) throw signInError;
        }

        showNotification('Account created successfully!', 'success');
      }
    } catch (error: any) {
      showNotification(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendReset = async () => {
    const target = forgotEmail.trim();
    if (!target) {
      showNotification('Enter your email', 'error');
      return;
    }
    setSendingReset(true);
    try {
      const redirectTo = Linking.createURL('reset-password');
      const { error } = await supabase.auth.resetPasswordForEmail(target, { redirectTo });
      if (error) throw error;
      showNotification('Reset link sent — check your email', 'success');
      setShowForgotModal(false);
      setForgotEmail('');
    } catch (e: any) {
      showNotification(e.message || 'Could not send reset email', 'error');
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 32 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Pressable onPress={Keyboard.dismiss}>
            <Animated.View entering={FadeInDown.duration(500)} className="mb-10 items-center">
              <View className="w-16 h-16 bg-emerald-500/10 rounded-2xl items-center justify-center mb-6 border border-emerald-500/20">
                <FontAwesome name="google-wallet" size={30} color="#34d399" />
              </View>
              <Text className="text-3xl font-bold text-white tracking-tight text-center">
                {isLogin ? 'Welcome Back' : 'Create Account'}
              </Text>
              <Text className="text-stone-400 mt-2 text-sm text-center">
                {isLogin ? 'Log in to track your expenses' : 'Sign up to start managing wealth'}
              </Text>
            </Animated.View>
          </Pressable>

          <View className="mb-3">
            {!isLogin && (
              <TextInput
                placeholder="Username"
                placeholderTextColor="#78716c"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                returnKeyType="next"
                className="bg-stone-900 text-white text-sm px-5 py-4 rounded-2xl border border-stone-800 mb-3"
              />
            )}
            <TextInput
              placeholder="Email"
              placeholderTextColor="#78716c"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
              className="bg-stone-900 text-white text-sm px-5 py-4 rounded-2xl border border-stone-800 mb-3"
            />
            <View className="flex-row items-center bg-stone-900 rounded-2xl border border-stone-800">
              <TextInput
                placeholder="Password"
                placeholderTextColor="#78716c"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={passwordHidden}
                returnKeyType="done"
                onSubmitEditing={handleAuth}
                className="flex-1 text-white text-sm px-5 py-4"
              />
              <TouchableOpacity onPress={() => setPasswordHidden(h => !h)} className="px-4 py-4">
                <FontAwesome name={passwordHidden ? 'eye' : 'eye-slash'} size={16} color="#78716c" />
              </TouchableOpacity>
            </View>
          </View>

          {isLogin && (
            <TouchableOpacity
              onPress={() => { setForgotEmail(email); setShowForgotModal(true); }}
              className="self-end mb-4 active:opacity-70"
            >
              <Text className="text-stone-400 text-xs font-semibold">Forgot password?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleAuth}
            disabled={loading}
            className={`py-4 rounded-2xl items-center mb-6 ${loading ? 'bg-emerald-800' : 'bg-emerald-600 active:bg-emerald-500'}`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-sm font-bold uppercase tracking-wider">
                {isLogin ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsLogin(!isLogin)} className="items-center py-2 active:opacity-70">
            <Text className="text-stone-400 text-sm">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <Text className="text-emerald-400 font-semibold">{isLogin ? 'Sign Up' : 'Sign In'}</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
      <Modal visible={showForgotModal} animationType="slide" transparent={true} onRequestClose={() => setShowForgotModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' }}
        >
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" className="bg-stone-900 rounded-t-3xl border-t border-stone-800" contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            <View className="w-12 h-1.5 bg-stone-700 self-center rounded-full mb-6" />
            <View className="w-14 h-14 bg-emerald-500/10 rounded-2xl items-center justify-center mb-4 self-center border border-emerald-500/20">
              <FontAwesome name="lock" size={20} color="#34d399" />
            </View>
            <Text className="text-xl font-bold text-white tracking-tight text-center mb-2">Reset Password</Text>
            <Text className="text-stone-400 text-sm text-center mb-5">Enter your email — we'll send a link that opens this app to set a new password.</Text>

            <TextInput
              placeholder="you@example.com"
              placeholderTextColor="#78716c"
              value={forgotEmail}
              onChangeText={setForgotEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoFocus
              className="bg-black text-white text-sm px-4 py-3.5 rounded-2xl border border-stone-800 mb-5"
            />

            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setShowForgotModal(false)} className="flex-1 py-4 rounded-2xl bg-stone-800 items-center">
                <Text className="text-white text-sm font-semibold uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSendReset} disabled={sendingReset} className="flex-1 py-4 rounded-2xl bg-emerald-600 items-center">
                {sendingReset ? <ActivityIndicator color="white" /> : <Text className="text-white text-sm font-bold uppercase tracking-wider">Send Link</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
