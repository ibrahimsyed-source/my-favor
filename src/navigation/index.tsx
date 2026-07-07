import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
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
import * as LegalScr from '../screens/legal';
import * as Sys from '../screens/system';
import * as Scenario from '../screens/scenarios';
import { OfflineBanner } from '../components/OfflineBanner';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// ---------------------------------------------------------------------------
// v.2 tab bar — Dashboard Main v2 (1660:15783) bottom group: 414x88 black bar,
// HOME in a red rounded square with a red label, ACCOUNT (person) and ACTIVITY
// (history clock + red unread badge) in white, Poppins Medium 8 labels, white
// home-indicator line underneath.
// ---------------------------------------------------------------------------
const TAB_RED = '#D40000';
const TAB_INK = '#0A0808';

function V2TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { notifications } = useStore();
  const unread = notifications.filter((n) => !n.read).length;

  const items: { name: keyof TabParamList; label: string }[] = [
    { name: 'Home', label: 'HOME' },
    { name: 'Account', label: 'ACCOUNT' },
    { name: 'Activity', label: 'ACTIVITY' },
  ];

  return (
    <View style={[tabStyles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={tabStyles.row}>
        {items.map((item) => {
          const routeIndex = state.routes.findIndex((r) => r.name === item.name);
          const focused = state.index === routeIndex;
          const color = focused ? TAB_RED : '#FFFFFF';
          return (
            <TouchableOpacity
              key={item.name}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={item.label}
              onPress={() => navigation.navigate(item.name)}
              style={tabStyles.item}
            >
              <View style={tabStyles.iconZone}>
                {item.name === 'Home' ? (
                  focused ? (
                    <View style={tabStyles.homeActive}>
                      <Ionicons name="home-outline" size={22} color="#FFFFFF" />
                    </View>
                  ) : (
                    <Ionicons name="home-outline" size={26} color={color} />
                  )
                ) : item.name === 'Account' ? (
                  <Ionicons name="person" size={26} color={color} />
                ) : (
                  <View>
                    <MaterialIcons name="history" size={28} color={color} />
                    {unread > 0 && (
                      <View style={tabStyles.badge}>
                        <Text style={tabStyles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
              <Text style={[tabStyles.label, { color }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* white home-indicator line, part of the frame's bar */}
      <View style={tabStyles.indicator} />
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar: { backgroundColor: TAB_INK, paddingTop: 10 },
  row: { flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center' },
  iconZone: { height: 42, alignItems: 'center', justifyContent: 'center' },
  homeActive: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: TAB_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: 'Poppins_500Medium', fontSize: 8, lineHeight: 12, letterSpacing: 0.2, marginTop: 4 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: TAB_RED,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontFamily: 'Poppins_500Medium', fontSize: 11, lineHeight: 15, color: '#FFFFFF' },
  indicator: {
    alignSelf: 'center',
    width: 134,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFFFFF',
    marginTop: 8,
  },
});

function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <V2TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={Dash.Home} />
      <Tab.Screen name="Account" component={Prof.Profile} />
      <Tab.Screen name="Activity" component={Notif.Notifications} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { isAuthenticated, restoring } = useStore();
  const { theme } = useTheme();

  // While restoring a saved session on cold start, show a splash instead of
  // flashing the login/onboarding screens before the cached user loads.
  if (restoring) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Group>
          {/* App opens directly on Login (onboarding carousel removed). */}
          <Stack.Screen name="Login" component={AuthF.Login} />
          <Stack.Screen name="Signup" component={AuthF.Signup} />
          <Stack.Screen
            name="OtpVerify"
            component={AuthF.OtpVerify}
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen name="ForgotPassword" component={AuthF.ForgotPassword} />
          <Stack.Screen name="NewPassword" component={AuthF.NewPassword} />
          {/* Reachable from the signup Terms link before authentication. */}
          <Stack.Screen name="Legal" component={LegalScr.Legal} />
          {/* System / connectivity states can surface pre-auth too. */}
          <Stack.Screen name="Offline" component={Sys.OfflineScreen} />
          <Stack.Screen name="ServerError" component={Sys.ServerErrorScreen} />
          <Stack.Screen name="Maintenance" component={Sys.MaintenanceScreen} />
          <Stack.Screen name="UpdateRequired" component={Sys.UpdateRequiredScreen} />
          <Stack.Screen name="NotFound" component={Sys.NotFoundScreen} />
          <Stack.Screen name="SessionExpired" component={Scenario.SessionExpired} />
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
          <Stack.Screen name="BrowseFavors" component={Pal.BrowseFavors} />
          <Stack.Screen name="PalFavorDetail" component={Pal.PalFavorDetail} />
          <Stack.Screen name="PalFavorInProgress" component={Pal.PalFavorInProgress} />
          <Stack.Screen name="Navigation" component={Pal.Navigation} />
          <Stack.Screen name="PalFavorComplete" component={Pal.PalFavorComplete} />
          <Stack.Screen name="PalFavorSuccess" component={Pal.PalFavorSuccess} />
          <Stack.Screen name="Earnings" component={Payouts.Earnings} />
          <Stack.Screen name="EarningDetail" component={Payouts.EarningDetail} />
          <Stack.Screen name="StripeOnboarding" component={Payouts.StripeOnboarding} />
          <Stack.Screen name="BankInfo" component={Payouts.BankInfo} />
          {/* Shared */}
          <Stack.Screen
            name="SideDrawer"
            component={Prof.SideDrawer}
            options={{ presentation: 'transparentModal', animation: 'slide_from_left' }}
          />
          <Stack.Screen name="Messages" component={Msg.Messages} />
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
          <Stack.Screen name="History" component={Hist.History} />
          <Stack.Screen name="FavorHistoryDetail" component={Hist.FavorHistoryDetail} />
          <Stack.Screen name="Notifications" component={Notif.Notifications} />
          <Stack.Screen name="Vetting" component={Onb.Vetting} />
          <Stack.Screen name="Legal" component={LegalScr.Legal} />
          {/* System / connectivity states (also registered in the auth group) */}
          <Stack.Screen name="Offline" component={Sys.OfflineScreen} />
          <Stack.Screen name="ServerError" component={Sys.ServerErrorScreen} />
          <Stack.Screen name="Maintenance" component={Sys.MaintenanceScreen} />
          <Stack.Screen name="UpdateRequired" component={Sys.UpdateRequiredScreen} />
          <Stack.Screen name="NotFound" component={Sys.NotFoundScreen} />
          <Stack.Screen name="SessionExpired" component={Scenario.SessionExpired} />
          {/* Flow / permission dead-ends (authed only) */}
          <Stack.Screen name="PermissionDenied" component={Scenario.PermissionDenied} />
          <Stack.Screen name="PaymentFailed" component={Scenario.PaymentFailed} />
          <Stack.Screen name="NoPaymentMethod" component={Scenario.NoPaymentMethod} />
          <Stack.Screen name="FavorUnavailable" component={Scenario.FavorUnavailable} />
          <Stack.Screen name="AccountSuspended" component={Scenario.AccountSuspended} />
          <Stack.Screen name="PalApplicationRejected" component={Scenario.PalApplicationRejected} />
        </Stack.Group>
      )}
    </Stack.Navigator>
      {/* Connectivity indicator overlays the whole stack (non-interactive). */}
      <OfflineBanner />
    </View>
  );
}
