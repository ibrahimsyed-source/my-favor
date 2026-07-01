import React, { useEffect } from 'react';
import { View, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from '../components';
import { tokens } from '../theme';
import { useStore } from '../store';
import { AppNotification } from '../types';

// ---------------------------------------------------------------------------
// User App v.2 DARK palette (local — the shared theme is light and drives the
// auth screens; these content screens are intentionally dark).
// ---------------------------------------------------------------------------
const DARK = {
  bg: '#0C0C0C',
  card: '#171922',
  pill: '#1C2331',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.6)',
  textTertiary: 'rgba(255,255,255,0.4)',
  divider: 'rgba(255,255,255,0.10)',
  brand: '#ED1C24',
  success: '#02CB00',
} as const;

const ICON: Record<AppNotification['type'], keyof typeof Ionicons.glyphMap> = {
  match: 'checkmark-circle',
  cancellation: 'close-circle',
  no_pal: 'alert-circle',
  arrived: 'location',
  general: 'notifications',
};

// Per-type accent for the icon glyph (styling only — dark v.2 uses coloured
// glyphs on a raised pill instead of the light theme's single red).
const ICON_COLOR: Record<AppNotification['type'], string> = {
  match: DARK.success,
  cancellation: DARK.brand,
  no_pal: DARK.brand,
  arrived: DARK.success,
  general: DARK.text,
};

function timeAgo(ms: number, now: number) {
  const d = Math.max(0, now - ms);
  const m = Math.round(d / 60000);
  if (m < 60) return `${m || 1}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

// Notifications — the inbox that renders the previously-dead notification model.
export function Notifications({ navigation }: any) {
  const { notifications, markNotificationRead, markAllNotificationsRead, refreshNotifications, activeFavor } = useStore();
  // Anchor relative timestamps to the real clock so a day-old item reads "1d",
  // not "5m" relative to the newest notification.
  const now = Date.now();
  const hasUnread = notifications.some((n) => !n.read);

  // Mark read, then deep-link to the related favor when one is implied by type.
  const handlePress = (item: AppNotification) => {
    markNotificationRead(item.id);
    switch (item.type) {
      case 'match':
      case 'arrived':
        if (activeFavor) navigation.navigate('FavorTracking');
        else navigation.navigate('Tabs', { screen: 'History' });
        break;
      case 'cancellation':
      case 'no_pal':
        navigation.navigate('Tabs', { screen: 'History' });
        break;
      default:
        break; // 'general' — no destination, mark-read only
    }
  };

  // Pull fresh notifications on open + whenever the screen regains focus.
  useEffect(() => {
    void refreshNotifications();
    const unsub = navigation.addListener('focus', () => { void refreshNotifications(); });
    return unsub;
  }, [navigation]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: DARK.bg }} edges={['top']}>
      {/* Dark top bar (the shared TopBar renders from the light theme). */}
      <View
        style={{
          height: 52,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: DARK.divider,
        }}
      >
        {navigation.canGoBack() ? (
          <TouchableOpacity onPress={navigation.goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={26} color={DARK.text} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 26 }} />
        )}
        <Txt variant="h6" color={DARK.text}>Notifications</Txt>
        <View style={{ width: 26 }} />
      </View>

      {hasUnread ? (
        <TouchableOpacity
          onPress={markAllNotificationsRead}
          accessibilityRole="button"
          accessibilityLabel="Mark all notifications as read"
          style={{ alignSelf: 'flex-end', paddingHorizontal: tokens.spacing.lg, paddingVertical: 10 }}
        >
          <Txt variant="bodySm" color={DARK.text} style={{ fontWeight: '600' }}>Mark all read</Txt>
        </TouchableOpacity>
      ) : null}

      {notifications.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="notifications-off-outline" size={48} color={DARK.textTertiary} />
          <Txt variant="h4" color={DARK.text} center style={{ marginTop: 14 }}>You're all caught up</Txt>
          <Txt variant="body" color={DARK.textSecondary} center style={{ marginTop: 6 }}>
            Updates about your favors will show up here.
          </Txt>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingVertical: 4 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handlePress(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.body}${item.read ? '' : '. Unread'}`}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                paddingHorizontal: tokens.spacing.lg,
                paddingVertical: tokens.spacing.base,
                borderBottomWidth: 1,
                borderBottomColor: DARK.divider,
                // Unread rows sit on a raised navy card; read rows blend into the screen.
                backgroundColor: item.read ? DARK.bg : DARK.card,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: DARK.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 14,
                }}
              >
                <Ionicons name={ICON[item.type]} size={22} color={ICON_COLOR[item.type]} />
              </View>
              <View style={{ flex: 1, paddingTop: 2 }}>
                <Txt variant="label" color={DARK.text}>{item.title}</Txt>
                <Txt variant="bodySm" color={DARK.textSecondary} style={{ marginTop: 2 }}>{item.body}</Txt>
              </View>
              <Txt variant="caption" color={DARK.textTertiary} style={{ marginLeft: 8 }}>{timeAgo(item.date, now)}</Txt>
              {!item.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: DARK.brand, marginLeft: 8, marginTop: 6 }} />}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}
