import React, { useEffect } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs } from 'expo-router';
import { Pressable, View, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, interpolate } from 'react-native-reanimated';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';

function AnimatedTabIcon({ name, color, focused }: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
  focused: boolean;
}) {
  const scale = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    scale.value = withSpring(focused ? 1 : 0, { damping: 12, stiffness: 180 });
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(scale.value, [0, 1], [1, 1.25]) },
      { translateY: interpolate(scale.value, [0, 1], [0, -3]) },
    ],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0, { duration: 200 }),
    transform: [{ scale: withSpring(focused ? 1 : 0, { damping: 15 }) }],
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={animatedStyle}>
        <FontAwesome size={22} name={name} color={color} />
      </Animated.View>
      <Animated.View style={[{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#34d399', marginTop: 4 }, dotStyle]} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      sceneContainerStyle={{ backgroundColor: '#000' }}
      screenOptions={{
        tabBarActiveTintColor: '#34d399',
        tabBarInactiveTintColor: '#52525b',
        tabBarStyle: {
          backgroundColor: '#0a0a0a',
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
          paddingBottom: 8,
          paddingTop: 8,
          height: 64,
          borderColor: '#1c1917',
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.5,
          marginTop: 2,
        },
        headerStyle: {
          backgroundColor: '#000000',
          shadowOpacity: 0,
          elevation: 0,
          borderBottomWidth: 0,
        },
        headerTintColor: '#fff',
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="google-wallet" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="clock-o" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: 'Savings',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="bank" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="bar-chart" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="cog" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
