import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Modal, ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Txt, Avatar, ConfirmModal, InfoModal } from '../components';
import { useStore } from '../store';
import { useTheme, tokens } from '../theme';
import { Message, Thread } from '../types';

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
// Messages — tab screen. Clean iOS-style list of conversation threads.
// ---------------------------------------------------------------------------
export const Messages = ({ navigation }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  const [onlyUnread, setOnlyUnread] = useState(false);

  // Keep the conversation list (and unread counts) fresh on focus.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { void s.refreshThreads(); });
    return unsub;
  }, [navigation]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <Screen padded={false}>
      <View style={{ flex: 1 }}>
        {/* Header: large title + Unread filter chip */}
        <View style={lstyles.header}>
          <Txt variant="h1">Messages</Txt>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setOnlyUnread((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Filter unread conversations"
            accessibilityState={{ selected: onlyUnread }}
            style={[
              lstyles.chip,
              { backgroundColor: onlyUnread ? theme.cta : theme.secondaryBtn },
            ]}
          >
            <Txt
              variant="bodySm"
              color={onlyUnread ? '#FFFFFF' : theme.text}
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
          ListEmptyComponent={
            <View style={{ paddingTop: 80, alignItems: 'center' }}>
              <Ionicons name="chatbubbles-outline" size={40} color={theme.textTertiary} />
              <Txt variant="body" color={theme.textSecondary} style={{ marginTop: 12 }}>
                {onlyUnread ? 'No unread messages' : 'No conversations yet'}
              </Txt>
            </View>
          }
        />
      </View>
    </Screen>
  );
};

const ThreadRow = React.memo<{ thread: Thread; onPress: () => void }>(({ thread, onPress }) => {
  const { theme } = useTheme();
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
      <View style={[lstyles.rowBody, { borderBottomColor: theme.divider }]}>
        <View style={lstyles.rowTop}>
          <Txt variant="label" numberOfLines={1} style={{ flex: 1 }}>
            {thread.withUser.name}
          </Txt>
          <Txt variant="caption" color={theme.textTertiary}>
            {timeAgo(thread.updatedAt)}
          </Txt>
        </View>
        <View style={lstyles.rowBottom}>
          <Txt
            variant="bodySm"
            color={unread ? theme.text : theme.textSecondary}
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {thread.lastMessage}
          </Txt>
          {unread && (
            <View style={[lstyles.badge, { backgroundColor: theme.primary }]}>
              <Text style={lstyles.badgeTxt}>{thread.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ---------------------------------------------------------------------------
// MessageThread — dark chat thread (matches message-thread.png).
// ---------------------------------------------------------------------------
const C = {
  bg: '#0D0A0A',
  bar: '#171922',
  pill: '#202333',
  their: '#1F1D2B',
  mine: '#32364B',
  placeholder: '#838383',
  text: '#FFFFFF',
};

export const MessageThread = ({ navigation, route }: any) => {
  const s = useStore();
  const insets = useSafeAreaInsets();
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
      return (
        <Bubble
          message={item}
          showAvatar={tail}
          avatarUri={item.fromMe ? myAvatar : theirAvatar}
        />
      );
    },
    [reversed, myAvatar, theirAvatar]
  );

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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
        {/* Custom dark header: back, avatar + name (left-aligned), more */}
        <View style={tstyles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={26} color={C.text} />
          </TouchableOpacity>
          <Avatar uri={theirAvatar} size={40} name={title} />
          <Text style={tstyles.headerName} numberOfLines={1}>{title}</Text>
          <TouchableOpacity
            hitSlop={10}
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`More options for ${title}`}
            accessibilityState={{ expanded: menuOpen }}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color={C.text} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={reversed}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: 16 }}
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
                <Ionicons name="flag-outline" size={22} color={C.text} />
                <Text style={tstyles.sheetTxt}>Report user</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={tstyles.sheetRow}
                onPress={() => { setMenuOpen(false); setConfirmBlock(true); }}
                accessibilityRole="button"
                accessibilityLabel={`Block ${title}`}
              >
                <Ionicons name="ban-outline" size={22} color="#E5484D" />
                <Text style={[tstyles.sheetTxt, { color: '#E5484D' }]}>Block user</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[tstyles.sheetRow, tstyles.sheetCancel]}
                onPress={() => setMenuOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[tstyles.sheetTxt, { color: C.placeholder }]}>Cancel</Text>
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

        {/* Input bar */}
        <View style={[tstyles.inputBar, { paddingBottom: insets.bottom + 14 }]}>
          <View style={tstyles.inputPill}>
            <TextInput
              style={tstyles.input}
              value={text}
              onChangeText={setText}
              placeholder="Type something…"
              placeholderTextColor={C.placeholder}
              multiline
              onSubmitEditing={send}
            />
            <Ionicons name="happy-outline" size={24} color={C.placeholder} />
          </View>
          <TouchableOpacity onPress={send} hitSlop={8} style={tstyles.sendBtn}>
            <Ionicons name="send" size={22} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const Bubble = React.memo<{ message: Message; showAvatar: boolean; avatarUri?: string }>(({
  message,
  showAvatar,
  avatarUri,
}) => {
  const mine = message.fromMe;
  const avatarSlot = showAvatar ? (
    <Avatar uri={avatarUri} size={28} />
  ) : (
    <View style={{ width: 28 }} />
  );
  return (
    <View
      style={[
        tstyles.bubbleRow,
        { justifyContent: mine ? 'flex-end' : 'flex-start' },
      ]}
    >
      {!mine && <View style={{ marginRight: 8 }}>{avatarSlot}</View>}
      <View
        style={[
          tstyles.bubble,
          mine
            ? { backgroundColor: C.mine, borderBottomRightRadius: 0 }
            : { backgroundColor: C.their, borderBottomLeftRadius: 0 },
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
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.bar,
  },
  headerName: {
    flex: 1,
    color: C.text,
    fontFamily: tokens.typography.h4.fontFamily,
    fontSize: 18,
    marginLeft: 12,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 4,
  },
  bubble: {
    maxWidth: '76%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  bubbleTxt: {
    color: C.text,
    fontFamily: tokens.typography.body.fontFamily,
    fontSize: 16,
    lineHeight: 22,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bar,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  inputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.pill,
    borderRadius: 24,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    color: C.text,
    fontFamily: tokens.typography.body.fontFamily,
    fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    marginRight: 8,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sheetScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.bar,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.pill,
  },
  sheetCancel: {
    justifyContent: 'center',
    borderBottomWidth: 0,
  },
  sheetTxt: {
    color: C.text,
    fontFamily: tokens.typography.body.fontFamily,
    fontSize: 17,
  },
});
