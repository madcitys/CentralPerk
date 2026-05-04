/**
 * Loyalty Mobile App — Entry Point
 * Wraps the app with AuthProvider and sets up push notifications
 */
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import {
  registerForPushNotificationsAsync,
  setupNotificationListeners,
} from './src/services/NotificationService';

export default function App() {
  useEffect(() => {
    // Register for push notifications on mount
    registerForPushNotificationsAsync();

    // Set up foreground/tap notification listeners
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
