import React, { useState } from 'react';
import {
  View, Image, ScrollView, TouchableOpacity, StyleSheet, Share,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Txt, Button, Avatar, StarRating, InfoModal, ConfirmModal, StaticMap,
} from '../components';
import { tokens, palette } from '../theme';
import { useStore } from '../store';
import {
  computeFees, computePayout, computeCancellation, FAVOR_TIERS, MEMBER_STATUS_STEPS,
} from '../types';

// Brand + on-accent constants reused across this screen.
const WHITE = palette.white;
const RED = palette.brand;

// ---------------------------------------------------------------------------
// Local DARK v.2 palette. These screens are intentionally dark (the shared
// useTheme() is light and used by the auth screens) — every colour below is
// applied explicitly here so nothing falls back to the light theme.
// ---------------------------------------------------------------------------
const DARK = {
  bg: '#0C0C0C', // content screen background
  map: '#0C0C0C', // dark map backdrop
  scrim: 'rgba(12,12,12,0.55)', // darkens the map peek
  sheet: '#171922', // dark navy bottom sheet
  card: '#1B222C', // feedback textarea / cards
  raised: '#1C2331', // raised fields / pills / chips
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.6)',
  textTertiary: 'rgba(255,255,255,0.4)',
  border: 'rgba(255,255,255,0.10)',
  ctaText: '#141414', // dark text on white primary buttons
  star: '#FFBD00',
} as const;

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
// "16 February 2024, 1:00PM" — falls back to the design literal when no favor.
const formatFavorDate = (ms?: number) => {
  if (!ms) return '16 February 2023, 1:00PM';
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}, ${h}:${m < 10 ? `0${m}` : m}${ampm}`;
};

// ---------------------------------------------------------------------------
// 1) FavorTracking — "Favor Booked" dark map bottom sheet (MEMBER side).
// Renders from the member's own activeFavor + the booked activePal; only falls
// back to the Figma literals when there is no live favor (prototype/demo).
// ---------------------------------------------------------------------------
export const FavorTracking = ({ navigation }: any) => {
  const s = useStore();
  const fav = s.activeFavor;
  const pal = s.activePal;
  const [callVisible, setCallVisible] = useState(false);
  const [cancelVisible, setCancelVisible] = useState(false);

  // Resolve display values from real state, with design-literal fallbacks.
  const palName = pal ? `${pal.firstName} ${pal.lastName}` : 'Aditya Patil';
  const palAvatar = pal?.avatar ?? 'https://i.pravatar.cc/150?img=33';
  const description = (fav?.description && fav.description.trim())
    || 'Pick up package from Amazon Hub Lockers';
  const dateLabel = formatFavorDate(fav?.scheduledFor ?? fav?.createdAt);
  const etaWindow = fav?.etaWindow ?? '11:50AM - 12:10PM';
  const address = fav?.location?.address ?? '2099 Woodvine Rd, Lorman';
  const tierLabel = fav && fav.tier in FAVOR_TIERS
    ? FAVOR_TIERS[fav.tier as keyof typeof FAVOR_TIERS].label
    : 'Tiny Favor';

  // Money: the MEMBER sees what THEY paid (computeFees), plus a transparency split.
  const base = fav?.price ?? 20;
  const fees = computeFees(base);
  const totalPaid = fav?.total ?? fees.total;
  const { payout } = computePayout(base);

  // Member-facing status timeline (Pal accepted -> ... -> Completed).
  const currentStep = MEMBER_STATUS_STEPS.findIndex((st) => st.status === fav?.status);
  const statusLabel = currentStep >= 0 ? MEMBER_STATUS_STEPS[currentStep].label : 'Finding your Pal…';
  const isCompleted = fav?.status === 'completed';

  // Cancelling a committed favor forfeits a fee and refunds the rest, per the
  // shared cancellation policy — surface that via ConfirmModal before doing
  // anything irreversible so the member isn't charged silently.
  const cancelInfo = fav ? computeCancellation(fav) : null;
  const cancelMessage = cancelInfo
    ? (cancelInfo.fee > 0
      ? `You'll be refunded $${cancelInfo.refund.toFixed(2)}. A $${cancelInfo.fee.toFixed(2)} cancellation fee applies because your Pal is already committed.`
      : `You'll be refunded $${cancelInfo.refund.toFixed(2)} in full.`)
    : 'Are you sure you want to cancel this favor?';

  const onCancel = () => setCancelVisible(true);
  // On confirm, unwind the whole checkout stack back to Home via popToTop()
  // instead of goBack() — the underlying SelectPayment draft was already
  // cleared by requestFavor(), so returning there shows a stale payment sheet.
  const confirmCancel = () => {
    setCancelVisible(false);
    s.cancelFavor();
    navigation.popToTop();
  };

  // SHARE doubles as share-trip (live status/ETA) + a referral growth loop.
  const onShare = () => {
    Share.share({
      message:
        `I just booked a ${tierLabel} on My Favor! My Pal ${palName} is arriving ${etaWindow}. `
        + `Join me and get $10 off your first favor: https://myfavor.app/r/${s.user?.id ?? 'invite'}`,
    }).catch(() => {});
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: DARK.bg }} edges={['top', 'bottom']}>
      {/* Live-tracking map backdrop. StaticMap renders the real Google Static
          Map when a key + coords are present and falls back to the styled
          MapPlaceholder grid otherwise; a dark scrim keeps the peek reading as
          a night/dark map to match the v.2 reference. */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 440, backgroundColor: DARK.map }} pointerEvents="none">
        <StaticMap lat={fav?.location?.lat} lng={fav?.location?.lng} height={440} zoom={14} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: DARK.scrim }]} />
      </View>
      {/* Top nav banner over the map */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.menuBtn, { backgroundColor: WHITE }, tokens.shadow.card]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('SideDrawer')}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Ionicons name="menu" size={22} color={DARK.ctaText} />
        </TouchableOpacity>
      </View>

      {/* small peek of the dark map */}
      <View style={{ height: 52 }} />

      {/* Dark navy bottom sheet */}
      <View style={[styles.sheet, { backgroundColor: DARK.sheet, borderTopWidth: StyleSheet.hairlineWidth, borderColor: DARK.border }, tokens.shadow.card]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xl }}
        >
          <View style={styles.handle} />
          <Txt variant="h3" center color={DARK.text}>Favor Booked</Txt>

          <View style={[styles.divider, { backgroundColor: DARK.border }]} />

          {/* Pal / favor profile row */}
          <View style={styles.profileRow}>
            <View>
              <Avatar uri={palAvatar} size={56} />
              <View style={[styles.badge, { borderColor: DARK.sheet }]} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Txt variant="label" color={DARK.text}>{palName}</Txt>
              {pal ? (
                <View style={styles.ratingRow} accessibilityLabel={`Pal rated ${pal.rating.toFixed(1)} out of 5`}>
                  <StarRating value={pal.rating} size={12} />
                  <Txt variant="caption" color={DARK.textSecondary} style={{ marginLeft: 6 }}>
                    {pal.rating.toFixed(1)}
                  </Txt>
                </View>
              ) : null}
              <Txt variant="caption" color={DARK.textSecondary} numberOfLines={2} style={{ marginTop: 2 }}>
                {description}
              </Txt>
              <Txt variant="caption" color={DARK.textSecondary} style={{ marginTop: 2 }}>
                {dateLabel}
              </Txt>
              {fav ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('FavorHistoryDetail', { favorId: fav.id })}
                  accessibilityRole="button"
                  accessibilityLabel="View favor details"
                >
                  <Txt variant="caption" color={DARK.text} style={{ marginTop: 4 }}>View More</Txt>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Arrival window */}
          <Txt variant="h2" center color={DARK.text} style={{ marginTop: tokens.spacing.lg }}>
            {etaWindow}
          </Txt>

          {/* Member status timeline driven by activeFavor.status */}
          <View
            style={styles.timeline}
            accessibilityRole="progressbar"
            accessibilityLabel={`Favor status: ${statusLabel}`}
          >
            {MEMBER_STATUS_STEPS.map((step, i) => {
              const done = i <= currentStep;
              const isCurrent = i === currentStep;
              return (
                <React.Fragment key={step.status}>
                  {i > 0 && (
                    <View style={[styles.timelineBar, { backgroundColor: i <= currentStep ? RED : DARK.border }]} />
                  )}
                  <View
                    style={[
                      styles.timelineDot,
                      {
                        backgroundColor: done ? RED : DARK.raised,
                        borderColor: isCurrent ? DARK.text : done ? RED : DARK.border,
                      },
                    ]}
                  />
                </React.Fragment>
              );
            })}
          </View>
          <Txt variant="caption" center color={DARK.textSecondary} style={{ marginTop: 6 }}>
            {statusLabel}
          </Txt>

          {/* Cancel is only valid while the favor is still in progress — once it
              is completed the action flips to "RATE YOUR PAL", so hide the pill
              to avoid pushing a phantom 'cancelled' duplicate into History. */}
          {!isCompleted ? (
            <TouchableOpacity
              style={[styles.cancelPill, { backgroundColor: DARK.raised, borderColor: DARK.border }]}
              activeOpacity={0.8}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel favor"
            >
              <Txt variant="button" color={DARK.text}>CANCEL FAVOR</Txt>
            </TouchableOpacity>
          ) : null}

          <View style={[styles.divider, { backgroundColor: DARK.border }]} />

          {/* Favor / total-paid row */}
          <View style={styles.favorRow}>
            <View style={[styles.favorIcon, { backgroundColor: WHITE }]}>
              <Ionicons name="cube" size={20} color={RED} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Txt variant="label" color={DARK.text}>{tierLabel}</Txt>
              <Txt variant="caption" color={DARK.textSecondary} style={{ marginTop: 2 }}>Total paid</Txt>
            </View>
            <Txt variant="label" color={DARK.text}>${totalPaid.toFixed(2)}</Txt>
          </View>
          {/* Transparency: what the member paid vs what the Pal actually receives */}
          <Txt variant="caption" color={DARK.textSecondary} style={{ marginTop: 6, marginLeft: 58 }}>
            Pal receives ${payout.toFixed(2)} · Service fee ${fees.serviceFee.toFixed(2)}
          </Txt>

          {/* Description */}
          <View style={styles.metaLabel}>
            <Ionicons name="document-text-outline" size={16} color={DARK.text} />
            <Txt variant="label" color={DARK.text} style={{ marginLeft: 8 }}>Description</Txt>
          </View>
          <Txt variant="bodySm" color={DARK.textSecondary} style={{ marginTop: 4, marginLeft: 24 }}>
            {description}
          </Txt>

          {/* Address */}
          <View style={[styles.metaLabel, { marginTop: tokens.spacing.base }]}>
            <Ionicons name="location-outline" size={16} color={DARK.text} />
            <Txt variant="label" color={DARK.text} style={{ marginLeft: 8 }}>Address</Txt>
          </View>
          <Txt variant="bodySm" color={DARK.textSecondary} style={{ marginTop: 4, marginLeft: 24 }}>
            {address}
          </Txt>

          {/* Actions — member-voiced. The member never self-completes; rating is
              gated behind a real pal-driven 'completed' status. Left = dark pill
              (call), right = white primary (v.2 filled button). */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.darkBtn, { backgroundColor: DARK.raised, borderColor: DARK.border }]}
              activeOpacity={0.85}
              onPress={() => setCallVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Call your pal"
            >
              <Txt variant="button" color={DARK.text}>CALL YOUR PAL</Txt>
            </TouchableOpacity>
            {isCompleted ? (
              <Button
                title="RATE YOUR PAL"
                variant="white"
                style={{ flex: 1 }}
                onPress={() => navigation.navigate('OrderComplete')}
              />
            ) : (
              <Button
                title="MESSAGE PAL"
                variant="white"
                style={{ flex: 1 }}
                onPress={async () => {
                  // Open the direct thread with this Pal when possible; fall
                  // back to the Messages list only if there's no pal/thread.
                  if (pal) {
                    const threadId = await s.openThreadWith(pal.id);
                    if (threadId) {
                      navigation.navigate('MessageThread', { threadId });
                      return;
                    }
                  }
                  navigation.navigate('Tabs', { screen: 'Messages' });
                }}
              />
            )}
          </View>
        </ScrollView>

        {/* Bottom tab bar (visual, matches reference) — now wired */}
        <View style={[styles.tabBar, { backgroundColor: DARK.bg, borderTopColor: DARK.border }]}>
          <TouchableOpacity
            style={styles.tabItem}
            activeOpacity={0.7}
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel="Share favor status and invite a friend"
          >
            <Ionicons name="share-social-outline" size={22} color={DARK.textSecondary} />
            <Txt variant="tab" color={DARK.textSecondary} style={{ marginTop: 4 }}>SHARE</Txt>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tabItem}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Tabs')}
            accessibilityRole="button"
            accessibilityLabel="Home"
          >
            <View style={styles.homeBtn}>
              <Ionicons name="home" size={22} color={WHITE} />
            </View>
            <Txt variant="tab" color={RED} style={{ marginTop: 4 }}>HOME</Txt>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tabItem}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Tabs', { screen: 'History' })}
            accessibilityRole="button"
            accessibilityLabel="Activity history"
          >
            <Ionicons name="time-outline" size={22} color={DARK.textSecondary} />
            <Txt variant="tab" color={DARK.textSecondary} style={{ marginTop: 4 }}>ACTIVITY</Txt>
          </TouchableOpacity>
        </View>
      </View>

      <InfoModal
        visible={callVisible}
        title="Connecting call"
        message={`We're connecting you with ${palName} through a private number to keep both phone numbers protected.`}
        buttonLabel="OK"
        onClose={() => setCallVisible(false)}
      />

      <ConfirmModal
        visible={cancelVisible}
        title="Cancel this favor?"
        message={cancelMessage}
        confirmLabel="Cancel favor"
        cancelLabel="Keep favor"
        destructive
        onConfirm={confirmCancel}
        onCancel={() => setCancelVisible(false)}
      />
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// 2) OrderComplete — Thank you + rating + tip + feedback (dark v.2).
// ---------------------------------------------------------------------------
const TIPS = [
  { key: '2', label: '$2.00', value: 2 },
  { key: '4', label: '$4.00', value: 4 },
  { key: '6', label: '$6.00', value: 6 },
  { key: 'other', label: 'Other', value: undefined },
] as const;

export const OrderComplete = ({ navigation }: any) => {
  const s = useStore();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [tipKey, setTipKey] = useState<string | null>(null);
  const [customTip, setCustomTip] = useState('');
  const [confirmVisible, setConfirmVisible] = useState(false);

  // "Other" accepts a real numeric amount; presets map to their fixed value.
  const isOther = tipKey === 'other';
  const presetTip = TIPS.find((t) => t.key === tipKey)?.value;
  const parsedCustom = Math.round(parseFloat(customTip) * 100) / 100;
  const customValid = isOther && !Number.isNaN(parsedCustom) && parsedCustom > 0;
  const tip = isOther ? (customValid ? parsedCustom : undefined) : presetTip;

  // Block submit until rated, and until "Other" has a valid amount.
  const canSubmit = rating > 0 && (!isOther || customValid);

  const doSubmit = () => {
    s.rateFavor(rating, feedback, tip);
    navigation.navigate('Tabs');
  };

  // A tip is an additional post-payment charge — confirm it explicitly first.
  const onSubmit = () => {
    if (tip && tip > 0) setConfirmVisible(true);
    else doSubmit();
  };

  const hr = <View style={[styles.hr, { backgroundColor: DARK.border }]} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: DARK.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: tokens.spacing.lg }} keyboardShouldPersistTaps="handled">
          <Txt variant="display" center color={DARK.text}>Thank You!</Txt>
          <Txt variant="h4" center color={DARK.textSecondary} style={{ marginTop: tokens.spacing.base }}>
            Favor Pal has completed your favor.
          </Txt>

          <Image
            source={require('../../assets/img/tracking/celebration.png')}
            style={{ width: '100%', height: 300, resizeMode: 'contain', marginTop: tokens.spacing.lg }}
          />

          {hr}

          {/* Rating */}
          <View style={styles.ratingRow}>
            <Txt variant="h4" color={DARK.text}>Rating</Txt>
            <StarRating value={rating} size={28} onChange={setRating} />
          </View>

          {hr}

          {/* Tip */}
          <Txt variant="h4" color={DARK.text}>Great Pal? Consider giving a tip!</Txt>
          <View style={styles.tipRow}>
            {TIPS.map((t) => {
              const active = tipKey === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  activeOpacity={0.8}
                  onPress={() => { setTipKey(t.key); if (t.key !== 'other') setCustomTip(''); }}
                  style={[styles.tipChip, { backgroundColor: active ? WHITE : DARK.raised }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t.key === 'other' ? 'Other tip amount' : `Tip ${t.label}`}
                >
                  <Txt variant="body" color={active ? DARK.ctaText : DARK.text}>{t.label}</Txt>
                </TouchableOpacity>
              );
            })}
          </View>

          {isOther ? (
            <View style={{ marginTop: tokens.spacing.base }}>
              <View style={[styles.darkField, { backgroundColor: DARK.raised, borderColor: DARK.border }]}>
                <Ionicons name="cash-outline" size={18} color={DARK.textTertiary} style={{ marginRight: 8 }} />
                <TextInput
                  style={{ flex: 1, color: DARK.text, fontSize: 16 }}
                  value={customTip}
                  onChangeText={setCustomTip}
                  placeholder="Enter tip amount (e.g. 8)"
                  placeholderTextColor={DARK.textTertiary}
                  keyboardType="decimal-pad"
                />
              </View>
              {customTip.length > 0 && !customValid ? (
                <Txt variant="caption" color={RED} style={{ marginTop: 6 }}>
                  Enter a tip amount greater than $0.
                </Txt>
              ) : null}
            </View>
          ) : null}

          {hr}

          {/* Feedback */}
          <Txt variant="h4" color={DARK.text} style={{ marginBottom: tokens.spacing.md }}>
            Tell us about your experience
          </Txt>
          <View style={[styles.darkTextarea, { backgroundColor: DARK.card, borderColor: DARK.border }]}>
            <TextInput
              style={styles.textareaInput}
              value={feedback}
              onChangeText={setFeedback}
              placeholder="Please tell us about your experience"
              placeholderTextColor={DARK.textTertiary}
              multiline
              maxLength={700}
            />
          </View>
          <Txt variant="caption" color={DARK.textSecondary} style={{ textAlign: 'right', marginTop: 6 }}>
            700 characters max.
          </Txt>

          <Button
            title="SUBMIT FEEDBACK"
            variant="white"
            disabled={!canSubmit}
            onPress={onSubmit}
            style={{ marginTop: tokens.spacing.lg }}
          />

          {/* Rating is optional — never trap the member on this screen. Mirrors the
              pal-side "Maybe later" skip so either party can leave without rating. */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Tabs')}
            style={{ alignSelf: 'center', marginTop: tokens.spacing.md, paddingVertical: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Skip rating and return home"
          >
            <Txt variant="button" color={DARK.textSecondary}>Maybe later</Txt>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={confirmVisible}
        title="Add tip?"
        message={`You'll be charged an additional $${(tip ?? 0).toFixed(2)}, which goes entirely to your Pal.`}
        confirmLabel="Confirm tip"
        cancelLabel="Not now"
        onConfirm={() => { setConfirmVisible(false); doSubmit(); }}
        onCancel={() => setConfirmVisible(false)}
      />
    </SafeAreaView>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: tokens.spacing.base,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: RED,
    borderWidth: 2,
  },
  timeline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.spacing.md,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  timelineBar: {
    width: 28,
    height: 2,
    marginHorizontal: 2,
  },
  cancelPill: {
    alignSelf: 'center',
    marginTop: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  favorRow: { flexDirection: 'row', alignItems: 'center' },
  favorIcon: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaLabel: { flexDirection: 'row', alignItems: 'center', marginTop: tokens.spacing.base },
  actionRow: { flexDirection: 'row', gap: tokens.spacing.md, marginTop: tokens.spacing.xl },
  darkBtn: {
    flex: 1,
    height: 54,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 20,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
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
  darkField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  darkTextarea: {
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  textareaInput: {
    color: DARK.text,
    fontSize: 16,
    minHeight: 140,
    textAlignVertical: 'top',
    padding: 0,
  },
});
