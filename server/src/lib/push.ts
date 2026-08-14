import { prisma } from '../db';

// Device push notifications via Expo's push service. This is FREE and needs no
// API key — the Expo push endpoint accepts an ExponentPushToken registered by the
// app (see src/lib/notifications.ts) and delivers to APNs/FCM on our behalf.
//
// All calls are best-effort: a push failure must never break the favor lifecycle
// (the in-app Notification row is the durable record; push is a courtesy ping).

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

// Expo tokens look like ExponentPushToken[xxxxxxxx] or ExpoPushToken[xxxxxxxx].
function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[.+\]$/.test(token.trim());
}

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Send a push to a single user by id. No-ops silently when the user has no token
// (e.g. web-only accounts) or the token is malformed.
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true },
    });
    const token = user?.pushToken;
    if (!token || !isExpoPushToken(token)) return;

    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          to: token,
          sound: 'default',
          title,
          body,
          ...(data ? { data } : {}),
        },
      ]),
    });

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`Expo push send failed (${res.status}) for user ${userId}`);
      return;
    }

    // Expo returns per-message tickets; a DeviceNotRegistered error means the
    // token is stale (app uninstalled / permissions revoked) — clear it so we
    // stop trying to push to a dead device.
    const json = (await res.json().catch(() => null)) as
      | { data?: Array<{ status?: string; details?: { error?: string } }> }
      | null;
    const ticket = json?.data?.[0];
    if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      await prisma.user
        .update({ where: { id: userId }, data: { pushToken: null } })
        .catch(() => undefined);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('sendPushNotification error:', err);
  }
}
