import { Stack } from 'expo-router';
import { useTheme } from '@/components/ThemeProvider';

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.app } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
