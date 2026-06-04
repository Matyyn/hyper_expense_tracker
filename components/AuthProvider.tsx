import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { asyncPersister } from '../lib/persist';

const LOGIN_TIMESTAMP_KEY = 'auth_login_timestamp';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Mirror the auth user_metadata into a react-query cache key so settings/budget
// writes can go through the same offline machinery as table writes. Reads use
// useUserMetadata(); this is the server-truth seed.
function seedMetadata(session: Session | null) {
  const u = session?.user;
  if (u?.id) queryClient.setQueryData(['metadata', u.id], u.user_metadata ?? {});
}

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
        seedMetadata(session);
        setSession(session);
        setIsInitialized(true);
        return;
      }

      // Update session immediately for all other events
      setSession(session);

      if (event === 'SIGNED_IN') {
        seedMetadata(session);
        SecureStore.setItemAsync(LOGIN_TIMESTAMP_KEY, String(Date.now())).catch(() => {});
      } else if (event === 'USER_UPDATED') {
        // Server confirmed a metadata write — reseed so any pending optimistic
        // patch in ['metadata'] is replaced by the authoritative value.
        seedMetadata(session);
      } else if (event === 'SIGNED_OUT') {
        SecureStore.deleteItemAsync(LOGIN_TIMESTAMP_KEY).catch(() => {});
        // Purge the persisted cache so a different account on this device can't
        // read the previous user's offline data.
        Promise.resolve(asyncPersister.removeClient()).catch(() => {});
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
