import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { Message } from '../types';

// Compact chat thread, backed entirely by the store's messaging slice
// (messagesFor / sendMessage / retrySendMessage / refreshMessages). Designed to
// live inside an overlay sheet on the pal's map screens so chatting never leaves
// the map. Polls every 5s while mounted (which also clears server-side unread).
// Deliberately NOT a refactor of the MessageThread screen — that one keeps
// working as-is; this is an additive, self-contained view.

const P400 = 'Poppins_400Regular';
const P500 = 'Poppins_500Medium';

export function ChatThreadView({
  threadId,
  dark = true,
  withName,
}: {
  threadId: string;
  dark?: boolean;
  withName?: string;
}) {
  const s = useStore();
  const [text, setText] = useState('');
  const messages = s.messagesFor(threadId);

  // Poll while open; refresh immediately on mount.
  useEffect(() => {
    void s.refreshMessages(threadId);
    const id = setInterval(() => { void s.refreshMessages(threadId); }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const send = useCallback(() => {
    const t = text.trim();
    if (!t) return;
    s.sendMessage(threadId, t);
    setText('');
  }, [text, threadId, s]);

  const c = dark
    ? { bg: '#1C212C', inBubble: '#2E3442', outBubble: '#D40000', inText: '#FFFFFF', outText: '#FFFFFF', meta: 'rgba(255,255,255,0.5)', composerBg: '#2E3442', composerText: '#FFFFFF', placeholder: 'rgba(255,255,255,0.4)', empty: 'rgba(255,255,255,0.5)' }
    : { bg: '#FFFFFF', inBubble: '#F0F0F0', outBubble: '#D40000', inText: '#0D0A0A', outText: '#FFFFFF', meta: 'rgba(13,10,10,0.45)', composerBg: '#F0F0F0', composerText: '#0D0A0A', placeholder: 'rgba(13,10,10,0.4)', empty: 'rgba(13,10,10,0.45)' };

  // Inverted list wants newest first.
  const data = [...messages].reverse();

  const renderItem = ({ item }: { item: Message }) => (
    <View style={[st.row, { justifyContent: item.fromMe ? 'flex-end' : 'flex-start' }]}>
      <TouchableOpacity
        activeOpacity={item.failed ? 0.7 : 1}
        onPress={item.failed ? () => s.retrySendMessage(item.id) : undefined}
        style={[st.bubble, { backgroundColor: item.fromMe ? c.outBubble : c.inBubble }, item.failed && { opacity: 0.6 }]}
      >
        <Text style={[st.bubbleText, { color: item.fromMe ? c.outText : c.inText }]}>{item.text}</Text>
        {item.failed ? (
          <Text style={[st.failed, { color: item.fromMe ? c.outText : c.inText }]}>Tap to retry</Text>
        ) : null}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[st.wrap, { backgroundColor: c.bg }]}>
      {messages.length === 0 ? (
        <View style={st.empty}>
          <Ionicons name="chatbubble-ellipses-outline" size={34} color={c.empty} />
          <Text style={[st.emptyText, { color: c.empty }]}>
            {withName ? `Say hello to ${withName}.` : 'No messages yet.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10 }}
        />
      )}
      <View style={[st.composer, { backgroundColor: c.bg }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          placeholderTextColor={c.placeholder}
          style={[st.input, { backgroundColor: c.composerBg, color: c.composerText }]}
          multiline
          accessibilityLabel="Message input"
          onSubmitEditing={send}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          onPress={send}
          disabled={!text.trim()}
          style={[st.sendBtn, { opacity: text.trim() ? 1 : 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Ionicons name="send" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 20 },
  emptyText: { fontSize: 14, fontFamily: P400 },
  row: { flexDirection: 'row', marginVertical: 3 },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleText: { fontSize: 15, lineHeight: 20, fontFamily: P400 },
  failed: { fontSize: 11, fontFamily: P500, marginTop: 3, opacity: 0.85 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  input: { flex: 1, minHeight: 42, maxHeight: 110, borderRadius: 21, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 15, fontFamily: P400 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#D40000', alignItems: 'center', justifyContent: 'center' },
});

export default ChatThreadView;
