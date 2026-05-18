import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, Image } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import 'react-native-reanimated';

import "../global.css";
import { NotificationProvider } from '@/components/NotificationProvider';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { CurrencyProvider } from '@/components/CurrencyProvider';

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3,
      gcTime: 1000 * 60 * 10,
      retry: 2,
    },
  },
});

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
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CurrencyProvider>
          <NotificationProvider>
            <AuthHandler />
          </NotificationProvider>
        </CurrencyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AuthHandler() {
  const { session, isInitialized } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const notifListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();
  // Tracks last routed session state to prevent duplicate navigations (e.g. React StrictMode)
  const lastRoutedSession = useRef<boolean | null>(null);

  useEffect(() => {
    notifListener.current = Notifications.addNotificationReceivedListener(() => {
      // notification received while app is foregrounded — handled by setNotificationHandler
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      if (screen === 'analytics') router.push('/(tabs)/analytics');
      else router.push('/(tabs)');
    });

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  const inAuthGroup = segments[0] === '(auth)';
  const onResetPassword = segments[1] === 'reset-password';
  // Hide Stack until we're in the correct route group to prevent flash of wrong screen
  const inCorrectRouteGroup = isInitialized && (
    session ? (!inAuthGroup || onResetPassword) : inAuthGroup
  );

  useEffect(() => {
    if (!isInitialized) return;

    const sessionExists = session !== null;
    if (lastRoutedSession.current === sessionExists) return;
    lastRoutedSession.current = sessionExists;

    if (!session && !inAuthGroup) {
      queryClient.clear();
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup && !onResetPassword) {
      router.replace('/(tabs)');
    }
  }, [session, isInitialized]); // segments intentionally excluded — routing reacts to auth state only

  return (
    <>
      <ThemeProvider value={DarkTheme}>
        <Stack screenOptions={{ contentStyle: { backgroundColor: '#000' } }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ title: 'App Guide', headerStyle: { backgroundColor: '#000' }, headerTintColor: '#34d399', headerShadowVisible: false, contentStyle: { backgroundColor: '#000' } }} />
        </Stack>
      </ThemeProvider>
      {!inCorrectRouteGroup && (
        <Animated.View exiting={FadeOut} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} className="bg-black items-center justify-center">
          <Image source={require('../assets/images/icon.png')} style={{ width: 80, height: 80, borderRadius: 20, marginBottom: 32 }} />
          <ActivityIndicator size="large" color="#34d399" />
          <Text className="text-emerald-400 font-bold mt-6 tracking-widest uppercase text-xs">Loading Hyper Expense</Text>
        </Animated.View>
      )}
    </>
  );
}
