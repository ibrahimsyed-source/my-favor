import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Keyboard, Platform, Dimensions, KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ChatThreadView } from './ChatThreadView';

// A bottom-sheet chat overlay for the pal's map screens: chat with the Favor
// Member without leaving the map (feature 8). Absolutely positioned above the
// map; taps outside the sheet fall through to the map. On iOS we lift the sheet
// by the keyboard height (the map screens have no KeyboardAvoidingView, and a
// bottom-anchored absolute sheet won't ride up on its own); Android's
// adjustResize handles it for free.

const SHEET = '#1C212C';
const HEADER = '#252A38';
const TEXT = '#FFFFFF';
const SUBTLE = 'rgba(255,255,255,0.6)';
const P500 = 'Poppins_500Medium';
const P600 = 'Poppins_600SemiBold';

export function PalChatSheet({
  visible,
  threadId,
  withName,
  onClose,
}: {
  visible: boolean;
  threadId: string | null;
  withName?: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get('window').height;
  const sheetH = Math.min(screenH * 0.62, 520);
  const slide = useRef(new Animated.Value(sheetH)).current; // off-screen (down)
  const kb = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(slide, {
      toValue: visible ? 0 : sheetH,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, sheetH, slide]);

  // iOS: lift the sheet by the keyboard height. Android resizes the window.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (e: KeyboardEvent) => {
      Animated.timing(kb, { toValue: e.endCoordinates.height, duration: e.duration || 220, useNativeDriver: true }).start();
    });
    const hide = Keyboard.addListener('keyboardWillHide', (e: KeyboardEvent) => {
      Animated.timing(kb, { toValue: 0, duration: e.duration || 220, useNativeDriver: true }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [kb]);

  if (!mounted) return null;

  const translateY = Animated.add(slide, Animated.multiply(kb, -1));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Scrim — tap to dismiss. Only present while open so the map stays
          interactive when the sheet is closed. */}
      {visible ? (
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => { Keyboard.dismiss(); onClose(); }}
          accessibilityRole="button"
          accessibilityLabel="Close chat"
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
        </TouchableOpacity>
      ) : null}

      <Animated.View
        style={[
          st.sheet,
          { height: sheetH + insets.bottom, paddingBottom: insets.bottom, transform: [{ translateY }] },
        ]}
      >
        <View style={st.header}>
          <View style={{ flex: 1 }}>
            <Text style={st.title} numberOfLines={1}>{withName ? `Chat with ${withName}` : 'Chat'}</Text>
            <Text style={st.sub}>Favor Member</Text>
          </View>
          <TouchableOpacity onPress={() => { Keyboard.dismiss(); onClose(); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close chat">
            <Ionicons name="chevron-down" size={26} color={TEXT} />
          </TouchableOpacity>
        </View>
        {threadId ? (
          <ChatThreadView threadId={threadId} dark withName={withName} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: SUBTLE, fontFamily: P500 }}>Opening chat…</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SHEET,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    // float above the map + its own sheet
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: HEADER,
  },
  title: { color: TEXT, fontSize: 16, fontFamily: P600 },
  sub: { color: SUBTLE, fontSize: 12, fontFamily: P500, marginTop: 1 },
});

export default PalChatSheet;
