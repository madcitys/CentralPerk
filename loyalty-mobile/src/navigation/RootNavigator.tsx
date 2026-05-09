/**
 * Root Navigator
 * Switches between AuthNavigator and MainTabNavigator based on auth state
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { AuthNavigator } from './AuthNavigator';

export type RootStackParamList = {
  Auth: undefined;
  Authenticated: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const PlaceholderScreen = () => {
  const { logout, role } = useAuth();
  
  return (
    <View style={styles.placeholderContainer}>
      <Text style={styles.placeholderText}>
        Logged in successfully as: {role === 'program_manager' ? 'Admin' : 'Customer'}
      </Text>
      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutBtnText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

export const RootNavigator = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e94560" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : (
          <Stack.Screen name="Authenticated" component={PlaceholderScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f3460',
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  placeholderText: {
    fontSize: 18,
    color: '#333333',
    marginBottom: 20,
    fontWeight: 'bold',
  },
  logoutBtn: {
    backgroundColor: '#e94560',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  logoutBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
