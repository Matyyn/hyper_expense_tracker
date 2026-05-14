import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import 'react-native-reanimated';

import "../global.css";
import { NotificationProvider } from '@/components/NotificationProvider';
import { AuthProvider, useAuth } from '@/components/AuthProvider';

import { useColorScheme } from '@/components/useColorScheme';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    // Show splash screen for at least 2 seconds for a premium feel
    const prepare = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 2500));
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
        await SplashScreen.hideAsync();
      }
    };

    prepare();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationProvider>
          <AuthHandler />
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AuthHandler() {
  const { session, isInitialized } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    
    if (!session && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Redirect to app if authenticated
      router.replace('/(tabs)');
    }
  }, [session, isInitialized, segments]);

  if (!isInitialized) {
    return (
      <Animated.View exiting={FadeOut} className="flex-1 bg-black items-center justify-center">
        <View className="w-20 h-20 bg-emerald-500/10 rounded-[28px] items-center justify-center mb-8 border border-emerald-500/20 shadow-2xl shadow-emerald-500/20">
          <FontAwesome name="google-wallet" size={40} color="#34d399" />
        </View>
        <ActivityIndicator size="large" color="#34d399" />
        <Text className="text-emerald-400 font-bold mt-6 tracking-widest uppercase text-xs">Loading Hyper Expense</Text>
      </Animated.View>
    );
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: '#000' } }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'App Guide', headerStyle: { backgroundColor: '#000' }, headerTintColor: '#34d399' }} />
      </Stack>
    </ThemeProvider>
  );
}
