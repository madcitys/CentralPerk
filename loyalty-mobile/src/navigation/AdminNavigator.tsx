/**
 * Admin Stack Navigator
 * Accessible only from Profile tab when role is 'program_manager'
 * Screens: Campaigns Admin → Segments → Analytics → Partners
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CampaignsAdminScreen } from '../screens/admin/CampaignsAdminScreen';
import { SegmentsScreen } from '../screens/admin/SegmentsScreen';
import { AnalyticsScreen } from '../screens/admin/AnalyticsScreen';
import { PartnersScreen } from '../screens/admin/PartnersScreen';

export type AdminStackParamList = {
  CampaignsAdmin: undefined;
  Segments: undefined;
  Analytics: undefined;
  Partners: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

export const AdminNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="CampaignsAdmin"
      screenOptions={{
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#e94560',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: '#16213e' },
      }}
    >
      <Stack.Screen
        name="CampaignsAdmin"
        component={CampaignsAdminScreen}
        options={{ title: 'Campaigns Admin' }}
      />
      <Stack.Screen name="Segments" component={SegmentsScreen} />
      <Stack.Screen name="Analytics" component={AnalyticsScreen} />
      <Stack.Screen name="Partners" component={PartnersScreen} />
    </Stack.Navigator>
  );
};
