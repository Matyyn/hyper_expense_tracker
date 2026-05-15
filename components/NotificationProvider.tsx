import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Text, Pressable } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

type NotificationType = 'success' | 'error' | 'info';

export interface NotificationHistoryItem {
  id: number;
  message: string;
  type: NotificationType;
  at: number;
}

interface NotificationContextProps {
  showNotification: (message: string, type?: NotificationType, addToHistory?: boolean) => void;
  history: NotificationHistoryItem[];
  unreadCount: number;
  markAllRead: () => void;
  clearHistory: () => void;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within a NotificationProvider');
  return context;
};

const MAX_HISTORY = 50;

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [active, setActive] = useState<{ message: string; type: NotificationType; id: number } | null>(null);
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotification = useCallback((
    message: string,
    type: NotificationType = 'info',
    addToHistory = false,
  ) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = Date.now();
    setActive({ message, type, id });

    if (addToHistory) {
      setHistory(prev => [{ id, message, type, at: id }, ...prev].slice(0, MAX_HISTORY));
      setUnreadCount(c => c + 1);
    }

    timerRef.current = setTimeout(() => setActive(null), 2000);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setActive(null);
  }, []);
  const markAllRead = useCallback(() => setUnreadCount(0), []);
  const clearHistory = useCallback(() => {
    setHistory([]);
    setUnreadCount(0);
  }, []);

  const bgClass =
    active?.type === 'success' ? 'bg-emerald-600 border-emerald-500' :
    active?.type === 'error' ? 'bg-rose-600 border-rose-500' :
    'bg-stone-800 border-stone-700';

  return (
    <NotificationContext.Provider value={{ showNotification, history, unreadCount, markAllRead, clearHistory }}>
      {children}
      {active && (
        <Animated.View
          key={active.id}
          entering={FadeInUp.duration(300).springify()}
          exiting={FadeOutUp.duration(300)}
          className={`absolute top-16 left-6 right-6 px-4 py-3.5 rounded-2xl flex-row items-center shadow-xl z-50 border ${bgClass}`}
        >
          <Pressable onPress={dismiss} className="flex-row items-center flex-1">
            <Text className="text-white text-sm font-bold tracking-wider uppercase flex-1">
              {active.message}
            </Text>
            <FontAwesome name="times" size={13} color="rgba(255,255,255,0.7)" style={{ marginLeft: 10 }} />
          </Pressable>
        </Animated.View>
      )}
    </NotificationContext.Provider>
  );
};
