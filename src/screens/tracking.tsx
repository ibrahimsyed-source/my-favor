import React, { useState } from 'react';
import {
  View, Image, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Txt, Button, Field, Avatar, StarRating } from '../components';
import { useTheme, tokens, palette } from '../theme';
import { useStore } from '../store';

// Dark map-sheet palette (this module renders on a dark map regardless of theme).
const MAP_BG = palette.darkBg; // #131820
const SHEET_BG = palette.darkSurface; // #1C2331
const SHEET_BORDER = palette.darkBorder; // #2C3647
const SUBTEXT = '#9AA3B2';
const WHITE = palette.white;
const RED = palette.brand;

// ---------------------------------------------------------------------------
// 1) FavorTracking — "Favor Booked" dark map bottom sheet.
// ---------------------------------------------------------------------------
export const FavorTracking = ({ navigation }: any) => {
  const s = useStore();

  const onComplete = () => navigation.navigate('OrderComplete');
  const onCancel = () => {
    s.cancelFavor();
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: MAP_BG }} edges={['top', 'bottom']}>
      {/* Top nav banner over the (dark) map */}
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.menuBtn} activeOpacity={0.8}>
          <Ionicons name="menu" size={22} color={WHITE} />
        </TouchableOpacity>
        <View style={styles.switchPill}>
          <Ionicons name="swap-horizontal" size={16} color="#141414" />
          <Txt variant="bodySm" color="#141414" style={{ marginLeft: 6 }}>
            Switch to request a favor
          </Txt>
        </View>
      </View>

      {/* small peek of the dark map */}
      <View style={{ height: 52 }} />

      {/* Dark bottom sheet */}
      <View style={styles.sheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xl }}
        >
          <Ionicons
            name="chevron-down"
            size={22}
            color={SUBTEXT}
            style={{ alignSelf: 'center', marginBottom: 6 }}
          />
          <Txt variant="h3" center color={WHITE}>Favor Booked</Txt>

          <View style={styles.divider} />

          {/* Pal / favor profile row */}
          <View style={styles.profileRow}>
            <View>
              <Avatar uri="https://i.pravatar.cc/150?img=33" size={56} />
              <View style={styles.badge}>
                <Ionicons name="add" size={12} color={WHITE} />
              </View>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Txt variant="label" color={WHITE}>Aditya Patil</Txt>
              <Txt variant="caption" color={SUBTEXT} numberOfLines={2} style={{ marginTop: 2 }}>
                Pick up package from Amazon Hub Lockers
              </Txt>
              <Txt variant="caption" color={SUBTEXT} style={{ marginTop: 2 }}>
                16 February 2023, 1:00PM
              </Txt>
              <TouchableOpacity activeOpacity={0.7}>
                <Txt variant="caption" color={RED} style={{ marginTop: 4 }}>View More</Txt>
              </TouchableOpacity>
            </View>
          </View>

          {/* Arrival window */}
          <Txt variant="h2" center color={WHITE} style={{ marginTop: tokens.spacing.lg }}>
            11:50AM - 12:10PM
          </Txt>

          <TouchableOpacity style={styles.cancelPill} activeOpacity={0.8} onPress={onCancel}>
            <Txt variant="button" color={WHITE}>CANCEL FAVOR</Txt>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Favor / payout row */}
          <View style={styles.favorRow}>
            <View style={styles.favorIcon}>
              <Ionicons name="cube" size={20} color={RED} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Txt variant="label" color={WHITE}>Tiny Favor</Txt>
              <Txt variant="caption" color={SUBTEXT} style={{ marginTop: 2 }}>Payout</Txt>
            </View>
            <Txt variant="label" color={WHITE}>$10.00</Txt>
          </View>

          {/* Description */}
          <View style={styles.metaLabel}>
            <Ionicons name="document-text-outline" size={16} color={RED} />
            <Txt variant="caption" color={SUBTEXT} style={{ marginLeft: 8 }}>Description</Txt>
          </View>
          <Txt variant="bodySm" color={WHITE} style={{ marginTop: 4, marginLeft: 24 }}>
            Need to walk my dog around 4pm
          </Txt>

          {/* Address */}
          <View style={[styles.metaLabel, { marginTop: tokens.spacing.base }]}>
            <Ionicons name="location-outline" size={16} color={RED} />
            <Txt variant="caption" color={SUBTEXT} style={{ marginLeft: 8 }}>Address</Txt>
          </View>
          <Txt variant="bodySm" color={WHITE} style={{ marginTop: 4, marginLeft: 24 }}>
            2099 Woodvine Rd, Lorman
          </Txt>

          {/* Actions */}
          <View style={styles.actionRow}>
            <Button title="CALL CLIENT" variant="primary" style={{ flex: 1 }} onPress={() => {}} />
            <Button title="I'M HERE" variant="white" style={{ flex: 1 }} onPress={onComplete} />
          </View>
        </ScrollView>

        {/* Bottom tab bar (visual, matches reference) */}
        <View style={styles.tabBar}>
          <TouchableOpacity style={styles.tabItem} activeOpacity={0.7}>
            <Ionicons name="share-social-outline" size={22} color={SUBTEXT} />
            <Txt variant="tab" color={SUBTEXT} style={{ marginTop: 4 }}>SHARE</Txt>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tabItem}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Tabs')}
          >
            <View style={styles.homeBtn}>
              <Ionicons name="home" size={22} color={WHITE} />
            </View>
            <Txt variant="tab" color={RED} style={{ marginTop: 4 }}>HOME</Txt>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} activeOpacity={0.7}>
            <Ionicons name="time-outline" size={22} color={SUBTEXT} />
            <Txt variant="tab" color={SUBTEXT} style={{ marginTop: 4 }}>ACTIVITY</Txt>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// 2) OrderComplete — Thank you + rating + tip + feedback.
// ---------------------------------------------------------------------------
const TIPS = [
  { key: '2', label: '$2.00', value: 2 },
  { key: '4', label: '$4.00', value: 4 },
  { key: '6', label: '$6.00', value: 6 },
  { key: 'other', label: 'Other', value: undefined },
] as const;

export const OrderComplete = ({ navigation }: any) => {
  const { theme } = useTheme();
  const s = useStore();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [tipKey, setTipKey] = useState<string | null>(null);
  const [tip, setTip] = useState<number | undefined>(undefined);

  const canSubmit = rating > 0;
  const submit = () => {
    s.rateFavor(rating, feedback, tip);
    navigation.navigate('Tabs');
  };

  const hr = <View style={[styles.hr, { backgroundColor: theme.divider }]} />;

  return (
    <Screen scroll>
      <Txt variant="display" center>Thank You!</Txt>
      <Txt variant="h4" center style={{ marginTop: tokens.spacing.base }}>
        Favor Pal has completed your favor.
      </Txt>

      <Image
        source={require('../../assets/img/tracking/celebration.png')}
        style={{ width: '100%', height: 300, resizeMode: 'contain', marginTop: tokens.spacing.lg }}
      />

      {hr}

      {/* Rating */}
      <View style={styles.ratingRow}>
        <Txt variant="h4">Rating</Txt>
        <StarRating value={rating} size={28} onChange={setRating} />
      </View>

      {hr}

      {/* Tip */}
      <Txt variant="h4">Great Pal? Consider giving a tip!</Txt>
      <View style={styles.tipRow}>
        {TIPS.map((t) => {
          const active = tipKey === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              activeOpacity={0.8}
              onPress={() => { setTipKey(t.key); setTip(t.value); }}
              style={[styles.tipChip, { backgroundColor: active ? theme.cta : theme.inputBg }]}
            >
              <Txt variant="body" color={active ? WHITE : theme.text}>{t.label}</Txt>
            </TouchableOpacity>
          );
        })}
      </View>

      {hr}

      {/* Feedback */}
      <Txt variant="h4" style={{ marginBottom: tokens.spacing.md }}>Feedback</Txt>
      <Field
        value={feedback}
        onChangeText={setFeedback}
        placeholder="Please tell us about your experience"
        multiline
        maxLength={700}
      />
      <Txt variant="caption" color={theme.textSecondary} style={{ textAlign: 'right', marginTop: -6 }}>
        700 characters max.
      </Txt>

      <Button
        title="SUBMIT FEEDBACK"
        variant="primary"
        disabled={!canSubmit}
        onPress={submit}
        style={[
          { marginTop: tokens.spacing.lg },
          canSubmit ? null : { backgroundColor: '#C4C4C4', opacity: 1 },
        ] as any}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  // FavorTracking
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.base,
    paddingTop: tokens.spacing.sm,
    gap: tokens.spacing.md,
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    backgroundColor: SHEET_BG,
    borderWidth: 1,
    borderColor: SHEET_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: tokens.radius.pill,
    backgroundColor: WHITE,
    paddingHorizontal: tokens.spacing.base,
  },
  sheet: {
    flex: 1,
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: SHEET_BORDER,
    marginVertical: tokens.spacing.base,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: SHEET_BG,
  },
  cancelPill: {
    alignSelf: 'center',
    marginTop: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  favorRow: { flexDirection: 'row', alignItems: 'center' },
  favorIcon: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaLabel: { flexDirection: 'row', alignItems: 'center', marginTop: tokens.spacing.base },
  actionRow: { flexDirection: 'row', gap: tokens.spacing.md, marginTop: tokens.spacing.xl },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SHEET_BORDER,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.xs,
  },
  tabItem: { flex: 1, alignItems: 'center' },
  homeBtn: {
    width: 48,
    height: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
  },
  // OrderComplete
  hr: { height: StyleSheet.hairlineWidth, marginVertical: tokens.spacing.lg },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.base },
  tipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md, marginTop: tokens.spacing.base },
  tipChip: {
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing.md,
    borderRadius: tokens.radius.pill,
  },
});
