import React from 'react';
import { Linking } from 'react-native';
import { FullScreenState } from '../components/states';

// ---------------------------------------------------------------------------
// Flow / permission scenario screens.
//
// A small family of full-screen "dead-end" states that the app routes to when
// something can't proceed: a denied OS permission, a failed payment, a missing
// card, a favor that vanished, a suspended account, a rejected pal application,
// or an expired session. Each one composes the shared, Figma-faithful
// <FullScreenState> kit (icon halo + title + message + pinned actions) with a
// fitting Ionicon, exact-tone copy, and wired navigation.
//
// These are MEMBER surfaces → light styling (no `dark` prop). Poppins + theme
// tokens come through <FullScreenState>/<Button>, so nothing is hardcoded here.
// Actions follow the house rules:
//   • permissions   → Linking.openSettings()
//   • session gone  → navigation.reset() to Login
//   • everything else → navigation.goBack() / navigate(...)
// ---------------------------------------------------------------------------

// Route/navigation are typed loosely to match the rest of the screen modules
// (see notifications.tsx / pal.tsx), which pass React Navigation props as `any`.
type ScreenProps = { navigation: any; route?: any };

// Reuse the kit's own icon type so the copy maps stay type-safe without pulling
// Ionicons in directly.
type IconName = React.ComponentProps<typeof FullScreenState>['icon'];

const SUPPORT_EMAIL = 'support@myfavor.app';

// Fire-and-forget helpers — Linking rejects on unsupported platforms (e.g. web),
// so swallow the rejection instead of leaving an unhandled promise.
const openSettings = () => {
  void Linking.openSettings().catch(() => {});
};
const contactSupport = (subject: string) => {
  void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`).catch(
    () => {}
  );
};

// ---------------------------------------------------------------------------
// PermissionDenied — one screen for every OS permission the app can be denied.
// Reads route.params.kind and shows the matching copy + an "Open Settings"
// action (the only real remedy once canAskAgain is false).
// ---------------------------------------------------------------------------
type PermissionKind = 'camera' | 'photos' | 'location' | 'notifications';

const PERMISSION_COPY: Record<PermissionKind, { icon: IconName; title: string; message: string }> = {
  camera: {
    icon: 'camera-outline',
    title: 'Camera access is off',
    message:
      'My Favor needs your camera to take a photo. Turn it on in Settings to continue.',
  },
  photos: {
    icon: 'images-outline',
    title: 'Photo access is off',
    message:
      'My Favor needs access to your photos to set your picture. Turn it on in Settings.',
  },
  location: {
    icon: 'location-outline',
    title: 'Location is off',
    message:
      'My Favor uses your location to match you with nearby Favor Pals. Turn it on in Settings, or go back and enter an address by hand.',
  },
  notifications: {
    icon: 'notifications-off-outline',
    title: 'Notifications are off',
    message:
      "Push notifications are off, so updates about your favors won't reach your phone. Turn them on in Settings.",
  },
};

export function PermissionDenied({ navigation, route }: ScreenProps) {
  const kind: PermissionKind = route?.params?.kind ?? 'notifications';
  const copy = PERMISSION_COPY[kind] ?? PERMISSION_COPY.notifications;
  return (
    <FullScreenState
      icon={copy.icon}
      title={copy.title}
      message={copy.message}
      actionLabel="Open Settings"
      onAction={openSettings}
      secondaryLabel="Not now"
      onSecondary={() => navigation.goBack()}
    />
  );
}

// ---------------------------------------------------------------------------
// PaymentFailed — the charge couldn't go through. Retry (back to the payment
// step) or pick another card.
// ---------------------------------------------------------------------------
export function PaymentFailed({ navigation, route }: ScreenProps) {
  const retry = () => {
    if (typeof route?.params?.onRetry === 'function') route.params.onRetry();
    else navigation.goBack();
  };
  return (
    <FullScreenState
      icon="card-outline"
      title="Payment failed"
      message="We couldn't complete your payment. Try again, or choose another card to continue."
      actionLabel="Retry payment"
      onAction={retry}
      secondaryLabel="Use another card"
      onSecondary={() => navigation.navigate('SelectPayment')}
    />
  );
}

// ---------------------------------------------------------------------------
// NoPaymentMethod — nothing on file yet. Prompt to add a card before
// requesting a favor.
// ---------------------------------------------------------------------------
export function NoPaymentMethod({ navigation }: ScreenProps) {
  return (
    <FullScreenState
      icon="wallet-outline"
      title="No payment method"
      message="Add a payment method to request this favor. You won't be charged until a Favor Pal accepts."
      actionLabel="Add a payment method"
      onAction={() => navigation.navigate('AddCard')}
      secondaryLabel="Not now"
      onSecondary={() => navigation.goBack()}
    />
  );
}

// ---------------------------------------------------------------------------
// FavorUnavailable — the favor was taken or removed while the member lingered.
// ---------------------------------------------------------------------------
export function FavorUnavailable({ navigation }: ScreenProps) {
  return (
    <FullScreenState
      icon="close-circle-outline"
      title="This favor is no longer available"
      message="It may have already been taken by another member, or removed. Try requesting another one."
      actionLabel="Request another favor"
      onAction={() => navigation.navigate('SelectFavor')}
      secondaryLabel="Go back"
      onSecondary={() => navigation.goBack()}
    />
  );
}

// ---------------------------------------------------------------------------
// AccountSuspended — the account has been locked. Route here instead of Tabs;
// the only ways forward are appealing to support or logging back out.
// ---------------------------------------------------------------------------
export function AccountSuspended({ navigation }: ScreenProps) {
  return (
    <FullScreenState
      icon="alert-circle-outline"
      title="Account suspended"
      message="Your account has been suspended and can't request or provide favors right now. If you think this is a mistake, contact our team to appeal."
      actionLabel="Contact support"
      onAction={() => contactSupport('Account suspended — appeal')}
      secondaryLabel="Back to login"
      onSecondary={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
    />
  );
}

// ---------------------------------------------------------------------------
// PalApplicationRejected — the Favor Pal application wasn't approved. Let the
// applicant re-apply or reach out for details.
// ---------------------------------------------------------------------------
export function PalApplicationRejected({ navigation }: ScreenProps) {
  return (
    <FullScreenState
      icon="document-text-outline"
      title="Application not approved"
      message="Unfortunately your Favor Pal application wasn't approved this time. You can re-apply once your details are updated, or reach out to support for the reason."
      actionLabel="Re-apply"
      onAction={() => navigation.navigate('Vetting')}
      secondaryLabel="Contact support"
      onSecondary={() => contactSupport('Favor Pal application review')}
    />
  );
}

// ---------------------------------------------------------------------------
// SessionExpired — the auth token lapsed. Send the user back to Login with a
// full navigation.reset() so the stale authenticated stack is torn down.
// ---------------------------------------------------------------------------
export function SessionExpired({ navigation }: ScreenProps) {
  return (
    <FullScreenState
      icon="time-outline"
      title="Session expired"
      message="For your security, you've been signed out. Please sign in again to pick up where you left off."
      actionLabel="Sign in again"
      onAction={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
    />
  );
}
