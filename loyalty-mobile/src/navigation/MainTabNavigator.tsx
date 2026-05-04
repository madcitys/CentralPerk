/**
 * Main Bottom Tab Navigator
 * Tabs: Home (member portal), Campaigns, Rewards, Notifications, Profile
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/main/HomeScreen';
import { CampaignsScreen } from '../screens/main/CampaignsScreen';
import { RewardsScreen } from '../screens/main/RewardsScreen';
import { NotificationsScreen } from '../screens/main/NotificationsScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { AdminNavigator } from './AdminNavigator';

// Profile tab has its own stack to allow navigating to Admin panel
export type ProfileStackParamList = {
  ProfileMain: undefined;
  Admin: undefined;
};

const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

const ProfileStackNavigator = () => {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="Admin" component={AdminNavigator} />
    </ProfileStack.Navigator>
  );
};

export type MainTabParamList = {
  Home: undefined;
  Campaigns: undefined;
  Rewards: undefined;
  Notifications: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          switch (route.name) {
            case 'Home':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'Campaigns':
              iconName = focused ? 'megaphone' : 'megaphone-outline';
              break;
            case 'Rewards':
              iconName = focused ? 'gift' : 'gift-outline';
              break;
            case 'Notifications':
              iconName = focused ? 'notifications' : 'notifications-outline';
              break;
            case 'Profile':
              iconName = focused ? 'person' : 'person-outline';
              break;
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#e94560',
        tabBarInactiveTintColor: '#8892b0',
        tabBarStyle: {
          backgroundColor: '#1a1a2e',
          borderTopColor: '#2a2a4a',
          borderTopWidth: 1,
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#e94560',
        headerTitleStyle: { fontWeight: '700' },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="Campaigns"
        component={CampaignsScreen}
        options={{ title: 'Campaigns' }}
      />
      <Tab.Screen
        name="Rewards"
        component={RewardsScreen}
        options={{ title: 'Rewards' }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: 'Notifications' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackNavigator}
        options={{ headerShown: false, title: 'Profile' }}
      />
    </Tab.Navigator>
  );
};
