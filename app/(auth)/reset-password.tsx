import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useNotification } from '../../components/NotificationProvider';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { showNotification } = useNotification();
  const { token } = useLocalSearchParams<{ token: string }>();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    if (token) {
      supabase.auth.verifyOtp({ token_hash: token, type: 'recovery' }).then(({ error }) => {
        if (!error) setTokenReady(true);
        else setTokenReady(false);
      });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setTokenReady(true);
      });
    }
  }, [token]);

  const handleReset = async () => {
    if (password.length < 6) {
      showNotification('Password must be at least 6 characters', 'error');
      return;
    }
    if (password !== confirm) {
      showNotification('Passwords do not match', 'error');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showNotification('Password updated — sign in with new password', 'success');
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
    } catch (e: any) {
      showNotification(e.message || 'Could not update password', 'error');
    } finally {
      setBusy(false);
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
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-10 items-center">
            <View className="w-16 h-16 bg-emerald-500/10 rounded-2xl items-center justify-center mb-6 border border-emerald-500/20">
              <FontAwesome name="lock" size={28} color="#34d399" />
            </View>
            <Text className="text-3xl font-bold text-white tracking-tight text-center">Set New Password</Text>
            <Text className="text-stone-400 mt-2 text-sm text-center">Pick a strong password — at least 6 characters.</Text>
          </View>

          {!tokenReady ? (
            <View className="items-center mb-6">
              <ActivityIndicator color="#34d399" />
              <Text className="text-stone-500 mt-3 text-xs font-semibold uppercase tracking-widest">Preparing...</Text>
            </View>
          ) : (
            <>
              <View className="mb-3 flex-row items-center bg-stone-900 rounded-2xl border border-stone-800">
                <TextInput
                  placeholder="New password"
                  placeholderTextColor="#78716c"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={hidden}
                  autoFocus
                  className="flex-1 text-white text-sm px-5 py-4"
                />
                <TouchableOpacity onPress={() => setHidden(h => !h)} className="px-4 py-4">
                  <FontAwesome name={hidden ? 'eye' : 'eye-slash'} size={16} color="#78716c" />
                </TouchableOpacity>
              </View>

              <View className="mb-6 flex-row items-center bg-stone-900 rounded-2xl border border-stone-800">
                <TextInput
                  placeholder="Confirm password"
                  placeholderTextColor="#78716c"
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry={hidden}
                  onSubmitEditing={handleReset}
                  returnKeyType="done"
                  className="flex-1 text-white text-sm px-5 py-4"
                />
              </View>

              <TouchableOpacity
                onPress={handleReset}
                disabled={busy}
                className={`py-4 rounded-2xl items-center mb-3 ${busy ? 'bg-emerald-800' : 'bg-emerald-600 active:bg-emerald-500'}`}
              >
                {busy
                  ? <ActivityIndicator color="white" />
                  : <Text className="text-white text-sm font-bold uppercase tracking-wider">Update Password</Text>}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} className="items-center py-2 active:opacity-70">
            <Text className="text-stone-400 text-sm">Back to <Text className="text-emerald-400 font-semibold">Sign In</Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
