import React, { useEffect } from 'react';
import { View, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, TopBar, Txt } from '../components';
import { useTheme, tokens } from '../theme';
import { useStore } from '../store';
import { AppNotification } from '../types';

const ICON: Record<AppNotification['type'], keyof typeof Ionicons.glyphMap> = {
  match: 'checkmark-circle',
  cancellation: 'close-circle',
  no_pal: 'alert-circle',
  arrived: 'location',
  general: 'notifications',
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
  const { theme } = useTheme();
  const { notifications, markNotificationRead, markAllNotificationsRead, refreshNotifications } = useStore();
  const now = notifications.reduce((mx, n) => Math.max(mx, n.date), 0) + 300000;
  const hasUnread = notifications.some((n) => !n.read);

  // Pull fresh notifications on open + whenever the screen regains focus.
  useEffect(() => {
    void refreshNotifications();
    const unsub = navigation.addListener('focus', () => { void refreshNotifications(); });
    return unsub;
  }, [navigation]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen padded={false}>
      <TopBar title="Notifications" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      {hasUnread ? (
        <TouchableOpacity
          onPress={markAllNotificationsRead}
          accessibilityRole="button"
          accessibilityLabel="Mark all notifications as read"
          style={{ alignSelf: 'flex-end', paddingHorizontal: tokens.spacing.lg, paddingVertical: 10 }}
        >
          <Txt variant="bodySm" color={theme.primary} style={{ fontWeight: '600' }}>Mark all read</Txt>
        </TouchableOpacity>
      ) : null}
      {notifications.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="notifications-off-outline" size={48} color={theme.textTertiary} />
          <Txt variant="h4" center style={{ marginTop: 14 }}>You're all caught up</Txt>
          <Txt variant="body" color={theme.textSecondary} center style={{ marginTop: 6 }}>
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
              onPress={() => markNotificationRead(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.body}${item.read ? '' : '. Unread'}`}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                paddingHorizontal: tokens.spacing.lg,
                paddingVertical: tokens.spacing.base,
                borderBottomWidth: 1,
                borderBottomColor: theme.divider,
                backgroundColor: item.read ? theme.background : theme.surfaceAlt,
              }}
            >
              <Ionicons name={ICON[item.type]} size={24} color={theme.primary} style={{ marginRight: 14, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Txt variant="label">{item.title}</Txt>
                <Txt variant="bodySm" color={theme.textSecondary} style={{ marginTop: 2 }}>{item.body}</Txt>
              </View>
              <Txt variant="caption" color={theme.textTertiary} style={{ marginLeft: 8 }}>{timeAgo(item.date, now)}</Txt>
              {!item.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary, marginLeft: 8, marginTop: 6 }} />}
            </TouchableOpacity>
          )}
        />
      )}
    </Screen>
  );
}
