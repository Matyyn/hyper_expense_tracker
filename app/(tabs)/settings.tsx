import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Link } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../components/AuthProvider';
import { useNotification } from '../../components/NotificationProvider';
import { supabase } from '../../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

export default function SettingsScreen() {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const queryClient = useQueryClient();

  const [password, setPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  const handleUpdatePassword = async () => {
    if (password.length < 6) {
      showNotification('Password must be at least 6 characters', 'error');
      return;
    }

    setIsUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showNotification('Password updated successfully', 'success');
      setPassword('');
    } catch (e: any) {
      showNotification(e.message, 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const confirmSignOut = () => {
    setShowSignOutModal(true);
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 100}
        style={{ flex: 1 }}
      >
      <ScrollView className="px-6 py-4" contentContainerStyle={{ paddingBottom: 60 }}>
        <View className="mb-8 mt-2">
          <Text className="text-4xl font-black text-white tracking-tighter">Settings</Text>
          <Text className="text-stone-400 font-bold mt-1 text-xs tracking-widest uppercase">Manage Account</Text>
        </View>

        {/* Profile Info */}
        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-6">
          <View className="w-16 h-16 bg-emerald-500/10 rounded-full items-center justify-center mb-4 border border-emerald-500/20">
            <Text className="text-2xl">👤</Text>
          </View>
          <Text className="text-stone-500 text-[10px] font-bold uppercase tracking-widest mb-1">Username</Text>
          <Text className="text-white font-bold text-lg mb-4">{user?.user_metadata?.username || 'User'}</Text>
          
          <Text className="text-stone-500 text-[10px] font-bold uppercase tracking-widest mb-1">Email</Text>
          <Text className="text-white font-bold text-lg">{user?.email}</Text>
        </View>

        {/* Security */}
        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-6">
          <Text className="text-white text-xl font-black mb-4 tracking-tight">Security</Text>
          
          <Text className="text-stone-500 text-[10px] font-bold uppercase tracking-widest mb-2">Change Password</Text>
          <TextInput
            placeholder="New Password"
            placeholderTextColor="#78716c"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            className="bg-black text-white px-5 py-4 rounded-2xl border border-stone-800 font-bold mb-4 focus:border-emerald-500/50"
          />
          <TouchableOpacity 
            onPress={handleUpdatePassword}
            disabled={isUpdating || password.length === 0}
            className={`py-4 rounded-2xl items-center shadow-lg ${isUpdating || password.length === 0 ? 'bg-emerald-900/50 border border-emerald-800/30' : 'bg-emerald-600 shadow-emerald-600/30'}`}
          >
            {isUpdating ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold tracking-wider uppercase text-xs">Update Password</Text>}
          </TouchableOpacity>
        </View>

        {/* Support */}
        <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 mb-6">
          <Text className="text-white text-xl font-black mb-4 tracking-tight">Support</Text>
          <Link href="/modal" asChild>
            <TouchableOpacity className="flex-row items-center bg-black py-4 px-5 rounded-2xl border border-stone-800 active:bg-stone-800/50">
              <FontAwesome name="question-circle" size={20} color="#34d399" />
              <Text className="text-white font-bold ml-4 tracking-wider text-sm flex-1">App User Guide</Text>
              <FontAwesome name="chevron-right" size={14} color="#52525b" />
            </TouchableOpacity>
          </Link>
        </View>

        <TouchableOpacity 
          onPress={confirmSignOut}
          className="mt-4 py-5 rounded-[24px] bg-rose-500/10 border border-rose-500/20 items-center active:bg-rose-500/20"
        >
          <Text className="text-rose-500 font-black tracking-widest uppercase text-sm">Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>
      </KeyboardAvoidingView>

      {/* Sign Out Modal */}
      <Modal visible={showSignOutModal} animationType="fade" transparent={true} onRequestClose={() => setShowSignOutModal(false)}>
        <View className="flex-1 bg-black/90 justify-center px-6">
          <View className="bg-stone-900 border border-stone-800 rounded-[32px] p-6 shadow-2xl">
            <View className="w-16 h-16 bg-rose-500/10 rounded-full items-center justify-center mb-6 self-center border border-rose-500/20">
              <Text className="text-2xl">🚪</Text>
            </View>
            <Text className="text-white text-2xl font-black text-center mb-2 tracking-tighter">Sign Out?</Text>
            <Text className="text-stone-400 text-center font-bold mb-8">Are you sure you want to log out of your account?</Text>
            
            <View className="flex-row gap-4">
              <TouchableOpacity onPress={() => setShowSignOutModal(false)} className="flex-1 py-4 rounded-[24px] bg-stone-800 items-center">
                <Text className="text-white font-bold tracking-wider uppercase text-xs">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                setShowSignOutModal(false);
                supabase.auth.signOut();
              }} className="flex-1 py-4 rounded-[24px] bg-rose-600 items-center shadow-lg shadow-rose-600/30">
                <Text className="text-white font-black tracking-wider uppercase text-xs">Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
