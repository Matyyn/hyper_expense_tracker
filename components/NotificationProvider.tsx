import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Text } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

type NotificationType = 'success' | 'error' | 'info';

export interface NotificationHistoryItem {
  id: number;
  message: string;
  type: NotificationType;
  at: number;
}

interface NotificationContextProps {
  showNotification: (message: string, type?: NotificationType) => void;
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

const MAX_HISTORY = 30;

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [active, setActive] = useState<{ message: string; type: NotificationType; id: number } | null>(null);
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotification = useCallback((message: string, type: NotificationType = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const id = Date.now();
    setActive({ message, type, id });
    setHistory(prev => [{ id, message, type, at: id }, ...prev].slice(0, MAX_HISTORY));
    setUnreadCount(c => c + 1);

    timerRef.current = setTimeout(() => {
      setActive(null);
    }, 3000);
  }, []);

  const markAllRead = useCallback(() => setUnreadCount(0), []);
  const clearHistory = useCallback(() => {
    setHistory([]);
    setUnreadCount(0);
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification, history, unreadCount, markAllRead, clearHistory }}>
      {children}
      {active && (
        <Animated.View
          key={active.id}
          entering={FadeInUp.duration(300).springify()}
          exiting={FadeOutUp.duration(300)}
          className={`absolute top-16 left-6 right-6 px-4 py-3.5 rounded-2xl flex-row items-center justify-center shadow-xl z-50 border ${
            active.type === 'success' ? 'bg-emerald-600 border-emerald-500' :
            active.type === 'error' ? 'bg-rose-600 border-rose-500' : 'bg-stone-800 border-stone-700'
          }`}
        >
          <Text className="text-white text-sm font-bold tracking-wider uppercase text-center">
            {active.message}
          </Text>
        </Animated.View>
      )}
    </NotificationContext.Provider>
  );
};
