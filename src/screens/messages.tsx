import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Txt, Avatar } from '../components';
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

  const threads = onlyUnread ? s.threads.filter((t) => t.unread > 0) : s.threads;

  return (
    <Screen padded={false}>
      <View style={{ flex: 1 }}>
        {/* Header: large title + Unread filter chip */}
        <View style={lstyles.header}>
          <Txt variant="h1">Messages</Txt>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setOnlyUnread((v) => !v)}
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

        <ScrollView contentContainerStyle={{ paddingBottom: tokens.spacing.xl }}>
          {threads.map((t) => (
            <ThreadRow
              key={t.id}
              thread={t}
              onPress={() => navigation.navigate('MessageThread', { threadId: t.id })}
            />
          ))}

          {threads.length === 0 && (
            <View style={{ paddingTop: 80, alignItems: 'center' }}>
              <Ionicons name="chatbubbles-outline" size={40} color={theme.textTertiary} />
              <Txt variant="body" color={theme.textSecondary} style={{ marginTop: 12 }}>
                No unread messages
              </Txt>
            </View>
          )}
        </ScrollView>
      </View>
    </Screen>
  );
};

const ThreadRow: React.FC<{ thread: Thread; onPress: () => void }> = ({ thread, onPress }) => {
  const { theme } = useTheme();
  const unread = thread.unread > 0;
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={lstyles.row}>
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
};

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
  const scrollRef = useRef<ScrollView>(null);

  const myAvatar = s.user?.avatar ?? 'https://i.pravatar.cc/150?img=12';
  const theirAvatar = thread?.withUser.avatar;
  const title = thread?.withUser.name ?? 'Chat';

  const send = () => {
    const t = text.trim();
    if (!t) return;
    s.sendMessage(threadId, t);
    setText('');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
        {/* Custom dark header: back, avatar + name (left-aligned), more */}
        <View style={tstyles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={26} color={C.text} />
          </TouchableOpacity>
          <Avatar uri={theirAvatar} size={40} name={title} />
          <Text style={tstyles.headerName} numberOfLines={1}>{title}</Text>
          <TouchableOpacity hitSlop={10}>
            <Ionicons name="ellipsis-horizontal" size={24} color={C.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: 16 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m, i) => {
            const tail = i === messages.length - 1 || messages[i + 1].fromMe !== m.fromMe;
            return (
              <Bubble
                key={m.id}
                message={m}
                showAvatar={tail}
                avatarUri={m.fromMe ? myAvatar : theirAvatar}
              />
            );
          })}
        </ScrollView>

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

const Bubble: React.FC<{ message: Message; showAvatar: boolean; avatarUri?: string }> = ({
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
};

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
});
