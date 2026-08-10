import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useColorScheme as useNativewindColorScheme, vars } from 'nativewind';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';
import {
  CSS_VARS,
  getPalette,
  ResolvedScheme,
  ThemeMode,
  ThemePalette,
} from '../lib/theme';

const THEME_KEY = 'theme_mode';

interface ThemeContextValue {
  mode: ThemeMode;            // user's choice: light | dark | system
  scheme: ResolvedScheme;     // resolved (system → actual OS value)
  colors: ThemePalette;       // hex palette for inline styles / icon colors
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  scheme: 'dark',
  colors: getPalette('dark'),
  isDark: true,
  setMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { colorScheme, setColorScheme } = useNativewindColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const loadedRef = useRef(false);

  // Load persisted preference once on startup (SecureStore first, then account metadata).
  useEffect(() => {
    (async () => {
      let stored: ThemeMode | null = null;
      try {
        stored = (await SecureStore.getItemAsync(THEME_KEY)) as ThemeMode | null;
      } catch {}
      const fromMeta = user?.user_metadata?.theme as ThemeMode | undefined;
      const initial: ThemeMode = stored || fromMeta || 'dark';
      loadedRef.current = true;
      setModeState(initial);
      setColorScheme(initial);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once auth metadata arrives, adopt the account's saved theme if the user
  // hasn't explicitly chosen one on this device yet.
  useEffect(() => {
    if (!loadedRef.current) return;
    const fromMeta = user?.user_metadata?.theme as ThemeMode | undefined;
    if (!fromMeta) return;
    (async () => {
      let stored: ThemeMode | null = null;
      try {
        stored = (await SecureStore.getItemAsync(THEME_KEY)) as ThemeMode | null;
      } catch {}
      if (!stored && fromMeta !== mode) {
        setModeState(fromMeta);
        setColorScheme(fromMeta);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_metadata?.theme]);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    setColorScheme(next);
    SecureStore.setItemAsync(THEME_KEY, next).catch(() => {});
    // Best-effort sync to the account so the choice follows the user across devices.
    supabase.auth.updateUser({ data: { theme: next } }).catch(() => {});
  };

  const scheme: ResolvedScheme = colorScheme === 'light' ? 'light' : 'dark';
  const colors = getPalette(scheme);

  return (
    <ThemeContext.Provider value={{ mode, scheme, colors, isDark: scheme === 'dark', setMode }}>
      {/* backgroundColor matters: this View is the only thing behind the whole
          navigator. Left transparent it lets the host window (white in Expo Go)
          show through wherever a screen doesn't paint — most visibly the safe
          area strip below the tab bar. */}
      <View style={[{ flex: 1, backgroundColor: colors.app }, vars(CSS_VARS[scheme])]}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
};
