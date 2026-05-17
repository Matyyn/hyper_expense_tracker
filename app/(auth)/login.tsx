import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, Keyboard, Modal } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useNotification } from '../../components/NotificationProvider';
import { supabase } from '../../lib/supabase';

type ForgotStep = 'email' | 'otp';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [passwordHidden, setPasswordHidden] = useState(true);
  const { showNotification } = useNotification();

  // Forgot password flow
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotStep>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const otpInputRef = useRef<TextInput>(null);

  const resetForgotModal = () => {
    setForgotStep('email');
    setForgotEmail('');
    setForgotOtp('');
    setForgotBusy(false);
  };

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

  const handleSendOtp = async () => {
    const target = forgotEmail.trim();
    if (!target) {
      showNotification('Enter your email', 'error');
      return;
    }
    setForgotBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { email: target },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setForgotStep('otp');
      showNotification('Code sent — check your email', 'success');
    } catch (e: any) {
      showNotification(e.message || 'Could not send code', 'error');
    } finally {
      setForgotBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (forgotOtp.length !== 6) {
      showNotification('Enter the 6-digit code', 'error');
      return;
    }
    setForgotBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { email: forgotEmail.trim(), otp: forgotOtp },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Navigate before verifyOtp so session fires while already on reset-password,
      // preventing AuthHandler from redirecting to tabs
      setShowForgotModal(false);
      resetForgotModal();
      router.push({ pathname: '/(auth)/reset-password', params: { token: data.hashed_token } });
    } catch (e: any) {
      showNotification(e.message || 'Invalid code', 'error');
      setForgotBusy(false);
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
              <Image source={require('../../assets/images/icon.png')} style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 24 }} />
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
      <Modal
        visible={showForgotModal}
        animationType="slide"
        transparent
        onRequestClose={() => { setShowForgotModal(false); resetForgotModal(); }}
      >
        <Pressable onPress={() => { setShowForgotModal(false); resetForgotModal(); }} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.85)' }}>
          <Pressable onPress={() => {}} className="bg-stone-900 rounded-t-3xl border-t border-stone-800" style={{ maxHeight: '75%' }}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
              >
            {/* Drag handle */}
            <TouchableOpacity onPress={() => { setShowForgotModal(false); resetForgotModal(); }} activeOpacity={0.6} className="self-center mb-6 py-2 px-8">
              <View className="w-12 h-1.5 bg-stone-700 rounded-full" />
            </TouchableOpacity>

            {/* Header */}
            <View className="items-center mb-6">
              <View className="w-14 h-14 bg-emerald-500/10 rounded-2xl items-center justify-center mb-4 border border-emerald-500/20">
                <FontAwesome name={forgotStep === 'otp' ? 'envelope-o' : 'lock'} size={20} color="#34d399" />
              </View>
              <Text className="text-xl font-bold text-white tracking-tight text-center">
                {forgotStep === 'email' ? 'Forgot Password' : 'Enter Code'}
              </Text>
              <Text className="text-stone-400 text-sm text-center mt-1.5">
                {forgotStep === 'email'
                  ? "Enter your email — we'll send a one-time code."
                  : `6-digit code sent to ${forgotEmail}`}
              </Text>
            </View>

            {/* Step: Email */}
            {forgotStep === 'email' && (
              <>
                <TextInput
                  placeholder="you@example.com"
                  placeholderTextColor="#78716c"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus
                  onSubmitEditing={handleSendOtp}
                  returnKeyType="send"
                  className="bg-black text-white text-sm px-4 py-3.5 rounded-2xl border border-stone-800 mb-5"
                />
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => { setShowForgotModal(false); resetForgotModal(); }}
                    className="flex-1 py-4 rounded-2xl bg-stone-800 items-center active:opacity-70"
                  >
                    <Text className="text-white text-sm font-semibold uppercase tracking-wider">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSendOtp}
                    disabled={forgotBusy}
                    className={`flex-1 py-4 rounded-2xl items-center ${forgotBusy ? 'bg-emerald-800' : 'bg-emerald-600 active:bg-emerald-500'}`}
                  >
                    {forgotBusy
                      ? <ActivityIndicator color="white" />
                      : <Text className="text-white text-sm font-bold uppercase tracking-wider">Send Code</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Step: OTP */}
            {forgotStep === 'otp' && (
              <>
                {/* 6-box OTP display with hidden input */}
                <Pressable onPress={() => otpInputRef.current?.focus()} className="mb-2">
                  <View className="flex-row justify-center gap-2.5">
                    {[0, 1, 2, 3, 4, 5].map(i => (
                      <View
                        key={i}
                        className={`w-11 h-14 rounded-xl items-center justify-center border ${
                          forgotOtp[i]
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : i === forgotOtp.length
                            ? 'border-emerald-500/60 bg-stone-800'
                            : 'border-stone-700 bg-black'
                        }`}
                      >
                        <Text className="text-white text-xl font-bold">{forgotOtp[i] || ''}</Text>
                      </View>
                    ))}
                  </View>
                  <TextInput
                    ref={otpInputRef}
                    value={forgotOtp}
                    onChangeText={v => setForgotOtp(v.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                    style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
                  />
                </Pressable>

                <TouchableOpacity
                  onPress={() => { setForgotOtp(''); handleSendOtp(); }}
                  className="items-center mb-5 py-2 active:opacity-70"
                >
                  <Text className="text-stone-500 text-xs">
                    Didn't receive it?{' '}
                    <Text className="text-emerald-400 font-semibold">Resend</Text>
                  </Text>
                </TouchableOpacity>

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => { setForgotStep('email'); setForgotOtp(''); }}
                    className="flex-1 py-4 rounded-2xl bg-stone-800 items-center active:opacity-70"
                  >
                    <Text className="text-white text-sm font-semibold uppercase tracking-wider">Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleVerifyOtp}
                    disabled={forgotBusy || forgotOtp.length !== 6}
                    className={`flex-1 py-4 rounded-2xl items-center ${
                      forgotBusy || forgotOtp.length !== 6 ? 'bg-emerald-900/70' : 'bg-emerald-600 active:bg-emerald-500'
                    }`}
                  >
                    {forgotBusy
                      ? <ActivityIndicator color="white" />
                      : <Text className="text-white text-sm font-bold uppercase tracking-wider">Verify</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
              </ScrollView>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
