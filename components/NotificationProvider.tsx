import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

type NotificationType = 'success' | 'error' | 'info';

interface NotificationContextProps {
  showNotification: (message: string, type?: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within a NotificationProvider');
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notification, setNotification] = useState<{ message: string; type: NotificationType; id: number } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showNotification = useCallback((message: string, type: NotificationType = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    
    setNotification({ message, type, id: Date.now() });
    
    timerRef.current = setTimeout(() => {
      setNotification(null);
    }, 3000);
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      {notification && (
        <Animated.View 
          key={notification.id}
          entering={FadeInUp.duration(300).springify()} 
          exiting={FadeOutUp.duration(300)}
          className={`absolute top-16 left-6 right-6 p-4 rounded-2xl flex-row items-center justify-center shadow-xl z-50 ${
            notification.type === 'success' ? 'bg-emerald-600' :
            notification.type === 'error' ? 'bg-rose-600' : 'bg-indigo-600'
          }`}
        >
          <Text className="text-white font-black text-sm tracking-wider uppercase text-center">
            {notification.message}
          </Text>
        </Animated.View>
      )}
    </NotificationContext.Provider>
  );
};
