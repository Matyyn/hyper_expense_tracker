import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { Link } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../components/AuthProvider';
import { useNotification } from '../../components/NotificationProvider';
import { useCurrency } from '../../components/CurrencyProvider';
import { supabase } from '../../lib/supabase';
import { CURRENCY_LIST, CurrencyCode } from '../../lib/currency';

function SectionTitle({ icon, label, color = '#34d399' }: { icon: React.ComponentProps<typeof FontAwesome>['name']; label: string; color?: string }) {
  return (
    <View className="flex-row items-center mb-4">
      <View className="w-7 h-7 rounded-lg bg-black border border-stone-800 items-center justify-center mr-3">
        <FontAwesome name={icon} size={12} color={color} />
      </View>
      <Text className="text-white text-base font-bold tracking-tight">{label}</Text>
    </View>
  );
}

function PasswordInput({ value, onChangeText, placeholder }: { value: string; onChangeText: (s: string) => void; placeholder: string }) {
  const [hidden, setHidden] = useState(true);
  return (
    <View className="flex-row items-center bg-black rounded-2xl border border-stone-800 mb-3">
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#78716c"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={hidden}
        autoCapitalize="none"
        className="flex-1 text-white text-sm px-4 py-3.5"
      />
      <TouchableOpacity onPress={() => setHidden(h => !h)} className="px-4 py-3.5">
        <FontAwesome name={hidden ? 'eye' : 'eye-slash'} size={16} color="#78716c" />
      </TouchableOpacity>
    </View>
  );
}

export default function SettingsScreen() {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const { code: currencyCode } = useCurrency();

  const [password, setPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Name editing
  const initialName = user?.user_metadata?.username || '';
  const [nameInput, setNameInput] = useState(initialName);
  const [isSavingName, setIsSavingName] = useState(false);

  // Currency
  const [currencyBusy, setCurrencyBusy] = useState(false);

  useEffect(() => { setNameInput(initialName); }, [initialName]);

  const handlePickCurrency = async (code: CurrencyCode) => {
    setCurrencyBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { currency: code } });
      if (error) throw error;
      showNotification(`Currency set to ${code}`, 'success');
      setShowCurrencyModal(false);
    } catch (e: any) {
      showNotification(e.message || 'Could not change currency', 'error');
    } finally {
      setCurrencyBusy(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      showNotification('Name cannot be empty', 'error');
      return;
    }
    if (trimmed === initialName) return;

    setIsSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { username: trimmed } });
      if (error) throw error;
      showNotification('Name updated', 'success');
    } catch (e: any) {
      showNotification(e.message, 'error');
      setNameInput(initialName);
    } finally {
      setIsSavingName(false);
    }
  };

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

  const handleDeleteAccount = async () => {
    if (!user?.id) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_user');
      if (error) throw error;
      setShowDeleteModal(false);
      await supabase.auth.signOut();
    } catch (e: any) {
      showNotification(e.message || 'Could not delete account', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const username = user?.user_metadata?.username || 'User';
  const initial = (username[0] || 'U').toUpperCase();
  const nameDirty = nameInput.trim() !== initialName && nameInput.trim().length > 0;

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        style={{ flex: 1 }}
      >
        <ScrollView
          className="px-6"
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-6 mt-1">
            <Text className="text-3xl font-bold text-white tracking-tight">Settings</Text>
            <Text className="text-stone-400 mt-1 text-[11px] font-semibold tracking-widest uppercase">Manage Account</Text>
          </View>

          {/* Profile Card */}
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-4">
            <View className="flex-row items-center">
              <View className="w-14 h-14 bg-emerald-500/10 rounded-2xl items-center justify-center border border-emerald-500/20">
                <Text className="text-emerald-400 text-xl font-bold">{initial}</Text>
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-white text-base font-bold">{username}</Text>
                <Text className="text-stone-500 text-xs mt-0.5" numberOfLines={1}>{user?.email}</Text>
              </View>
            </View>
          </View>

          {/* Profile Editing */}
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-4">
            <SectionTitle icon="user" label="Profile" />
            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Display Name</Text>
            <TextInput
              placeholder="Your name"
              placeholderTextColor="#78716c"
              value={nameInput}
              onChangeText={setNameInput}
              autoCapitalize="words"
              className="bg-black text-white text-sm px-4 py-3.5 rounded-2xl border border-stone-800 mb-3"
            />
            <TouchableOpacity
              onPress={handleSaveName}
              disabled={!nameDirty || isSavingName}
              className={`py-3.5 rounded-2xl items-center ${!nameDirty || isSavingName ? 'bg-emerald-900/40 border border-emerald-800/30' : 'bg-emerald-600 active:bg-emerald-500'}`}
            >
              {isSavingName ? <ActivityIndicator color="white" /> : <Text className="text-white text-sm font-bold uppercase tracking-wider">Save Name</Text>}
            </TouchableOpacity>
          </View>

          {/* Currency */}
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-4">
            <SectionTitle icon="globe" label="Currency" />
            <TouchableOpacity
              onPress={() => setShowCurrencyModal(true)}
              className="flex-row items-center bg-black py-3.5 px-4 rounded-2xl border border-stone-800 active:bg-stone-800/50"
            >
              <View className="w-9 h-9 rounded-xl bg-emerald-500/10 items-center justify-center mr-3">
                <Text className="text-emerald-400 text-base font-bold">{CURRENCY_LIST.find(c => c.code === currencyCode)?.symbol || 'Rs.'}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-white text-sm font-semibold">{currencyCode}</Text>
                <Text className="text-stone-500 text-xs mt-0.5">{CURRENCY_LIST.find(c => c.code === currencyCode)?.name}</Text>
              </View>
              <FontAwesome name="chevron-right" size={12} color="#52525b" />
            </TouchableOpacity>
          </View>

          {/* Security */}
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-4">
            <SectionTitle icon="lock" label="Security" />

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">New Password</Text>
            <PasswordInput value={password} onChangeText={setPassword} placeholder="Enter new password" />
            <TouchableOpacity
              onPress={handleUpdatePassword}
              disabled={isUpdating || password.length === 0}
              className={`py-3.5 rounded-2xl items-center ${isUpdating || password.length === 0 ? 'bg-emerald-900/40 border border-emerald-800/30' : 'bg-emerald-600 active:bg-emerald-500'}`}
            >
              {isUpdating ? <ActivityIndicator color="white" /> : <Text className="text-white text-sm font-bold uppercase tracking-wider">Update Password</Text>}
            </TouchableOpacity>
          </View>

          {/* Support */}
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-5 mb-4">
            <SectionTitle icon="life-ring" label="Support" />
            <Link href="/modal" asChild>
              <TouchableOpacity className="flex-row items-center bg-black py-3.5 px-4 rounded-2xl border border-stone-800 active:bg-stone-800/50">
                <View className="w-9 h-9 rounded-xl bg-emerald-500/10 items-center justify-center mr-3">
                  <FontAwesome name="question-circle" size={14} color="#34d399" />
                </View>
                <Text className="text-white text-sm font-semibold flex-1">App User Guide</Text>
                <FontAwesome name="chevron-right" size={12} color="#52525b" />
              </TouchableOpacity>
            </Link>
          </View>

          {/* Danger Zone */}
          <View className="bg-rose-950/30 border border-rose-500/20 rounded-3xl p-5 mb-4">
            <View className="flex-row items-center mb-4">
              <View className="w-7 h-7 rounded-lg bg-black border border-rose-500/30 items-center justify-center mr-3">
                <FontAwesome name="exclamation-triangle" size={11} color="#f43f5e" />
              </View>
              <Text className="text-rose-400 text-base font-bold tracking-tight">Danger Zone</Text>
            </View>
            <TouchableOpacity
              onPress={() => { setDeleteConfirm(''); setShowDeleteModal(true); }}
              className="flex-row items-center bg-black py-3.5 px-4 rounded-2xl border border-rose-500/30 active:bg-rose-500/10"
            >
              <View className="w-9 h-9 rounded-xl bg-rose-500/10 items-center justify-center mr-3">
                <FontAwesome name="trash" size={14} color="#f43f5e" />
              </View>
              <View className="flex-1">
                <Text className="text-white text-sm font-semibold">Delete Account</Text>
                <Text className="text-stone-500 text-xs mt-0.5">Permanently remove all your data</Text>
              </View>
              <FontAwesome name="chevron-right" size={12} color="#52525b" />
            </TouchableOpacity>
          </View>

          {/* Sign Out */}
          <TouchableOpacity
            onPress={() => setShowSignOutModal(true)}
            className="mt-2 py-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 items-center active:bg-rose-500/20 flex-row justify-center"
          >
            <FontAwesome name="sign-out" size={14} color="#f43f5e" />
            <Text className="text-rose-500 text-sm font-bold uppercase tracking-wider ml-2">Sign Out</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Currency Modal */}
      <Modal visible={showCurrencyModal} animationType="slide" transparent={true} onRequestClose={() => setShowCurrencyModal(false)}>
        <Pressable onPress={() => setShowCurrencyModal(false)} className="flex-1 justify-end bg-black/80">
          <Pressable onPress={() => {}} className="bg-stone-900 rounded-t-3xl border-t border-stone-800" style={{ maxHeight: '75%' }}>
            <View className="p-6 pb-3">
              <TouchableOpacity onPress={() => setShowCurrencyModal(false)} activeOpacity={0.6} className="self-center mb-5 py-2 px-8">
                <View className="w-12 h-1.5 bg-stone-700 rounded-full" />
              </TouchableOpacity>
              <Text className="text-xl font-bold text-white tracking-tight mb-1">Choose Currency</Text>
              <Text className="text-stone-400 text-sm">All amounts will display in this currency</Text>
            </View>
            <ScrollView className="px-6" contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
              {CURRENCY_LIST.map(c => {
                const selected = c.code === currencyCode;
                return (
                  <TouchableOpacity
                    key={c.code}
                    onPress={() => handlePickCurrency(c.code)}
                    disabled={currencyBusy}
                    className={`flex-row items-center px-4 py-3.5 rounded-2xl mb-2 border ${selected ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-black border-stone-800'}`}
                  >
                    <View className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${selected ? 'bg-emerald-500/20' : 'bg-stone-800'}`}>
                      <Text className={`text-base font-bold ${selected ? 'text-emerald-400' : 'text-stone-300'}`}>{c.symbol}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className={`text-sm font-semibold ${selected ? 'text-emerald-400' : 'text-white'}`}>{c.code}</Text>
                      <Text className="text-stone-500 text-xs mt-0.5">{c.name}</Text>
                    </View>
                    {selected && <FontAwesome name="check" size={14} color="#34d399" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Account Modal */}
      <Modal visible={showDeleteModal} animationType="fade" transparent={true} onRequestClose={() => setShowDeleteModal(false)}>
        <View className="flex-1 bg-black/85 justify-center px-6">
          <View className="bg-stone-900 border border-rose-500/30 rounded-3xl p-6">
            <View className="w-14 h-14 bg-rose-500/10 rounded-2xl items-center justify-center mb-4 self-center border border-rose-500/20">
              <FontAwesome name="exclamation-triangle" size={20} color="#f43f5e" />
            </View>
            <Text className="text-white text-xl font-bold text-center mb-2 tracking-tight">Delete Account?</Text>
            <Text className="text-stone-400 text-sm text-center mb-5">All your expenses, categories, templates, and profile will be permanently removed. This cannot be undone.</Text>

            <Text className="text-stone-500 text-[11px] font-semibold uppercase tracking-widest mb-2 ml-1">Type DELETE to confirm</Text>
            <TextInput
              placeholder="DELETE"
              placeholderTextColor="#78716c"
              value={deleteConfirm}
              onChangeText={setDeleteConfirm}
              autoCapitalize="characters"
              className="bg-black text-white text-sm px-4 py-3.5 rounded-2xl border border-stone-800 mb-5"
            />

            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setShowDeleteModal(false)} className="flex-1 py-4 rounded-2xl bg-stone-800 items-center">
                <Text className="text-white text-sm font-semibold uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteAccount}
                disabled={deleteConfirm !== 'DELETE' || isDeleting}
                className={`flex-1 py-4 rounded-2xl items-center ${deleteConfirm !== 'DELETE' || isDeleting ? 'bg-rose-900/40 border border-rose-800/30' : 'bg-rose-600 active:bg-rose-500'}`}
              >
                {isDeleting ? <ActivityIndicator color="white" /> : <Text className="text-white text-sm font-bold uppercase tracking-wider">Delete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sign Out Modal */}
      <Modal visible={showSignOutModal} animationType="fade" transparent={true} onRequestClose={() => setShowSignOutModal(false)}>
        <View className="flex-1 bg-black/85 justify-center px-6">
          <View className="bg-stone-900 border border-stone-800 rounded-3xl p-6">
            <View className="w-14 h-14 bg-rose-500/10 rounded-2xl items-center justify-center mb-4 self-center border border-rose-500/20">
              <FontAwesome name="sign-out" size={20} color="#f43f5e" />
            </View>
            <Text className="text-white text-xl font-bold text-center mb-2 tracking-tight">Sign Out?</Text>
            <Text className="text-stone-400 text-sm text-center mb-6">Are you sure you want to log out of your account?</Text>

            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setShowSignOutModal(false)} className="flex-1 py-4 rounded-2xl bg-stone-800 items-center">
                <Text className="text-white text-sm font-semibold uppercase tracking-wider">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setShowSignOutModal(false); supabase.auth.signOut(); }}
                className="flex-1 py-4 rounded-2xl bg-rose-600 items-center"
              >
                <Text className="text-white text-sm font-bold uppercase tracking-wider">Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
