import React, { useEffect } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

function AnimatedTabIcon({ name, color, focused }: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
  focused: boolean;
}) {
  const opacity = useSharedValue(focused ? 1 : 0.45);

  useEffect(() => {
    opacity.value = withTiming(focused ? 1 : 0.45, { duration: 180 });
  }, [focused]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0, { duration: 180 }),
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 36 }}>
      <Animated.View style={animStyle}>
        <FontAwesome size={20} name={name} color={color} />
      </Animated.View>
      <Animated.View style={[dotStyle, { width: 4, height: 4, borderRadius: 2, backgroundColor: '#34d399', marginTop: 3 }]} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#34d399',
        tabBarInactiveTintColor: '#52525b',
        tabBarStyle: {
          backgroundColor: '#000',
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.5,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Wallet', tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="google-wallet" color={color} focused={focused} /> }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="clock-o" color={color} focused={focused} /> }} />
      <Tabs.Screen name="savings" options={{ title: 'Savings', tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="bank" color={color} focused={focused} /> }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics', tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="bar-chart" color={color} focused={focused} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="cog" color={color} focused={focused} /> }} />
    </Tabs>
  );
}
