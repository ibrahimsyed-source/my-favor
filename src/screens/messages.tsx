import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Modal, ListRenderItemInfo, RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular } from '@expo-google-fonts/poppins';
import { Txt, Avatar, ConfirmModal, InfoModal } from '../components';
import { useStore } from '../store';
import { tokens } from '../theme';
import { Message, Thread } from '../types';

// ---------------------------------------------------------------------------
// Inbox palette — LIGHT, per FIDELITY_AUDIT "Messages" row: no dark inbox frame
// exists on the v.2 canvas, so the inbox follows the light chat language of
// the Detail View (125:11582): white bg, 1px #EEEEEE separators, ink #0D0A0A,
// gray secondary, red #ED1C24 unread badge.
// ---------------------------------------------------------------------------
const C = {
  bg: '#FFFFFF',                       // screen background
  pill: '#EEEEEE',                     // filter chip (light gray, matches dividers)
  border: '#EEEEEE',                   // dividers / borders (detail-view line color)
  text: '#0D0A0A',                     // primary text / icons (v.2 ink)
  textSecondary: '#9E9E9E',            // gray secondary (detail-view placeholder gray)
  textTertiary: '#C4C4C4',
  ctaBg: '#0D0A0A',                    // selected chip = black on light surface
  ctaText: '#FFFFFF',
  brand: '#ED1C24',
} as const;

// ---------------------------------------------------------------------------
// "Messages - Detail View" (Figma v.2 frame 125:11582) — LIGHT chat screen.
// Every value below is read straight off the frame's nodes:
//   frame bg #FFFFFF; topbar H64, white, 1px #EEEEEE bottom line;
//   back arrow 24px #0D0A0A at x16; avatar 40 at x64; name Poppins Medium 18
//   #0D0A0A (x +14); ellipsis 24px #0D0A0A at right margin 16.
//   Incoming bubble fill #D7D7D7, radius 8/8/8 with bottom-left 0; outgoing
//   fill #EEEEEE, radius 8/8/8 with bottom-right 0; text Poppins Regular 14
//   #0D0A0A, padding 16 h / 10 v (row H40); 24x24 round avatar sits 8px from
//   the bubble on the outer side, bottom-aligned; bubble column starts 56px
//   from the edge (24 margin + 24 avatar + 8 gap); 4px between bubbles of a
//   run, 24px between runs; first bubble 24px under the topbar.
//   Composer bar fill #EEEEEE (x0 w414, from y782 to the bottom, soft top
//   shadow): 16px padding, white pill W~350 H48 radius 24 (text inset 16,
//   placeholder "Type something…" Poppins Regular 16 #9E9E9E, 16px emoji
//   outline glyph #0D0A0A inset 20 from the pill's right), then an 8px gap
//   and the black (#0D0A0A) 16px send plane in a 24px box.
// ---------------------------------------------------------------------------
const L = {
  bg: '#FFFFFF',
  text: '#0D0A0A',
  divider: '#EEEEEE',
  bubbleIn: '#D7D7D7',
  bubbleOut: '#EEEEEE',
  composerBg: '#EEEEEE',
  pillBg: '#FFFFFF',
  placeholder: '#9E9E9E',
  brand: '#ED1C24',
  scrim: 'rgba(0,0,0,0.4)',
} as const;

const P_REGULAR = 'Poppins_400Regular'; // loaded locally (App.tsx has 500/600/700)
const P_MEDIUM = 'Poppins_500Medium';   // registered app-wide in App.tsx

// Poppins Regular isn't registered app-wide; expo-font caches globally so this
// resolves instantly after the first mount anywhere in the app.
function usePoppinsRegular() {
  const [loaded] = useFonts({ Poppins_400Regular });
  return loaded;
}

// Reference "now" that matches the seed data's NOW constant so the relative
// timestamps on the list render sensible values (10m / 3h / 1d).
const REF_NOW = 1717000000000;

function timeAgo(ts: number): string {
  const diff = Math.max(0, REF_NOW - ts);
  const m = Math.round(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.round(d / 7)}w`;
}

// ---------------------------------------------------------------------------
// Messages — tab screen. Light iOS-style list of conversation threads.
// ---------------------------------------------------------------------------
export const Messages = ({ navigation }: any) => {
  const s = useStore();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Keep the conversation list (and unread counts) fresh on focus.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { void s.refreshThreads(); });
    return unsub;
  }, [navigation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pull-to-refresh: users instinctively pull a message/inbox list.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await s.refreshThreads(); } finally { setRefreshing(false); }
  }, [s]);

  // Hide conversations with blocked users so a block has a visible effect.
  const threads = useMemo(() => {
    const visible = s.threads.filter((t) => !s.blockedUsers.includes(t.withUser.id));
    return onlyUnread ? visible.filter((t) => t.unread > 0) : visible;
  }, [s.threads, s.blockedUsers, onlyUnread]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Thread>) => (
      <ThreadRow
        thread={item}
        onPress={() => navigation.navigate('MessageThread', { threadId: item.id })}
      />
    ),
    [navigation]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flex: 1 }}>
        {/* Header: large title + Unread filter chip */}
        <View style={lstyles.header}>
          <Txt variant="h1" color={C.text}>Messages</Txt>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setOnlyUnread((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Filter unread conversations"
            accessibilityState={{ selected: onlyUnread }}
            style={[
              lstyles.chip,
              { backgroundColor: onlyUnread ? C.ctaBg : C.pill },
            ]}
          >
            <Txt
              variant="bodySm"
              color={onlyUnread ? C.ctaText : C.textSecondary}
              style={{ fontFamily: tokens.typography.label.fontFamily }}
            >
              Unread
            </Txt>
          </TouchableOpacity>
        </View>

        <FlatList
          data={threads}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: tokens.spacing.xl, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.text} />
          }
          ListEmptyComponent={
            <View style={{ paddingTop: 80, alignItems: 'center' }}>
              <Ionicons name="chatbubbles-outline" size={40} color={C.textTertiary} />
              <Txt variant="body" color={C.textSecondary} style={{ marginTop: 12 }}>
                {onlyUnread ? 'No unread messages' : 'No conversations yet'}
              </Txt>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
};

const ThreadRow = React.memo<{ thread: Thread; onPress: () => void }>(({ thread, onPress }) => {
  const unread = thread.unread > 0;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={lstyles.row}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${thread.withUser.name}${unread ? `, ${thread.unread} unread` : ''}`}
    >
      <Avatar uri={thread.withUser.avatar} size={54} name={thread.withUser.name} />
      <View style={[lstyles.rowBody, { borderBottomColor: C.border }]}>
        <View style={lstyles.rowTop}>
          <Txt variant="label" color={C.text} numberOfLines={1} style={{ flex: 1 }}>
            {thread.withUser.name}
          </Txt>
          <Txt variant="caption" color={C.textTertiary}>
            {timeAgo(thread.updatedAt)}
          </Txt>
        </View>
        <View style={lstyles.rowBottom}>
          <Txt
            variant="bodySm"
            color={unread ? C.text : C.textSecondary}
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {thread.lastMessage}
          </Txt>
          {unread && (
            <View style={[lstyles.badge, { backgroundColor: C.brand }]}>
              <Text style={lstyles.badgeTxt}>{thread.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ---------------------------------------------------------------------------
// MessageThread — light v.2 chat thread ("Messages - Detail View" 125:11582).
// ---------------------------------------------------------------------------
export const MessageThread = ({ navigation, route }: any) => {
  const s = useStore();
  const insets = useSafeAreaInsets();
  const fontsReady = usePoppinsRegular();
  const threadId: string = route?.params?.threadId ?? 's_threads_default';
  const thread = s.threads.find((t) => t.id === threadId);
  const messages = s.messagesFor(threadId);
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  const myAvatar = s.user?.avatar ?? 'https://i.pravatar.cc/150?img=12';
  const theirAvatar = thread?.withUser.avatar;
  const title = thread?.withUser.name ?? 'Chat';
  const otherUserId = thread?.withUser.id;

  // Live-ish chat: poll this thread's messages on open, on focus, and every 5s.
  useEffect(() => {
    void s.refreshMessages(threadId);
    const unsub = navigation.addListener('focus', () => { void s.refreshMessages(threadId); });
    const id = setInterval(() => { void s.refreshMessages(threadId); }, 5000);
    return () => { unsub(); clearInterval(id); };
  }, [threadId, navigation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inverted FlatList renders newest-first (pinned to the bottom), so it never
  // needs the manual scrollToEnd hack. Reverse a copy for that orientation.
  const reversed = useMemo(() => [...messages].reverse(), [messages]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Message>) => {
      // In the reversed list the chronologically-later message is the previous
      // index, so a run's "tail" (the bubble that carries the avatar) is the
      // newest item or one whose later neighbour has a different sender.
      const tail = index === 0 || reversed[index - 1].fromMe !== item.fromMe;
      // Chronologically-previous message is the NEXT index in the reversed
      // list: 4px inside a same-sender run, 24px when the sender changes.
      const last = index === reversed.length - 1;
      const gapAbove = last ? 0 : (reversed[index + 1].fromMe === item.fromMe ? 4 : 24);
      return (
        <Bubble
          message={item}
          showAvatar={tail}
          gapAbove={gapAbove}
          avatarUri={item.fromMe ? myAvatar : theirAvatar}
        />
      );
    },
    [reversed, myAvatar, theirAvatar]
  );

  const canSend = text.trim().length > 0;

  const send = () => {
    const t = text.trim();
    if (!t) return;
    s.sendMessage(threadId, t);
    setText('');
  };

  const onReport = () => {
    setMenuOpen(false);
    if (otherUserId) s.reportUser(otherUserId);
    setReportDone(true);
  };

  const onConfirmBlock = () => {
    setConfirmBlock(false);
    if (otherUserId) s.blockUser(otherUserId);
    navigation.goBack();
  };

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: L.bg }} />; // flash-guard

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: L.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />
      <View style={{ flex: 1, backgroundColor: L.bg, paddingTop: insets.top }}>
        {/* Topbar: back arrow, 40px avatar + name (left-aligned), ellipsis */}
        <View style={tstyles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={L.text} />
          </TouchableOpacity>
          <View style={{ marginLeft: 24 }}>
            <Avatar uri={theirAvatar} size={40} name={title} />
          </View>
          <Text style={tstyles.headerName} numberOfLines={1}>{title}</Text>
          <TouchableOpacity
            hitSlop={10}
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`More options for ${title}`}
            accessibilityState={{ expanded: menuOpen }}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color={L.text} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={reversed}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 24, paddingHorizontal: 24 }}
          keyboardShouldPersistTaps="handled"
        />

        {/* Report / Block action sheet (overflow menu) */}
        <Modal
          visible={menuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={tstyles.sheetScrim}
            onPress={() => setMenuOpen(false)}
          >
            <View style={[tstyles.sheet, { paddingBottom: insets.bottom + 8 }]}>
              <TouchableOpacity
                style={tstyles.sheetRow}
                onPress={onReport}
                accessibilityRole="button"
                accessibilityLabel={`Report ${title}`}
              >
                <Ionicons name="flag-outline" size={22} color={L.text} />
                <Text style={tstyles.sheetTxt}>Report user</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={tstyles.sheetRow}
                onPress={() => { setMenuOpen(false); setConfirmBlock(true); }}
                accessibilityRole="button"
                accessibilityLabel={`Block ${title}`}
              >
                <Ionicons name="ban-outline" size={22} color={L.brand} />
                <Text style={[tstyles.sheetTxt, { color: L.brand }]}>Block user</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[tstyles.sheetRow, tstyles.sheetCancel]}
                onPress={() => setMenuOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[tstyles.sheetTxt, { color: L.placeholder }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <ConfirmModal
          visible={confirmBlock}
          title={`Block ${title}?`}
          message={`You won't receive messages from ${title}, and this conversation will be hidden. You can unblock them later.`}
          confirmLabel="Block"
          cancelLabel="Keep conversation"
          destructive
          onConfirm={onConfirmBlock}
          onCancel={() => setConfirmBlock(false)}
        />

        <InfoModal
          visible={reportDone}
          title="Report received"
          message={`Thanks for letting us know. Our Trust & Safety team will review your report about ${title}.`}
          buttonLabel="Done"
          onClose={() => setReportDone(false)}
        />

        {/* Composer bar: white pill input + emoji glyph + black send plane */}
        <View style={[tstyles.inputBar, { paddingBottom: insets.bottom + 16 }]}>
          <View style={tstyles.inputPill}>
            <TextInput
              style={tstyles.input}
              value={text}
              onChangeText={setText}
              placeholder="Type something…"
              placeholderTextColor={L.placeholder}
              multiline
              onSubmitEditing={send}
            />
            <Ionicons name="happy-outline" size={18} color={L.text} />
          </View>
          <TouchableOpacity
            onPress={send}
            hitSlop={8}
            style={tstyles.sendBtn}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !canSend }}
          >
            {/* Frame's plane vector is 16x13.95; Ionicons' send glyph fills
                ~93% of its box, so size 17 renders it 15.9x13.8. */}
            <Ionicons name="send" size={17} color={L.text} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const Bubble = React.memo<{
  message: Message;
  showAvatar: boolean;
  gapAbove: number;
  avatarUri?: string;
}>(({ message, showAvatar, gapAbove, avatarUri }) => {
  const mine = message.fromMe;
  // 24px avatar slot on the outer side; kept (empty) on non-tail rows so every
  // bubble in a run lines up on the same column, exactly like the frame.
  const avatarSlot = (
    <View style={{ width: 24 }}>
      {showAvatar && <Avatar uri={avatarUri} size={24} />}
    </View>
  );
  return (
    <View
      style={[
        tstyles.bubbleRow,
        { marginTop: gapAbove, justifyContent: mine ? 'flex-end' : 'flex-start' },
      ]}
    >
      {!mine && <View style={{ marginRight: 8 }}>{avatarSlot}</View>}
      <View
        style={[
          tstyles.bubble,
          mine
            ? { backgroundColor: L.bubbleOut, borderBottomRightRadius: 0 }
            : { backgroundColor: L.bubbleIn, borderBottomLeftRadius: 0 },
        ]}
      >
        <Text style={tstyles.bubbleTxt}>{message.text}</Text>
      </View>
      {mine && <View style={{ marginLeft: 8 }}>{avatarSlot}</View>}
    </View>
  );
});

const lstyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.md,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: tokens.radius.pill,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: tokens.spacing.lg,
  },
  rowBody: {
    flex: 1,
    marginLeft: 12,
    paddingVertical: 14,
    paddingRight: tokens.spacing.lg,
    borderBottomWidth: 1, // 1px light-gray separator, matching the detail view's line
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  rowBottom: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  badgeTxt: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});

const tstyles = StyleSheet.create({
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: L.bg,
    borderBottomWidth: 1,
    borderBottomColor: L.divider,
  },
  headerName: {
    flex: 1,
    color: L.text,
    fontFamily: P_MEDIUM,
    fontSize: 18,
    lineHeight: 27,
    marginLeft: 14,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 9.5,
    borderRadius: 8,
  },
  bubbleTxt: {
    color: L.text,
    fontFamily: P_REGULAR,
    fontSize: 14,
    lineHeight: 21,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: L.composerBg,
    paddingHorizontal: 16,
    paddingTop: 16,
    // Composer bg drop shadow, read off node 125:11587: X0 Y-8, blur 16,
    // spread 0, #000000 at 25%.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 16,
  },
  inputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: L.pillBg,
    borderRadius: 24,
    minHeight: 48,
    paddingLeft: 16,
    paddingRight: 20,
  },
  input: {
    flex: 1,
    color: L.text,
    fontFamily: P_REGULAR,
    fontSize: 16,
    lineHeight: 24,
    paddingVertical: 12,
    marginRight: 8,
    maxHeight: 100,
  },
  sendBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    marginBottom: 12, // centers the 24px plane on the 48px pill row
  },
  sheetScrim: {
    flex: 1,
    backgroundColor: L.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: L.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: L.divider,
  },
  sheetCancel: {
    justifyContent: 'center',
    borderBottomWidth: 0,
  },
  sheetTxt: {
    color: L.text,
    fontFamily: P_REGULAR,
    fontSize: 17,
  },
});
