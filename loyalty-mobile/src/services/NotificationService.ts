/**
 * Push Notification Service
 * Uses expo-notifications (Expo Go compatible)
 * Expo Push Tokens proxy through FCM (Android) and APNs (iOS) automatically
 */
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

let Notifications: any = null;

// Only require and configure expo-notifications if we are NOT running inside Expo Go
if (Constants.appOwnership !== 'expo') {
  try {
    Notifications = require('expo-notifications');
    // Configure how notifications are displayed when app is in foreground
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    console.warn('Could not load expo-notifications', e);
  }
}

/**
 * Register for push notifications and get the Expo push token.
 * This token can be sent to your backend for targeted push delivery.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('⚠️  Push notifications require a physical device');
    return null;
  }

  // Skip in Expo Go to prevent native errors showing as red banners
  if (Constants.appOwnership === 'expo' || !Notifications) {
    console.log('⚠️  Push notifications disabled in Expo Go. Use a dev build instead.');
    return 'mock_expo_push_token_for_development';
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permissions if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('❌ Push notification permission denied');
    return null;
  }

  // Get the Expo push token
  try {
    const pushToken = await Notifications.getExpoPushTokenAsync({
      projectId: 'dummy-project-id', // Mock projectId for Expo Go testing without EAS
    });
    token = pushToken.data;
    console.log('✅ Expo Push Token registered:', token);
  } catch (error) {
    // Expo Go dropped push support in SDK 53, so we mock it for dev
    console.log('⚠️ Using mock push token in Expo Go');
    token = 'mock_expo_push_token_for_development';
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#e94560',
    });
  }

  return token;
}

/**
 * Set up notification listeners for foreground and interaction events
 */
export function setupNotificationListeners() {
  // Skip in Expo Go to prevent native errors showing as red banners
  if (Constants.appOwnership === 'expo' || !Notifications) {
    return () => {};
  }

  // Listener for notifications received while app is in foreground
  const notificationListener = Notifications.addNotificationReceivedListener((notification: any) => {
    console.log('📬 Notification received (foreground):', notification.request.content);
  });

  // Listener for when user taps on a notification
  const responseListener = Notifications.addNotificationResponseReceivedListener((response: any) => {
    console.log('👆 Notification tapped:', response.notification.request.content);
    // Here you can navigate to specific screens based on notification data
  });

  // Return cleanup function
  return () => {
    if (notificationListener) notificationListener.remove();
    if (responseListener) responseListener.remove();
  };
}
