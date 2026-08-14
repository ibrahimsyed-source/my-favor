import { Platform } from 'react-native';
import { updatePushTokenApi } from '../api/endpoints';

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
