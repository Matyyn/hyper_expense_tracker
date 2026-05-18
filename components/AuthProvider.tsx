import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';

const LOGIN_TIMESTAMP_KEY = 'auth_login_timestamp';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type AuthContextType = {
  session: Session | null;
  user: User | null;
  isInitialized: boolean;
};

const AuthContext = createContext<AuthContextType>({ session: null, user: null, isInitialized: false });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session) {
          const ts = await SecureStore.getItemAsync(LOGIN_TIMESTAMP_KEY);
          if (ts && Date.now() - parseInt(ts, 10) > SESSION_MAX_AGE_MS) {
            supabase.auth.signOut(); // SIGNED_OUT fires next and sets isInitialized
            return;
          }
        }
        setSession(session);
        setIsInitialized(true);
        return;
      }

      // Update session immediately for all other events
      setSession(session);

      if (event === 'SIGNED_IN') {
        SecureStore.setItemAsync(LOGIN_TIMESTAMP_KEY, String(Date.now())).catch(() => {});
      } else if (event === 'SIGNED_OUT') {
        SecureStore.deleteItemAsync(LOGIN_TIMESTAMP_KEY).catch(() => {});
        setIsInitialized(true); // covers case where signOut was triggered during INITIAL_SESSION
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user || null, isInitialized }}>
      {children}
    </AuthContext.Provider>
  );
};
