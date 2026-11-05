import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from './index';
import { useTheme } from '../theme';
import { API_URL } from '../api/client';

// ---------------------------------------------------------------------------
// OfflineBanner — a tiny, dependency-free connectivity indicator that overlays
// every screen and slides a themed "No internet connection" bar down from the
// top when the device drops offline.
//
// Detection is platform-split so nothing extra has to be installed:
//   • web    → the browser already knows: navigator.onLine + the window
//              'online'/'offline' events (instant, no polling).
//   • native → RN has no built-in reachability, so we poll a lightweight
//              GET {API_URL}/health every ~15s with a short abort timeout.
//              ANY HTTP response means the network is up (even a 404/5xx — we
//              reached a server), so we only flag offline when the fetch throws
//              or times out.
//
// Mounted once as an absolutely-positioned, non-interactive overlay (see
// navigation/index.tsx) so it sits above the whole stack without affecting the
// layout of any screen underneath.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 15000; // native reachability poll cadence while online
const RETRY_INTERVAL_MS = 5000; // faster recheck after a failed probe (confirm + recover quickly)
const PING_TIMEOUT_MS = 10000; // generous: /health awaits a DB roundtrip and races the launch request storm
const OFFLINE_STRIKES = 2; // consecutive failures required before flagging offline

// Native reachability probe: resolves true if we reached the server at all.
async function pingHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    // Reaching the server (any status) proves connectivity; a thrown error or
    // an abort (timeout) is what we treat as "offline".
    await fetch(`${API_URL}/health`, { method: 'GET', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Tracks connectivity as a boolean. Uses browser events on web, a poll on native.
function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
      const sync = () => setOnline(navigator.onLine);
      sync();
      window.addEventListener('online', sync);
      window.addEventListener('offline', sync);
      return () => {
        window.removeEventListener('online', sync);
        window.removeEventListener('offline', sync);
      };
    }

    // Native: poll /health on an interval; guard against setState-after-unmount.
    // A single failed probe is NOT offline — on cold start the first probe races
    // a dozen parallel launch requests against a possibly-cold backend and loses,
    // which used to flash a false "No internet" every app open. Require two
    // consecutive failures (rechecked quickly) before flagging, and keep the
    // fast cadence while offline so recovery is prompt too.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fails = 0;
    const tick = async () => {
      const ok = await pingHealth();
      if (cancelled) return;
      if (ok) {
        fails = 0;
        setOnline(true);
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      } else {
        fails += 1;
        if (fails >= OFFLINE_STRIKES) setOnline(false);
        timer = setTimeout(tick, RETRY_INTERVAL_MS);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return online;
}

export const OfflineBanner: React.FC = () => {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  // Slide/fade the bar in when offline, out when back online; keep it mounted
  // through the exit animation, then unmount so it stops overlaying entirely.
  const anim = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!online) setVisible(true);
    Animated.timing(anim, {
      toValue: online ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && online) setVisible(false);
    });
  }, [online, anim]);

  if (!visible) return null;

  return (
    <Animated.View
      // Purely informational — never intercept touches meant for the screen.
      pointerEvents="none"
      accessibilityRole="alert"
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + 8,
          backgroundColor: theme.danger, // brand red reads on both light + pal-dark screens
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [-24, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.row}>
        <Ionicons name="cloud-offline-outline" size={16} color="#FFFFFF" />
        <Txt variant="caption" color="#FFFFFF" style={styles.label}>
          No internet connection
        </Txt>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { marginLeft: 8 },
});

export default OfflineBanner;
