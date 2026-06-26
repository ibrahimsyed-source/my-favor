import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, TabParamList } from './types';
import { useStore } from '../store';
import { useTheme } from '../theme';

import * as Onb from '../screens/onboarding';
import * as AuthF from '../screens/authflow';
import * as Dash from '../screens/dashboard';
import * as Req from '../screens/request';
import * as Checkout from '../screens/checkout';
import * as Providers from '../screens/providers';
import * as Track from '../screens/tracking';
import * as Pal from '../screens/pal';
import * as Payouts from '../screens/payouts';
import * as Msg from '../screens/messages';
import * as Prof from '../screens/profile';
import * as Pay from '../screens/payment';
import * as Hist from '../screens/history';
import * as Notif from '../screens/notifications';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICON: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'home',
  Messages: 'chatbubble',
  History: 'time',
  Earnings: 'cash',
  Profile: 'person',
};

function Tabs() {
  const { theme, isDark } = useTheme();
  const { user } = useStore();
  const isPal = user?.role === 'pal';
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarStyle: { backgroundColor: isDark ? theme.surface : '#FFFFFF', borderTopColor: theme.border },
        tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICON[route.name]} color={color} size={size} />,
      })}
    >
      <Tab.Screen name="Home" component={Dash.Home} />
      <Tab.Screen name="Messages" component={Msg.Messages} />
      <Tab.Screen name="History" component={Hist.History} />
      {/* Pals get a dedicated Earnings tab; members don't. */}
      {isPal && <Tab.Screen name="Earnings" component={Payouts.Earnings} />}
      <Tab.Screen name="Profile" component={Prof.Profile} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { isAuthenticated } = useStore();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Group>
          <Stack.Screen name="Launch" component={Onb.Launch} />
          <Stack.Screen name="Welcome" component={Onb.Welcome} />
          <Stack.Screen name="SignupLogin" component={Onb.SignupLogin} />
          <Stack.Screen name="Login" component={AuthF.Login} />
          <Stack.Screen name="Signup" component={AuthF.Signup} />
          <Stack.Screen name="OtpVerify" component={AuthF.OtpVerify} />
          <Stack.Screen name="ForgotPassword" component={AuthF.ForgotPassword} />
          <Stack.Screen name="NewPassword" component={AuthF.NewPassword} />
        </Stack.Group>
      ) : (
        <Stack.Group>
          <Stack.Screen name="Tabs" component={Tabs} />
          {/* Member flow */}
          <Stack.Screen name="SelectFavor" component={Req.SelectFavor} />
          <Stack.Screen name="FavorDescription" component={Req.FavorDescription} />
          <Stack.Screen name="Negotiate" component={Req.Negotiate} />
          <Stack.Screen name="ConfirmAddress" component={Req.ConfirmAddress} />
          <Stack.Screen name="FavorSummary" component={Checkout.FavorSummary} />
          <Stack.Screen name="SelectPayment" component={Checkout.SelectPayment} />
          <Stack.Screen name="Searching" component={Checkout.Searching} />
          <Stack.Screen name="ProviderResults" component={Providers.ProviderResults} />
          <Stack.Screen name="ProviderDetail" component={Providers.ProviderDetail} />
          <Stack.Screen name="FavorTracking" component={Track.FavorTracking} />
          <Stack.Screen name="OrderComplete" component={Track.OrderComplete} />
          {/* Pal flow */}
          <Stack.Screen name="PalFavorDetail" component={Pal.PalFavorDetail} />
          <Stack.Screen name="PalFavorInProgress" component={Pal.PalFavorInProgress} />
          <Stack.Screen name="Navigation" component={Pal.Navigation} />
          <Stack.Screen name="PalFavorComplete" component={Pal.PalFavorComplete} />
          <Stack.Screen name="PalFavorSuccess" component={Pal.PalFavorSuccess} />
          <Stack.Screen name="Earnings" component={Payouts.Earnings} />
          <Stack.Screen name="StripeOnboarding" component={Payouts.StripeOnboarding} />
          <Stack.Screen name="BankInfo" component={Payouts.BankInfo} />
          {/* Shared */}
          <Stack.Screen
            name="SideDrawer"
            component={Prof.SideDrawer}
            options={{ presentation: 'transparentModal', animation: 'slide_from_left' }}
          />
          <Stack.Screen name="MessageThread" component={Msg.MessageThread} />
          <Stack.Screen name="EditProfile" component={Prof.EditProfile} />
          <Stack.Screen name="Settings" component={Prof.Settings} />
          <Stack.Screen
            name="SetStatus"
            component={Prof.SetStatus}
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen name="Help" component={Prof.Help} />
          <Stack.Screen name="Payment" component={Pay.Payment} />
          <Stack.Screen name="AddCard" component={Pay.AddCard} />
          <Stack.Screen name="FavorHistoryDetail" component={Hist.FavorHistoryDetail} />
          <Stack.Screen name="Notifications" component={Notif.Notifications} />
          <Stack.Screen name="Vetting" component={Onb.Vetting} />
        </Stack.Group>
      )}
    </Stack.Navigator>
  );
}
