import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const DAILY_REMINDER_IDENTIFIER = 'hyper-expense-daily-reminder';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  } as any),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Hyper Expense',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: '#34d399',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleDailyReminder(hour = 20, minute = 0): Promise<boolean> {
  const granted = await requestNotificationPermissions();
  if (!granted) return false;

  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_IDENTIFIER);

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_IDENTIFIER,
    content: {
      title: "Don't forget to log today 💰",
      body: 'Track your expenses to stay on budget.',
      sound: true,
      data: { screen: 'index' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });

  return true;
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_IDENTIFIER);
}

export async function sendBudgetAlert(category: string, percent: number): Promise<void> {
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: percent >= 100
        ? `${category} budget exceeded ⚠️`
        : `${category} at ${percent}% 🔔`,
      body: percent >= 100
        ? `You've gone over your ${category} spending limit.`
        : `You're approaching your ${category} budget. Spend carefully.`,
      sound: true,
      data: { screen: 'analytics' },
    },
    trigger: null,
  });
}

export async function sendBudgetExpiryAlert(daysLeft: number, leftover: string): Promise<void> {
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Budget expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} 📅`,
      body: `You have ${leftover} remaining. Transfer leftovers to savings!`,
      sound: true,
      data: { screen: 'index' },
    },
    trigger: null,
  });
}
