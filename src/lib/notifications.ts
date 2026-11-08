import { Platform } from 'react-native';
import { updatePushTokenApi } from '../api/endpoints';

// Without a handler, expo-notifications suppresses pushes that arrive while the
// app is FOREGROUNDED — the user would only learn of them via the 20s poll. Set
// once (guarded) from every entry point in this module; dynamic import keeps a
// build lacking the native module safe.
let handlerConfigured = false;
async function ensureNotificationHandler() {
  if (handlerConfigured || Platform.OS === 'web') return;
  handlerConfigured = true;
  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    /* module missing — pushes aren't delivered on this build anyway */
  }
}

// Subscribe to notification TAPS (the user opening a push). `cb` receives the
// push's data payload — the server attaches routing hints like
// {type:'message', threadId} / {type:'new_favor', favorId} — and the navigation
// owner wires it to deep-link. Returns an unsubscribe. Also delivers (once per
// JS session) the tap that LAUNCHED the app, so cold-start taps deep-link too.
// Best-effort: web or a build lacking the native module yields a no-op.
let launchTapDelivered = false;
export function addNotificationResponseListener(
  cb: (data: Record<string, unknown>) => void,
): () => void {
  if (Platform.OS === 'web') return () => undefined;
  let sub: { remove: () => void } | undefined;
  let removed = false;
  void (async () => {
    try {
      await ensureNotificationHandler();
      const Notifications = await import('expo-notifications');
      if (removed) return;
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        cb((response.notification.request.content.data ?? {}) as Record<string, unknown>);
      });
      if (!launchTapDelivered) {
        launchTapDelivered = true;
        const last = await Notifications.getLastNotificationResponseAsync();
        if (last && !removed) {
          cb((last.notification.request.content.data ?? {}) as Record<string, unknown>);
        }
      }
    } catch {
      /* module missing */
    }
  })();
  return () => {
    removed = true;
    sub?.remove();
  };
}

// Registers this device for Expo push notifications and saves the resulting token
// to the signed-in user's profile (PATCH /api/profile/push-token), so the server
// can deliver favor-lifecycle pushes (accepted / arrived / completed).
//
// Native-only: web has no push token. Best-effort throughout — no permission, no
// EAS projectId, a simulator, or a missing native module all resolve to null
// instead of throwing, so this can be fired from app startup without risk.
// Requires an authenticated session (the PATCH is auth'd), so call it after login.
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    await ensureNotificationHandler();
    // Dynamic imports so a build lacking these native modules can't break the JS
    // bundle at load — a missing module just rejects and we return null.
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device');
    const Constants = (await import('expo-constants')).default;

    // Push tokens are only issued on physical devices, never simulators.
    if (!Device.isDevice) return null;

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    // Android needs a channel registered before a token will deliver.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // EAS projectId is required to mint an Expo push token in SDK 49+.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenResponse.data;
    if (!token) return null;

    // Persist to the profile so the backend can push to this device.
    await updatePushTokenApi(token).catch(() => undefined);
    return token;
  } catch {
    return null;
  }
}
