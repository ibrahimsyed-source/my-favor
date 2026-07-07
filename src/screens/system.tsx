import React from 'react';
import { Linking, Platform } from 'react-native';
import { FullScreenState } from '../components/states';

// ---------------------------------------------------------------------------
// System / connectivity scenario screens.
//
// Standalone, member-light full-screen states for the moments the app can't
// show its normal content: no internet, a 5xx / timeout, scheduled maintenance,
// a forced update, an expired session, and the generic 404 / deleted-resource
// catch-all. Every screen composes the shared <FullScreenState> from the state
// kit (Poppins via <Txt>, Ionicons, theme tokens, 48h radius-8 CTA) so the copy
// and layout stay Figma-faithful and consistent with the list/detail states.
//
// Each is a screen component taking { navigation, route }. Member-light by
// default (no `dark` prop). Actions are wired per scenario:
//   • SessionExpired → navigation.reset to Login
//   • UpdateRequired → Linking.openURL to the store listing
//   • Offline / ServerError / Maintenance → retry (route.params.onRetry, else back)
//   • NotFound → reset to Tabs (+ optional Go back)
// ---------------------------------------------------------------------------

type ScreenProps = { navigation: any; route?: any };

// App-store listing URLs for the force-update CTA. Placeholder ids get swapped
// for the real ones at submission; a caller can also override via
// route.params.storeUrl (e.g. a remote-config deep link).
const STORE_URL = (Platform.select({
  ios: 'https://apps.apple.com/app/id000000000',
  android: 'https://play.google.com/store/apps/details?id=com.myfavor.app',
  default: 'https://myfavor.app',
}) as string);

// Retry helper: prefer an explicit route.params.onRetry callback when a caller
// wired one (e.g. re-running a store loader); otherwise fall back to popping
// back to the previous screen, or resetting to the tabs when there's no history.
function makeRetry({ navigation, route }: ScreenProps) {
  return () => {
    const onRetry = route?.params?.onRetry;
    if (typeof onRetry === 'function') {
      onRetry();
      return;
    }
    if (navigation.canGoBack?.()) {
      navigation.goBack();
      return;
    }
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };
}

// ---------------------------------------------------------------------------
// Offline / no internet — dropped connection, with a Retry.
// ---------------------------------------------------------------------------
export function OfflineScreen({ navigation, route }: ScreenProps) {
  return (
    <FullScreenState
      icon="cloud-offline-outline"
      title="No internet connection"
      message="You're offline. Check your Wi-Fi or mobile data, then try again."
      actionLabel="Retry"
      onAction={makeRetry({ navigation, route })}
    />
  );
}

// ---------------------------------------------------------------------------
// Server error / timeout — 5xx or a request that took too long.
// ---------------------------------------------------------------------------
export function ServerErrorScreen({ navigation, route }: ScreenProps) {
  return (
    <FullScreenState
      icon="server-outline"
      title="Something went wrong"
      message="The request took too long or our servers are busy. This one's on us — please try again."
      actionLabel="Try again"
      onAction={makeRetry({ navigation, route })}
    />
  );
}

// ---------------------------------------------------------------------------
// Maintenance mode — planned downtime.
// ---------------------------------------------------------------------------
export function MaintenanceScreen({ navigation, route }: ScreenProps) {
  return (
    <FullScreenState
      icon="construct-outline"
      title="We'll be right back"
      message="My Favor is down for scheduled maintenance. Hang tight — we'll be back up shortly."
      actionLabel="Check again"
      onAction={makeRetry({ navigation, route })}
    />
  );
}

// ---------------------------------------------------------------------------
// Update required — running version is below the minimum supported. Blocking,
// non-dismissable: the only way forward is to update.
// ---------------------------------------------------------------------------
export function UpdateRequiredScreen({ route }: ScreenProps) {
  const url: string = route?.params?.storeUrl ?? STORE_URL;
  return (
    <FullScreenState
      icon="cloud-download-outline"
      title="Update required"
      message="A newer version of My Favor is available. Update now to keep using the app."
      actionLabel="Update now"
      onAction={() => {
        void Linking.openURL(url);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Session expired — signed out (e.g. 401). Route back to Login.
// ---------------------------------------------------------------------------
export function SessionExpiredScreen({ navigation }: ScreenProps) {
  return (
    <FullScreenState
      icon="lock-closed-outline"
      title="Session expired"
      message="For your security, you've been signed out. Please log in again to continue."
      actionLabel="Back to login"
      onAction={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
    />
  );
}

// ---------------------------------------------------------------------------
// Not found — unknown route or a deleted resource. Generic catch-all.
// ---------------------------------------------------------------------------
export function NotFoundScreen({ navigation }: ScreenProps) {
  const canGoBack: boolean = !!navigation.canGoBack?.();
  return (
    <FullScreenState
      icon="compass-outline"
      title="Page not found"
      message="We couldn't find what you're looking for. It may have been moved, removed, or never existed."
      actionLabel="Go home"
      onAction={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })}
      secondaryLabel={canGoBack ? 'Go back' : undefined}
      onSecondary={canGoBack ? () => navigation.goBack() : undefined}
    />
  );
}
