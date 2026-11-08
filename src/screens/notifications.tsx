import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, TouchableOpacity, Modal, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TopBar } from '../components';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { getNotificationsApi } from '../api/endpoints';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { tokens, palette } from '../theme';
import { useStore } from '../store';
import { AppNotification } from '../types';

// ---------------------------------------------------------------------------
// User App v.2 notification frames (values read off Figma inspect, fileKey
// L8LkpFZh6PXFdJVMTH33ff):
//   #125:8532  "Notifications  Modal"            — push-permission dialog
//   #125:10778 "Match Alert Notification"        — white alert card + OKAY
//   #125:9157  "Cancellation Alert Notification" — same card template, gray+black buttons
// Card template: white 351w, radius 16, over a rgba(0,0,0,0.5) scrim.
// Title Poppins Medium 24/36 #0D0A0A (Y28) · body Poppins 16/24 #0D0A0A (Y81,
// X32 W287) · buttons 48h radius 8, letter-spacing 0 (#0D0A0A black / #E5E5E5
// gray), buttons Y280, card 351x358 (bottom inset 30).
// Permission dialog (re-inspected via Figma web): card 357x253 r14 at Y315;
// title Poppins Medium 24/Auto(36) #282828 Y30 W307; body Poppins Regular
// 12/Auto(18) #282828 Y119 W307; hairlines #EAEAEA (H at Y186, V at X179
// H67); half-width 177x67 actions, labels Poppins Regular 18/Auto(27) #009FEE.
// ---------------------------------------------------------------------------
const INK = '#0D0A0A'; // alert text + solid black button (Figma fill)
const PERM_TEXT = '#282828';
const PERM_LINE = '#EAEAEA';
const SCRIM = 'rgba(0,0,0,0.5)';
// Poppins Medium is registered in App.tsx but not exposed on the `fonts` token
// map yet (see foundationRequests) — literal until then, like onboarding.tsx.
const POPPINS_MEDIUM = 'Poppins_500Medium';

// Dismiss-button copy per notification type, straight from the v.2 alert
// frames: Match Alert uses "OKAY" (#125:10778); the cancellation / no-pal
// notification alerts use "CLOSE" (e.g. "No Favor Pal Available" #125:11190).
const ACTION_LABEL: Record<AppNotification['type'], string> = {
  match: 'OKAY',
  arrived: 'OK',
  offer: 'VIEW',
  general: 'OKAY',
  cancellation: 'CLOSE',
  no_pal: 'CLOSE',
};

function timeAgo(ms: number, now: number) {
  const d = Math.max(0, now - ms);
  const m = Math.round(d / 60000);
  if (m < 60) return `${m || 1}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

// The v.2 flow shows the OS permission primer once (right after signup in the
// mocks) — mirror that once per INSTALL via a persisted flag, and have OK run
// the real permission request so the dialog's choice is honest, not decorative.
const PERM_PROMPT_KEY = 'myfavor.pushPermPromptShown';

// Statuses where a pal is assigned and the favor is physically underway — the
// states a 'match'/'arrived' notification can be about.
const POST_MATCH = ['matched', 'enroute', 'arrived', 'in_progress'];

// Notifications — v.2 inbox. Every item renders as the frames' white alert
// card; the newest unread one also pops as the full-screen alert over the
// dimmed list, exactly like the Match/Cancellation Alert Notification frames.
export function Notifications({ navigation }: any) {
  const { notifications, markNotificationRead, markAllNotificationsRead, refreshNotifications, activeMemberFavor, activePalFavor } = useStore();
  // Anchor relative timestamps to the real clock so a day-old item reads "1d",
  // not "5m" relative to the newest notification.
  const now = Date.now();
  const hasUnread = notifications.some((n) => !n.read);

  // The store's refreshNotifications() swallows network errors, so a probe of
  // the same endpoint (run in parallel) tells us whether the fetch actually
  // failed — letting us show the kit's ErrorState instead of a false "all
  // caught up" empty. `loaded` gates the initial LoadingState.
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const [probe] = await Promise.allSettled([getNotificationsApi(), refreshNotifications()]);
    setErrored(probe.status === 'rejected');
    setLoaded(true);
  }, [refreshNotifications]);

  // v.2 "Notifications  Modal" (#125:8532) — push-permission dialog, shown once
  // per install (AsyncStorage flag). OK fires the REAL OS permission request
  // (no-op when already granted / simulator / web); Don't Allow just declines.
  const [permVisible, setPermVisible] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(PERM_PROMPT_KEY)
      .then((seen) => { if (alive && !seen) setPermVisible(true); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const closePermPrompt = (allow: boolean) => {
    setPermVisible(false);
    void AsyncStorage.setItem(PERM_PROMPT_KEY, '1').catch(() => undefined);
    if (allow) void registerForPushNotificationsAsync();
  };

  // Newest unread pops as the alert-notification modal. Alerted ids are
  // remembered for the session (not a mount-lifetime latch) so the persistent
  // Activity tab RE-ARMS whenever a NEW unread arrives; a dismissed-but-still-
  // unread item never re-pops.
  const [alertId, setAlertId] = useState<string | null>(null);
  const alertedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (alertId) return; // one alert at a time
    const newest = notifications.filter((n) => !n.read).sort((a, b) => b.date - a.date)[0];
    if (newest && !alertedIds.current.has(newest.id)) {
      alertedIds.current.add(newest.id);
      setAlertId(newest.id);
    }
  }, [notifications, alertId]);
  const alertItem = alertId ? notifications.find((n) => n.id === alertId && !n.read) : undefined;
  const dismissAlert = () => setAlertId(null);

  // Mark read, then deep-link to the related favor when one is implied by type.
  const handlePress = (item: AppNotification) => {
    markNotificationRead(item.id);
    switch (item.type) {
      case 'match':
      case 'arrived': {
        // Prefer the slot the type IMPLIES. Server-side, 'arrived' only ever
        // goes to the favor's member, and 'match' is member-side too except the
        // "your offer was accepted" push to a pal — so a member favor in a
        // post-match status wins; the pal slot routes only when IT is the one
        // in a matching live status. Known limit: notification rows carry no
        // favorId, so with BOTH slots post-match a pal-side 'match' still lands
        // on the member's tracking — unresolvable without a server change.
        const memberLive = !!activeMemberFavor && POST_MATCH.includes(activeMemberFavor.status);
        if (memberLive) navigation.navigate('FavorTracking');
        else if (activePalFavor && POST_MATCH.includes(activePalFavor.status)) {
          navigation.navigate(
            activePalFavor.status === 'arrived' || activePalFavor.status === 'in_progress'
              ? 'PalFavorInProgress'
              : 'Navigation',
          );
        } else if (activeMemberFavor) navigation.navigate('FavorTracking');
        else navigation.navigate('History');
        break;
      }
      case 'cancellation':
      case 'no_pal':
        navigation.navigate('History');
        break;
      case 'offer':
        // Offer news is two-sided and rows carry no favorId, so disambiguate by
        // the strongest local signal: my own open request that actually HOLDS
        // offers → review them on Searching (member-side 'offer' news always
        // leaves an offer row on my request). Otherwise the news is pal-side
        // (my offer was countered/declined) → the board, where the favor detail
        // shows my offer state; it's registered for every user, so this never
        // dead-ends on the role toggle. Known limit: an open request with
        // offers masks pal-side news when both negotiations are live.
        if (
          activeMemberFavor?.status === 'requested' &&
          (activeMemberFavor.offers ?? []).length > 0
        ) {
          navigation.navigate('Searching');
        } else navigation.navigate('BrowseFavors');
        break;
      default:
        break; // 'general' — no destination, mark-read only
    }
  };

  // Pull fresh notifications on open + whenever the screen regains focus.
  useEffect(() => {
    void load();
    const unsub = navigation.addListener('focus', () => { void load(); });
    return unsub;
  }, [navigation]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
      <TopBar title="Notifications" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />

      {hasUnread ? (
        <TouchableOpacity
          onPress={markAllNotificationsRead}
          accessibilityRole="button"
          accessibilityLabel="Mark all notifications as read"
          style={{ alignSelf: 'flex-end', paddingHorizontal: tokens.spacing.lg, paddingVertical: 10 }}
        >
          <Text style={styles.markAll}>Mark all read</Text>
        </TouchableOpacity>
      ) : null}

      {notifications.length === 0 ? (
        // Light (member) screen — no `dark` prop. Loading on first fetch,
        // ErrorState (with retry) on a failed probe, else the empty inbox.
        !loaded ? (
          <LoadingState label="Loading notifications…" />
        ) : errored ? (
          <ErrorState
            title="Couldn’t load notifications"
            message="Check your connection and try again."
            onRetry={load}
          />
        ) : (
          <EmptyState
            icon="notifications-off-outline"
            title="You're all caught up"
            message="Updates about your favors will show up here."
          />
        )
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingHorizontal: tokens.spacing.lg, paddingTop: 4, paddingBottom: 24, gap: 14 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => handlePress(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.body}${item.read ? '' : '. Unread'}`}
              style={[
                styles.rowCard,
                item.read
                  ? { backgroundColor: palette.surfaceAlt }
                  : [{ backgroundColor: '#FFFFFF' }, tokens.shadow.card],
              ]}
            >
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowBody}>{item.body}</Text>
              <Text style={styles.rowTime}>{timeAgo(item.date, now)}</Text>
              {!item.read && (
                <View style={[styles.solidBtn, { marginTop: 16 }]}>
                  <Text style={styles.solidBtnLabel}>{ACTION_LABEL[item.type]}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* v.2 "Notifications  Modal" #125:8532 — “My Favor” push-permission dialog. */}
      <Modal
        visible={permVisible}
        transparent
        animationType="fade"
        onRequestClose={() => closePermPrompt(false)}
        accessibilityViewIsModal
      >
        <View style={styles.scrim}>
          <View style={styles.permCard}>
            <Text style={styles.permTitle}>“My Favor” would like to send you notifications</Text>
            <Text style={styles.permBody}>
              Notifications may include alerts, sounds, and icon badges.  These can be configured in Settings.
            </Text>
            <View style={styles.permLineH} />
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                style={styles.permBtn}
                onPress={() => closePermPrompt(false)}
                accessibilityRole="button"
                accessibilityLabel="Don't allow notifications"
              >
                <Text style={styles.permBtnLabel}>Don't Allow</Text>
              </TouchableOpacity>
              <View style={styles.permLineV} />
              <TouchableOpacity
                style={styles.permBtn}
                onPress={() => closePermPrompt(true)}
                accessibilityRole="button"
                accessibilityLabel="Allow notifications"
              >
                <Text style={styles.permBtnLabel}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* v.2 alert-notification modal (#125:10778 / #125:9157 presentation) —
          the newest unread item over the dimmed inbox. Scrim tap dismisses
          without marking read; the button marks read + deep-links. */}
      <Modal
        visible={!permVisible && !!alertItem}
        transparent
        animationType="fade"
        onRequestClose={dismissAlert}
        accessibilityViewIsModal
      >
        <TouchableOpacity activeOpacity={1} onPress={dismissAlert} style={styles.scrim}>
          <TouchableOpacity activeOpacity={1} style={styles.alertCard}>
            <Text style={styles.alertTitle}>{alertItem?.title}</Text>
            <Text style={styles.alertBody}>{alertItem?.body}</Text>
            <TouchableOpacity
              style={[styles.solidBtn, { marginTop: 31 }]}
              onPress={() => {
                dismissAlert();
                if (alertItem) handlePress(alertItem);
              }}
              accessibilityRole="button"
              accessibilityLabel={alertItem ? ACTION_LABEL[alertItem.type] : 'OKAY'}
            >
              <Text style={styles.solidBtnLabel}>{alertItem ? ACTION_LABEL[alertItem.type] : 'OKAY'}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: SCRIM, alignItems: 'center', justifyContent: 'center' },

  // Alert card (Match/Cancellation Alert Notification frames: 351w, r16).
  alertCard: {
    width: '85%',
    maxWidth: 351,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 30,
  },
  alertTitle: { fontFamily: POPPINS_MEDIUM, fontSize: 24, lineHeight: 36, color: INK, textAlign: 'center', paddingHorizontal: 8 },
  alertBody: { fontFamily: POPPINS_MEDIUM, fontSize: 16, lineHeight: 24, color: INK, textAlign: 'center', marginTop: 17, paddingHorizontal: 8 },
  solidBtn: { height: 48, borderRadius: 8, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  solidBtnLabel: { fontFamily: POPPINS_MEDIUM, fontSize: 16, lineHeight: 24, color: '#FFFFFF' },

  // Inbox rows — compact version of the same alert-card template.
  rowCard: { borderRadius: 16, paddingVertical: 20, paddingHorizontal: 20 },
  rowTitle: { fontFamily: POPPINS_MEDIUM, fontSize: 18, lineHeight: 26, color: INK, textAlign: 'center' },
  rowBody: { fontFamily: POPPINS_MEDIUM, fontSize: 14, lineHeight: 21, color: INK, textAlign: 'center', marginTop: 4 },
  rowTime: { fontFamily: POPPINS_MEDIUM, fontSize: 12, lineHeight: 16, color: palette.textTertiary, textAlign: 'center', marginTop: 8 },
  markAll: { fontFamily: POPPINS_MEDIUM, fontSize: 13, lineHeight: 18, color: palette.info },

  // Push-permission dialog (#125:8532): 357x253 card r14, #282828 text,
  // #EAEAEA hairlines, half-width 177x67 actions in #009FEE.
  // (Design body/labels are Poppins Regular — closest loaded weight is Medium.)
  permCard: { width: '86%', maxWidth: 357, backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden' },
  permTitle: {
    fontFamily: POPPINS_MEDIUM,
    fontSize: 24,
    lineHeight: 36,
    color: PERM_TEXT,
    textAlign: 'center',
    marginTop: 30,
    paddingHorizontal: 25,
  },
  permBody: {
    fontFamily: POPPINS_MEDIUM,
    fontSize: 12,
    lineHeight: 18,
    color: PERM_TEXT,
    textAlign: 'center',
    marginTop: 17,
    marginBottom: 31,
    paddingHorizontal: 25,
  },
  permLineH: { height: 1, backgroundColor: PERM_LINE },
  permLineV: { width: 1, backgroundColor: PERM_LINE },
  permBtn: { flex: 1, height: 66, alignItems: 'center', justifyContent: 'center' },
  permBtnLabel: { fontFamily: POPPINS_MEDIUM, fontSize: 18, lineHeight: 27, color: palette.info },
});
